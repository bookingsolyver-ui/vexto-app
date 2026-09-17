"use client";

import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '../../lib/supabaseClient';
import { Navigation, PowerOff, Wifi, Truck, PlusCircle, Check } from 'lucide-react';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

export default function DriverPage() {
  const [vehiclesList, setVehiclesList] = useState<any[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<any>(null);
  const [isRegisteringNew, setIsRegisteringNew] = useState(false);
  
  // Novos campos para cadastro
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newPlate, setNewPlate] = useState('');

  const [tracking, setTracking] = useState(false);
  const [sentCount, setSentCount] = useState(0);

  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const watchIdRef = useRef<number | null>(null);

  // Buscar veículos já criados na base de dados ao abrir
  useEffect(() => {
    async function fetchVehicles() {
      const { data } = await supabase.from('vehicles').select('*');
      if (data) setVehiclesList(data);
    }
    fetchVehicles();
  }, []);

  // Registar um veículo novo e selecioná-lo
  async function handleCreateNewVehicle(e: React.FormEvent) {
    e.preventDefault();
    if (!newDisplayName || !newPlate) return;

    const newId = crypto.randomUUID();
    const { error } = await supabase.from('vehicles').insert([
      { id: newId, display_name: newDisplayName, plate: newPlate, status: 'offline' }
    ]);

    if (error) {
      alert("Erro ao criar veículo: " + error.message);
    } else {
      const created = { id: newId, display_name: newDisplayName, plate: newPlate };
      setSelectedVehicle(created);
      setIsRegisteringNew(false);
    }
  }

  // Mapa e Rastreio GPS
  useEffect(() => {
    if (!tracking || !mapContainer.current || !selectedVehicle) return;
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
    if (!navigator.geolocation || !selectedVehicle) return;

    // TORNA O VEÍCULO ONLINE NO SUPABASE AO INICIAR TURNO
    await supabase.from('vehicles').update({ status: 'online' }).eq('id', selectedVehicle.id);

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

        await supabase.from('vehicle_positions').insert({
          vehicle_id: selectedVehicle.id, 
          lat: latitude, 
          lng: longitude,
          heading: heading ?? null, 
          speed_kmh: speed ? speed * 3.6 : null,
          updated_at: new Date().toISOString(),
        });

        setSentCount((n) => n + 1);
      },
      (err) => console.error(err),
      { enableHighAccuracy: true }
    );
    setTracking(true);
  }

  // TORNA O VEÍCULO OFFLINE AUTOMATICAMENTE AO FECHAR OU SAIR
  async function stopTracking() {
    if (selectedVehicle) {
      await supabase.from('vehicles').update({ status: 'offline' }).eq('id', selectedVehicle.id);
    }
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    setTracking(false);
    setSelectedVehicle(null);
  }

  // Ecrã 1: Escolher veículo existente ou criar novo
  if (!selectedVehicle) {
    return (
      <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 font-sans gap-6">
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Vexto Driver</h1>
          <p className="text-zinc-500 text-sm">Seleciona o teu veículo ou cadastra um novo</p>
        </div>

        {isRegisteringNew ? (
          <form onSubmit={handleCreateNewVehicle} className="w-full max-w-sm flex flex-col gap-4 bg-zinc-900/80 p-6 rounded-2xl border border-zinc-800">
            <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-400">Novo Veículo</h2>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-zinc-400">Nome / Equipa</label>
              <input type="text" placeholder="Ex: E-Bus Luanda" value={newDisplayName} onChange={e => setNewDisplayName(e.target.value)} className="p-3 bg-black border border-zinc-700 rounded-xl text-white outline-none focus:border-emerald-500 text-sm" required />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-zinc-400">Matrícula</label>
              <input type="text" placeholder="Ex: LD-02-45" value={newPlate} onChange={e => setNewPlate(e.target.value)} className="p-3 bg-black border border-zinc-700 rounded-xl text-white outline-none focus:border-emerald-500 text-sm" required />
            </div>
            <div className="flex gap-2 mt-2">
              <button type="button" onClick={() => setIsRegisteringNew(false)} className="flex-1 py-3 bg-zinc-800 text-zinc-300 font-bold rounded-xl text-xs">VOLTAR</button>
              <button type="submit" className="flex-1 py-3 bg-emerald-500 text-black font-bold rounded-xl text-xs">CRIAR</button>
            </div>
          </form>
        ) : (
          <div className="w-full max-w-sm flex flex-col gap-4">
            <div className="max-h-60 overflow-y-auto flex flex-col gap-2 pr-1">
              {vehiclesList.map(v => (
                <button key={v.id} onClick={() => setSelectedVehicle(v)} className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl flex justify-between items-center hover:border-emerald-500 transition-all text-left">
                  <div>
                    <div className="font-bold text-sm text-white">{v.display_name}</div>
                    <div className="text-zinc-500 text-[10px] mt-0.5 uppercase tracking-widest">{v.plate}</div>
                  </div>
                  <Truck className="w-4 h-4 text-emerald-400" />
                </button>
              ))}
            </div>

            <button onClick={() => setIsRegisteringNew(true)} className="w-full py-4 bg-zinc-900 border border-dashed border-zinc-700 rounded-xl flex items-center justify-center gap-2 text-emerald-400 text-xs font-bold hover:bg-zinc-800 transition-all">
              <PlusCircle className="w-4 h-4" /> CADASTRAR NOVO VEÍCULO
            </button>
          </div>
        )}
      </main>
    );
  }

  // Ecrã 2: Botão de Iniciar Turno
  if (!tracking) {
    return (
      <main className="min-h-screen bg-black text-white flex flex-col items-center justify-between p-8 font-sans">
        <div className="flex flex-col items-center gap-2 mt-8">
          <h1 className="text-xl font-medium tracking-tight">Vexto Mobile</h1>
          <p className="text-emerald-400 text-xs tracking-widest uppercase font-bold">{selectedVehicle.display_name} ({selectedVehicle.plate})</p>
        </div>
        <button onClick={startTracking} className="w-48 h-48 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex flex-col items-center justify-center gap-3 shadow-[0_0_60px_rgba(34,197,94,0.2)]">
          <Navigation className="w-8 h-8 text-emerald-400" />
          <span className="text-lg font-medium tracking-tight text-emerald-400">INICIAR TURNO</span>
        </button>
        <button onClick={() => setSelectedVehicle(null)} className="text-zinc-600 text-xs mb-4 underline">Mudar de Veículo</button>
      </main>
    );
  }

  // Ecrã 3: Em Rastreio Ativo
  return (
    <main className="relative w-screen h-screen overflow-hidden bg-black font-sans">
      <div ref={mapContainer} className="absolute inset-0 w-full h-full z-0" />
      <div className="absolute bottom-6 inset-x-4 z-10 flex items-center justify-between bg-zinc-900/90 backdrop-blur-md border border-white/10 p-4 rounded-2xl shadow-2xl">
        <div className="flex items-center gap-2">
          <Wifi className="w-4 h-4 text-emerald-400 animate-pulse" />
          <span className="text-xs text-white font-medium">{sentCount} pacotes enviados</span>
        </div>
        <button onClick={stopTracking} className="flex items-center gap-2 bg-red-500/20 border border-red-500/40 text-red-400 px-4 py-2.5 rounded-xl text-xs font-bold">
          <PowerOff className="w-4 h-4" /> FECHAR / SAIR
        </button>
      </div>
    </main>
  );
}