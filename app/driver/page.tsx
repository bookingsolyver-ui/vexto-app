"use client";

import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '../../lib/supabaseClient';
import { Navigation, AlertCircle, Package } from 'lucide-react';

const MEU_VEICULO_ID = "a708d088-4dff-4a95-8475-854b76a5295a"; 
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

export default function DriverMapPage() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  
  const [tracking, setTracking] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<any>(null);
  const [activeOrder, setActiveOrder] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  
  const watchIdRef = useRef<number | null>(null);

  // 1. Inicializar o Mapa do Mapbox no Telemóvel
  useEffect(() => {
    if (!mapContainer.current) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-9.3235, 38.6826], // Coordenadas iniciais (Oeiras)
      zoom: 14,
    });

    return () => {
      map.current?.remove();
    };
  }, []);

  // 2. Escutar Entregas Pendentes
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

  // 3. Aceitar Entrega e Desenhar Linha no Mapa
  async function handleAcceptOrder() {
    if (!pendingOrder) return;

    await supabase
      .from('deliveries')
      .update({ status: 'in_progress', driver_id: MEU_VEICULO_ID })
      .eq('id', pendingOrder.id);

    setActiveOrder(pendingOrder);
    setPendingOrder(null);
    startTracking();

    // Desenhar a rota simulada no mapa do telemóvel
    if (map.current) {
      // Exemplo de coordenadas de rota entre Oeiras e Lisboa/Outro ponto
      const routeGeoJSON: any = {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [
            [-9.3235, 38.6826], // Ponto atual
            [-9.2000, 38.7100], // Destino intermédio
            [-9.1393, 38.7223]  // Destino final
          ]
        }
      };

      if (map.current.getSource('driver-route')) {
        (map.current.getSource('driver-route') as mapboxgl.GeoJSONSource).setData(routeGeoJSON);
      } else {
        map.current.addSource('driver-route', { type: 'geojson', data: routeGeoJSON });
        map.current.addLayer({
          id: 'driver-route-line',
          type: 'line',
          source: 'driver-route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#22c55e', 'line-width': 6, 'line-opacity': 0.9 }
        });
      }
    }
  }

  // 4. GPS e Transmissão
  function startTracking() {
    if (!navigator.geolocation) {
      setError('Geolocalização não suportada.');
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude, longitude, heading, speed } = pos.coords;

        // Atualizar mapa para centrar no motorista
        map.current?.flyTo({ center: [longitude, latitude], zoom: 15 });

        // Enviar para Supabase
        await supabase.from('vehicle_positions').insert({
          vehicle_id: MEU_VEICULO_ID,
          lat: latitude,
          lng: longitude,
          heading: heading ?? null,
          speed_kmh: speed ? speed * 3.6 : null,
          updated_at: new Date().toISOString(),
        });

        await supabase.from('vehicles').update({ 
          status: 'online', 
          last_update: new Date().toISOString() 
        }).eq('id', MEU_VEICULO_ID);
      },
      (err) => setError(err.message),
      { enableHighAccuracy: true }
    );
    setTracking(true);
  }

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-black font-sans">
      
      {/* MAPA EM TELA CHEIA */}
      <div ref={mapContainer} className="absolute inset-0 w-full h-full z-0" />

      {/* PAINEL FLUTUANTE DE PEDIDOS (TOPO) */}
      <div className="absolute top-4 inset-x-4 z-10 flex flex-col gap-2">
        {pendingOrder && !activeOrder && (
          <div className="bg-zinc-900/90 backdrop-blur-md border border-amber-500/40 p-4 rounded-2xl shadow-2xl flex flex-col gap-3">
            <div className="flex items-center gap-2 text-amber-400 font-medium text-sm">
              <Package className="w-5 h-5" /> Nova Entrega Disponível
            </div>
            <p className="text-xs text-white/80"><b>Destino:</b> {pendingOrder.dropoff_address || 'Oeiras Parque'}</p>
            <button
              onClick={handleAcceptOrder}
              className="bg-emerald-500 hover:bg-emerald-600 text-black font-bold py-3 rounded-xl text-sm transition-all shadow-lg"
            >
              ACEITAR E VER ROTA
            </button>
          </div>
        )}

        {activeOrder && (
          <div className="bg-zinc-900/90 backdrop-blur-md border border-emerald-500/40 p-3 rounded-xl shadow-xl flex justify-between items-center">
            <span className="text-emerald-400 text-xs font-semibold">🟢 Em Rota para o Destino</span>
            <span className="text-[10px] text-zinc-400">GPS Ativo</span>
          </div>
        )}
      </div>

      {/* ESTADO DO GPS (EMBAIXO) */}
      <div className="absolute bottom-6 inset-x-4 z-10 flex justify-between items-center bg-zinc-900/80 backdrop-blur-md border border-white/10 p-4 rounded-2xl">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${tracking ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-500'}`} />
          <span className="text-xs text-white font-medium">{tracking ? 'Navegação Ativa' : 'Em Espera'}</span>
        </div>
        {error && <span className="text-xs text-red-400 flex items-center gap-1"><AlertCircle className="w-4 h-4"/>{error}</span>}
      </div>

    </main>
  );
}