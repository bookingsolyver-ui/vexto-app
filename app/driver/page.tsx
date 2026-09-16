"use client";

import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '../../lib/supabaseClient';
import { Navigation, AlertCircle, Package, PowerOff, Wifi } from 'lucide-react';

const MEU_VEICULO_ID = "a708d088-4dff-4a95-8475-854b76a5295a"; 
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

export default function DriverPage() {
  const [tracking, setTracking] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<any>(null);
  const [activeOrder, setActiveOrder] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [sentCount, setSentCount] = useState(0);

  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const watchIdRef = useRef<number | null>(null);

  // Inicializar o mapa e o marcador do motorista
  useEffect(() => {
    if (!tracking || !mapContainer.current) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-9.3235, 38.6826],
      zoom: 15,
    });

    return () => {
      if (markerRef.current) markerRef.current.remove();
      map.current?.remove();
      map.current = null;
    };
  }, [tracking]);

  // Escutar encomendas pendentes
  useEffect(() => {
    async function fetchOrder() {
      const { data } = await supabase
        .from('deliveries')
        .select('*')
        .eq('status', 'pending')
        .limit(1);
      if (data && data.length > 0) setPendingOrder(data[0]);
    }
    fetchOrder();

    const channel = supabase
      .channel('driver-deliveries')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'deliveries' }, (payload) => {
        if (payload.new.status === 'pending') setPendingOrder(payload.new);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Iniciar Turno, GPS e Ponto Verde no Mapa
  function startTracking() {
    if (!navigator.geolocation) {
      setError('Geolocalização não suportada.');
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude, longitude, heading, speed } = pos.coords;

        if (map.current) {
          map.current.flyTo({ center: [longitude, latitude], zoom: 15 });

          // Criar ou atualizar o ponto verde do motorista no mapa
          if (!markerRef.current) {
            const el = document.createElement('div');
            el.className = 'w-5 h-5 bg-emerald-500 rounded-full border-2 border-white shadow-[0_0_15px_rgba(34,197,94,0.9)] animate-pulse';
            markerRef.current = new mapboxgl.Marker(el)
              .setLngLat([longitude, latitude])
              .addTo(map.current);
          } else {
            markerRef.current.setLngLat([longitude, latitude]);
          }
        }

        const { error: insertError } = await supabase.from('vehicle_positions').insert({
          vehicle_id: MEU_VEICULO_ID,
          lat: latitude,
          lng: longitude,
          heading: heading ?? null,
          speed_kmh: speed ? speed * 3.6 : null,
          updated_at: new Date().toISOString(),
        });

        if (!insertError) {
          await supabase.from('vehicles').update({ 
            status: 'online', 
            last_update: new Date().toISOString() 
          }).eq('id', MEU_VEICULO_ID);
          setSentCount((n) => n + 1);
        }
      },
      (err) => setError(err.message),
      { enableHighAccuracy: true }
    );

    setTracking(true);
  }

  // Terminar Turno / Fechar Serviço
  function stopTracking() {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
    setTracking(false);
    setActiveOrder(null);
    supabase.from('vehicles').update({ status: 'offline' }).eq('id', MEU_VEICULO_ID);
  }

  // Aceitar Encomenda
  async function handleAcceptOrder() {
    if (!pendingOrder) return;
    await supabase
      .from('deliveries')
      .update({ status: 'in_progress', driver_id: MEU_VEICULO_ID })
      .eq('id', pendingOrder.id);

    setActiveOrder(pendingOrder);
    setPendingOrder(null);
  }

  // ==========================================
  // ESTADO 1: TURNO DESLIGADO (Ecrã Inicial)
  // ==========================================
  if (!tracking) {
    return (
      <main className="min-h-screen bg-black text-white flex flex-col items-center justify-between p-8 font-sans">
        <div className="flex flex-col items-center gap-2 mt-8">
          <h1 className="text-xl font-medium tracking-tight">Vexto Mobile</h1>
          <p className="text-zinc-500 text-xs tracking-widest uppercase">Motorista — Bus 6023</p>
        </div>

        <button
          onClick={startTracking}
          className="w-48 h-48 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex flex-col items-center justify-center gap-3 shadow-[0_0_60px_rgba(34,197,94,0.2)] hover:bg-emerald-500/20 transition-all duration-500"
        >
          <Navigation className="w-8 h-8 text-emerald-400" />
          <span className="text-lg font-medium tracking-tight text-emerald-400">INICIAR TURNO</span>
        </button>

        <div className="text-zinc-600 text-xs mb-4">Toque para ligar o GPS e abrir o serviço</div>
      </main>
    );
  }

  // ==========================================
  // ESTADO 2: TURNO ATIVO (Mapa + Ponto Verde + Pedidos)
  // ==========================================
  return (
    <main className="relative w-screen h-screen overflow-hidden bg-black font-sans">
      
      {/* Mapa Mapbox em Tela Cheia */}
      <div ref={mapContainer} className="absolute inset-0 w-full h-full z-0" />

      {/* Topo: Pedidos Pendentes ou Entrega Ativa */}
      <div className="absolute top-4 inset-x-4 z-10 flex flex-col gap-2">
        {pendingOrder && !activeOrder && (
          <div className="bg-zinc-900/95 backdrop-blur-md border border-amber-500/40 p-4 rounded-2xl shadow-2xl flex flex-col gap-3">
            <div className="flex items-center gap-2 text-amber-400 font-medium text-sm">
              <Package className="w-5 h-5" /> Nova Entrega Disponível
            </div>
            <p className="text-xs text-white/80"><b>Destino:</b> {pendingOrder.dropoff_address || 'Oeiras Parque'}</p>
            <button
              onClick={handleAcceptOrder}
              className="bg-emerald-500 hover:bg-emerald-600 text-black font-bold py-3 rounded-xl text-sm transition-all shadow-lg"
            >
              ACEITAR ENTREGA
            </button>
          </div>
        )}

        {activeOrder && (
          <div className="bg-zinc-900/95 backdrop-blur-md border border-emerald-500/40 p-3 rounded-xl shadow-xl flex justify-between items-center">
            <span className="text-emerald-400 text-xs font-semibold">🟢 Em Rota: {activeOrder.dropoff_address}</span>
          </div>
        )}
      </div>

      {/* Fundo: Contadores e Fechar Serviço */}
      <div className="absolute bottom-6 inset-x-4 z-10 flex items-center justify-between bg-zinc-900/90 backdrop-blur-md border border-white/10 p-4 rounded-2xl shadow-2xl">
        <div className="flex items-center gap-2">
          <Wifi className="w-4 h-4 text-emerald-400 animate-pulse" />
          <span className="text-xs text-white font-medium">{sentCount} pacotes enviados</span>
        </div>

        <button
          onClick={stopTracking}
          className="flex items-center gap-2 bg-red-500/20 border border-red-500/40 hover:bg-red-500/30 text-red-400 px-4 py-2.5 rounded-xl text-xs font-bold transition-all"
        >
          <PowerOff className="w-4 h-4" />
          FECHAR SERVIÇO
        </button>
      </div>

    </main>
  );
}