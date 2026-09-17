"use client";

import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '../../lib/supabaseClient';
import { Navigation, Package, PowerOff, Wifi, Camera, CheckCircle2 } from 'lucide-react';

const MEU_VEICULO_ID = "a708d088-4dff-4a95-8475-854b76a5295a"; 
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

export default function DriverPage() {
  const [tracking, setTracking] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<any>(null);
  const [activeOrder, setActiveOrder] = useState<any>(null);
  
  // Estados para a Prova de Entrega (Câmera)
  const [isArrived, setIsArrived] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [sentCount, setSentCount] = useState(0);

  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!tracking || !mapContainer.current) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-9.3235, 38.6826],
      zoom: 15,
    });

    map.current.on('load', () => {
      if (!map.current) return;
      if (!map.current.getSource('route')) {
        map.current.addSource('route', {
          type: 'geojson',
          data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } }
        });
        map.current.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#22c55e', 'line-width': 6, 'line-opacity': 0.9 } // Linha VERDE
        });
      }
    });

    return () => {
      if (markerRef.current) markerRef.current.remove();
      map.current?.remove();
      map.current = null;
    };
  }, [tracking]);

  useEffect(() => {
    async function fetchOrder() {
      const { data } = await supabase.from('deliveries').select('*').eq('status', 'pending').limit(1);
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

  function startTracking() {
    if (!navigator.geolocation) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude, longitude, heading, speed } = pos.coords;

        if (map.current) {
          if (!markerRef.current) {
            const el = document.createElement('div');
            el.className = 'w-5 h-5 bg-emerald-500 rounded-full border-2 border-white shadow-[0_0_15px_rgba(34,197,94,0.9)] animate-pulse';
            markerRef.current = new mapboxgl.Marker(el).setLngLat([longitude, latitude]).addTo(map.current);
          } else {
            markerRef.current.setLngLat([longitude, latitude]);
          }
        }

        await supabase.from('vehicle_positions').insert({
          vehicle_id: MEU_VEICULO_ID, lat: latitude, lng: longitude,
          heading: heading ?? null, speed_kmh: speed ? speed * 3.6 : null,
          updated_at: new Date().toISOString(),
        });
        await supabase.from('vehicles').update({ status: 'online', last_update: new Date().toISOString() }).eq('id', MEU_VEICULO_ID);
        setSentCount((n) => n + 1);
      },
      (err) => console.error(err),
      { enableHighAccuracy: true }
    );
    setTracking(true);
  }

  function stopTracking() {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    setTracking(false);
    setActiveOrder(null);
    setIsArrived(false);
    setPhotoPreview(null);
    supabase.from('vehicles').update({ status: 'offline' }).eq('id', MEU_VEICULO_ID);
  }

  // Direções Mapbox para seguir ruas reais
  async function fetchRoute(startLng: number, startLat: number, endLng: number, endLat: number) {
    try {
      const query = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${startLng},${startLat};${endLng},${endLat}?geometries=geojson&access_token=${MAPBOX_TOKEN}`);
      const json = await query.json();
      if (json.routes && json.routes.length > 0) {
        if (map.current) {
          const source = map.current.getSource('route') as mapboxgl.GeoJSONSource;
          if (source) source.setData({ type: 'Feature', properties: {}, geometry: json.routes[0].geometry } as any);
          
          const coords = json.routes[0].geometry.coordinates;
          const bounds = new mapboxgl.LngLatBounds();
          coords.forEach((coord: [number, number]) => bounds.extend(coord));
          map.current.fitBounds(bounds, { padding: 80, maxZoom: 15 });
        }
      }
    } catch (e) { console.error("Erro na rota", e); }
  }

  async function handleAcceptOrder() {
    if (!pendingOrder) return;
    await supabase.from('deliveries').update({ status: 'in_progress', driver_id: MEU_VEICULO_ID }).eq('id', pendingOrder.id);
    setActiveOrder(pendingOrder);
    setPendingOrder(null);

    if (map.current && markerRef.current) {
      const pos = markerRef.current.getLngLat();
      const dropoffLng = pendingOrder.dropoff_lng || -9.3000;
      const dropoffLat = pendingOrder.dropoff_lat || 38.7070;
      fetchRoute(pos.lng, pos.lat, dropoffLng, dropoffLat);
    }
  }

  function handlePhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      const imageUrl = URL.createObjectURL(file);
      setPhotoPreview(imageUrl);
    }
  }

  async function handleFinishDelivery() {
    if (!activeOrder) return;
    await supabase.from('deliveries').update({ status: 'completed' }).eq('id', activeOrder.id);
    
    if (map.current) {
      const source = map.current.getSource('route') as mapboxgl.GeoJSONSource;
      if (source) source.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } } as any);
      map.current.flyTo({ zoom: 15 });
    }

    setActiveOrder(null);
    setIsArrived(false);
    setPhotoPreview(null);
  }

  if (!tracking) {
    return (
      <main className="min-h-screen bg-black text-white flex flex-col items-center justify-between p-8 font-sans">
        <div className="flex flex-col items-center gap-2 mt-8">
          <h1 className="text-xl font-medium tracking-tight">Vexto Mobile</h1>
          <p className="text-zinc-500 text-xs tracking-widest uppercase">Motorista — Bus 6023</p>
        </div>
        <button onClick={startTracking} className="w-48 h-48 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex flex-col items-center justify-center gap-3 shadow-[0_0_60px_rgba(34,197,94,0.2)] hover:bg-emerald-500/20 transition-all">
          <Navigation className="w-8 h-8 text-emerald-400" />
          <span className="text-lg font-medium tracking-tight text-emerald-400">INICIAR TURNO</span>
        </button>
        <div className="text-zinc-600 text-xs mb-4">Toque para ligar o GPS e abrir o serviço</div>
      </main>
    );
  }

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-black font-sans">
      <div ref={mapContainer} className="absolute inset-0 w-full h-full z-0" />

      {isArrived && (
        <div className="absolute inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-6 gap-6 backdrop-blur-md">
          <h2 className="text-2xl font-bold text-white">Prova de Entrega</h2>
          <p className="text-zinc-400 text-center text-sm">Tira uma foto à encomenda ou ao local para comprovares a entrega.</p>
          
          {photoPreview ? (
            <img src={photoPreview} alt="Comprovativo" className="w-full max-h-[50vh] object-cover rounded-2xl border-2 border-emerald-500 shadow-2xl" />
          ) : (
            <label className="w-full max-w-sm aspect-square bg-zinc-800 border-2 border-dashed border-zinc-600 rounded-3xl flex flex-col items-center justify-center gap-4 cursor-pointer hover:bg-zinc-700 transition-all">
              <Camera className="w-16 h-16 text-zinc-400" />
              <span className="text-zinc-300 font-medium">Abrir Câmera</span>
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoCapture} />
            </label>
          )}

          <button 
            onClick={handleFinishDelivery}
            disabled={!photoPreview}
            className={`w-full max-w-sm py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all shadow-xl ${photoPreview ? 'bg-emerald-500 hover:bg-emerald-600 text-black' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'}`}
          >
            <CheckCircle2 className="w-6 h-6" />
            FINALIZAR ENTREGA
          </button>
        </div>
      )}

      {!isArrived && (
        <div className="absolute top-4 inset-x-4 z-10 flex flex-col gap-2">
          {pendingOrder && !activeOrder && (
            <div className="bg-zinc-900/95 backdrop-blur-md border border-amber-500/40 p-4 rounded-2xl shadow-2xl flex flex-col gap-3">
              <div className="flex items-center gap-2 text-amber-400 font-medium text-sm">
                <Package className="w-5 h-5" /> Nova Entrega Disponível
              </div>
              <p className="text-xs text-white/80"><b>Destino:</b> {pendingOrder.dropoff_address || 'Oeiras Parque'}</p>
              <button onClick={handleAcceptOrder} className="bg-emerald-500 text-black font-bold py-3 rounded-xl text-sm shadow-lg">ACEITAR ENTREGA</button>
            </div>
          )}

          {activeOrder && (
            <div className="bg-zinc-900/95 backdrop-blur-md border border-emerald-500/40 p-4 rounded-2xl shadow-xl flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <span className="text-emerald-400 text-sm font-bold flex items-center gap-2">
                  <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" /> Em Rota
                </span>
                <span className="text-xs text-zinc-400">{activeOrder.dropoff_address}</span>
              </div>
              <button 
                onClick={() => setIsArrived(true)} 
                className="bg-white text-black hover:bg-zinc-200 font-bold py-3 rounded-xl text-sm transition-all"
              >
                CHEGUEI AO DESTINO
              </button>
            </div>
          )}
        </div>
      )}

      <div className="absolute bottom-6 inset-x-4 z-10 flex items-center justify-between bg-zinc-900/90 backdrop-blur-md border border-white/10 p-4 rounded-2xl shadow-2xl">
        <div className="flex items-center gap-2">
          <Wifi className="w-4 h-4 text-emerald-400 animate-pulse" />
          <span className="text-xs text-white font-medium">{sentCount} pacotes</span>
        </div>
        <button onClick={stopTracking} className="flex items-center gap-2 bg-red-500/20 border border-red-500/40 text-red-400 px-4 py-2.5 rounded-xl text-xs font-bold">
          <PowerOff className="w-4 h-4" /> FECHAR SERVIÇO
        </button>
      </div>
    </main>
  );
}