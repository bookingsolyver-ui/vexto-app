"use client";

import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '../../lib/supabaseClient';
import { Navigation, Package, PowerOff, Wifi, Camera, CheckCircle2, Truck } from 'lucide-react';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

export default function DriverPage() {
  const [driverName, setDriverName] = useState('');
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [plate, setPlate] = useState('');

  const [registered, setRegistered] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<any>(null);
  const [activeOrder, setActiveOrder] = useState<any>(null);
  
  const [isArrived, setIsArrived] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [sentCount, setSentCount] = useState(0);

  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const watchIdRef = useRef<number | null>(null);

  // Gera ou recupera um UUID único para este telemóvel específico
  useEffect(() => {
    let storedId = localStorage.getItem('vexto_driver_id');
    if (!storedId) {
      storedId = crypto.randomUUID();
      localStorage.setItem('vexto_driver_id', storedId);
    }
    setVehicleId(storedId);
  }, []);

  // Regista o veículo automaticamente no Supabase
  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!driverName || !plate || !vehicleId) return;

    const { error } = await supabase.from('vehicles').upsert([
      { id: vehicleId, display_name: driverName, plate: plate, status: 'online' }
    ], { onConflict: 'id' });

    if (error) {
      alert("Erro ao registar: " + error.message);
    } else {
      setRegistered(true);
    }
  }

  useEffect(() => {
    if (!tracking || !mapContainer.current || !vehicleId) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-9.3235, 38.6826],
      zoom: 15,
    });

    map.current.on('load', () => {
      if (!map.current) return;
      navigator.geolocation.getCurrentPosition((pos) => {
        if (map.current) {
          map.current.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 15, essential: true });
        }
      });
    });

    return () => {
      if (markerRef.current) markerRef.current.remove();
      map.current?.remove();
      map.current = null;
    };
  }, [tracking]);

  async function startTracking() {
    if (!navigator.geolocation || !vehicleId) return;

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
          map.current.easeTo({ center: [longitude, latitude], duration: 1000 });
        }

        // Insere a nova posição única deste telemóvel
        const { error } = await supabase.from('vehicle_positions').insert({
          vehicle_id: vehicleId, 
          lat: latitude, 
          lng: longitude,
          heading: heading ?? null, 
          speed_kmh: speed ? speed * 3.6 : null,
          updated_at: new Date().toISOString(),
        });

        if (!error) setSentCount((n) => n + 1);
      },
      (err) => console.error(err),
      { enableHighAccuracy: true }
    );
    setTracking(true);
  }

  function stopTracking() {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    setTracking(false);
  }

  if (!registered) {
    return (
      <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8 font-sans gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Vexto Driver</h1>
          <p className="text-zinc-500 text-sm">Insere os dados do teu veículo/equipa</p>
        </div>
        <form onSubmit={handleRegister} className="w-full max-w-sm flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-zinc-400 uppercase tracking-widest">Nome do Veículo / Equipa</label>
            <input 
              type="text" 
              placeholder="Ex: E-Bus Angola" 
              value={driverName} 
              onChange={e => setDriverName(e.target.value)}
              className="p-4 bg-zinc-900 border border-zinc-700 rounded-xl text-white outline-none focus:border-emerald-500"
              required 
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-zinc-400 uppercase tracking-widest">Matrícula / Placa</label>
            <input 
              type="text" 
              placeholder="Ex: L 34654" 
              value={plate} 
              onChange={e => setPlate(e.target.value)}
              className="p-4 bg-zinc-900 border border-zinc-700 rounded-xl text-white outline-none focus:border-emerald-500"
              required 
            />
          </div>
          <button type="submit" className="w-full py-4 bg-emerald-500 text-black font-bold rounded-xl mt-2 hover:bg-emerald-400 transition-all">
            REGISTAR E ENTRAR
          </button>
        </form>
      </main>
    );
  }

  if (!tracking) {
    return (
      <main className="min-h-screen bg-black text-white flex flex-col items-center justify-between p-8 font-sans">
        <div className="flex flex-col items-center gap-2 mt-8">
          <h1 className="text-xl font-medium tracking-tight">Vexto Mobile</h1>
          <p className="text-emerald-400 text-xs tracking-widest uppercase font-bold">{driverName} ({plate})</p>
        </div>
        <button onClick={startTracking} className="w-48 h-48 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex flex-col items-center justify-center gap-3 shadow-[0_0_60px_rgba(34,197,94,0.2)]">
          <Navigation className="w-8 h-8 text-emerald-400" />
          <span className="text-lg font-medium tracking-tight text-emerald-400">INICIAR TURNO</span>
        </button>
        <button onClick={() => setRegistered(false)} className="text-zinc-600 text-xs mb-4 underline">Alterar Dados</button>
      </main>
    );
  }

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-black font-sans">
      <div ref={mapContainer} className="absolute inset-0 w-full h-full z-0" />
      <div className="absolute bottom-6 inset-x-4 z-10 flex items-center justify-between bg-zinc-900/90 backdrop-blur-md border border-white/10 p-4 rounded-2xl shadow-2xl">
        <div className="flex items-center gap-2">
          <Wifi className="w-4 h-4 text-emerald-400 animate-pulse" />
          <span className="text-xs text-white font-medium">{sentCount} pacotes enviados</span>
        </div>
        <button onClick={stopTracking} className="flex items-center gap-2 bg-red-500/20 border border-red-500/40 text-red-400 px-4 py-2.5 rounded-xl text-xs font-bold">
          <PowerOff className="w-4 h-4" /> FECHAR
        </button>
      </div>
    </main>
  );
}