"use client";

import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '../../lib/supabaseClient'; 
import { Navigation, PowerOff, Wifi, Truck, PlusCircle, Signal, Package, MapPin, CheckCircle2 } from 'lucide-react';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

export default function DriverPage() {
  const [vehiclesList, setVehiclesList] = useState<any[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<any>(null);
  const [isRegisteringNew, setIsRegisteringNew] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newPlate, setNewPlate] = useState('');
  const [tracking, setTracking] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [activeDelivery, setActiveDelivery] = useState<any>(null);
  
  const [currentLocation, setCurrentLocation] = useState<{lat: number, lng: number} | null>(null);
  const [routeGeoJSON, setRouteGeoJSON] = useState<any>(null);
  const [destCoords, setDestCoords] = useState<[number, number] | null>(null);
  const fetchedRouteId = useRef<string | null>(null);

  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const destMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    async function fetchVehicles() {
      const { data } = await supabase.from('vehicles').select('*');
      if (data) setVehiclesList(data);
    }
    fetchVehicles();
  }, []);

  async function handleCreateNewVehicle(e: React.FormEvent) {
    e.preventDefault();
    if (!newDisplayName || !newPlate) return;
    const newId = crypto.randomUUID();
    const { error } = await supabase.from('vehicles').insert([{ id: newId, display_name: newDisplayName, plate: newPlate, status: 'offline' }]);
    if (error) {
      alert("Erro ao criar veículo: " + error.message);
    } else {
      setSelectedVehicle({ id: newId, display_name: newDisplayName, plate: newPlate });
      setIsRegisteringNew(false);
    }
  }

  useEffect(() => {
    if (!tracking || !mapContainer.current || !selectedVehicle) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-9.3235, 38.6826],
      zoom: 16,
      pitch: 60,
      bearing: -20,
      antialias: true
    });

    map.current.on('style.load', () => {
      if (!map.current) return;
      const layers = map.current.getStyle().layers;
      const labelLayerId = layers?.find((layer) => layer.type === 'symbol' && layer.layout && layer.layout['text-field'])?.id;
      
      map.current.addLayer({
          'id': '3d-buildings',
          'source': 'composite',
          'source-layer': 'building',
          'filter': ['==', 'extrude', 'true'],
          'type': 'fill-extrusion',
          'minzoom': 15,
          'paint': {
            'fill-extrusion-color': '#1f1f1f',
            'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.05, ['get', 'height']],
            'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.05, ['get', 'min_height']],
            'fill-extrusion-opacity': 0.7
          }
        }, labelLayerId);
    });

    return () => {
      if (markerRef.current) markerRef.current.remove();
      if (destMarkerRef.current) destMarkerRef.current.remove();
      map.current?.remove();
      map.current = null;
    };
  }, [tracking]);

  useEffect(() => {
    if (!tracking || !selectedVehicle) return;
    const fetchDelivery = async () => {
      const { data } = await supabase.from('deliveries').select('*').eq('driver_id', selectedVehicle.id).eq('status', 'in_progress').maybeSingle();
      setActiveDelivery(data || null);
    };
    fetchDelivery();
    const channel = supabase.channel(`driver-del-${selectedVehicle.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries', filter: `driver_id=eq.${selectedVehicle.id}` },
        (payload: any) => {
          if (payload.new && payload.new.status === 'in_progress') setActiveDelivery(payload.new);
          else setActiveDelivery(null);
        }
      ).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tracking, selectedVehicle]);

  async function startTracking() {
    if (!navigator.geolocation || !selectedVehicle) return;
    await supabase.from('vehicles').update({ status: 'online' }).eq('id', selectedVehicle.id);

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude, longitude, heading, speed } = pos.coords;
        setCurrentLocation({ lat: latitude, lng: longitude });

        if (map.current) {
          if (!markerRef.current) {
            const el = document.createElement('div');
            el.className = 'w-6 h-6 bg-vexto-green rounded-full border-2 border-white shadow-[0_0_20px_rgba(34,197,94,1)] animate-pulse';
            markerRef.current = new mapboxgl.Marker(el).setLngLat([longitude, latitude]).addTo(map.current);
          } else {
            markerRef.current.setLngLat([longitude, latitude]);
          }
          
          if (!activeDelivery) {
            map.current.easeTo({ center: [longitude, latitude], duration: 1000 });
          }
        }

        await supabase.from('vehicle_positions').insert({
          vehicle_id: selectedVehicle.id, lat: latitude, lng: longitude,
          heading: heading ?? null, speed_kmh: speed ? speed * 3.6 : null,
          updated_at: new Date().toISOString(),
        });
        setSentCount((n) => n + 1);
      },
      (err) => console.error(err),
      { enableHighAccuracy: true }
    );
    setTracking(true);
  }

  async function stopTracking() {
    if (selectedVehicle) await supabase.from('vehicles').update({ status: 'offline' }).eq('id', selectedVehicle.id);
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    setTracking(false);
    setSelectedVehicle(null);
  }

  useEffect(() => {
    if (!activeDelivery || !activeDelivery.dropoff_address || !currentLocation) {
        if (!activeDelivery) {
            setRouteGeoJSON(null);
            setDestCoords(null);
            fetchedRouteId.current = null;
        }
        return;
    }
    if (fetchedRouteId.current === activeDelivery.id) return;

    async function fetchRoute() {
        try {
           const geoRes = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(activeDelivery.dropoff_address)}.json?access_token=${MAPBOX_TOKEN}`);
           const geoData = await geoRes.json();
           if (!geoData.features?.length) return;
           const dCoords = geoData.features[0].center; 

           const routeRes = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${currentLocation!.lng},${currentLocation!.lat};${dCoords[0]},${dCoords[1]}?geometries=geojson&access_token=${MAPBOX_TOKEN}`);
           const routeData = await routeRes.json();
           if (!routeData.routes?.length) return;

           setRouteGeoJSON(routeData.routes[0].geometry);
           setDestCoords(dCoords);
           fetchedRouteId.current = activeDelivery.id;
        } catch(e) { console.error("Erro na Rota:", e); }
    }
    fetchRoute();
  }, [activeDelivery, currentLocation]);

  useEffect(() => {
    if (!map.current) return;
    const m = map.current;

    if (routeGeoJSON) {
        if (m.getSource('route')) {
            (m.getSource('route') as mapboxgl.GeoJSONSource).setData(routeGeoJSON);
        } else {
            m.addSource('route', { type: 'geojson', data: routeGeoJSON });
            m.addLayer({
                id: 'route-layer',
                type: 'line',
                source: 'route',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': '#22c55e', 'line-width': 5, 'line-dasharray': [1, 2] }
            });
        }
    } else {
        if (m.getSource('route')) (m.getSource('route') as mapboxgl.GeoJSONSource).setData({type: 'FeatureCollection', features: []});
    }

    if (destCoords) {
        if (!destMarkerRef.current) {
            const el = document.createElement('div');
            el.innerHTML = `<div class="w-8 h-8 bg-vexto-bg border-2 border-vexto-green rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(34,197,94,0.5)]"><div class="w-3 h-3 bg-vexto-green rounded-full"></div></div>`;
            destMarkerRef.current = new mapboxgl.Marker(el).setLngLat(destCoords).addTo(m);
        } else {
            destMarkerRef.current.setLngLat(destCoords);
        }
        
        if (currentLocation) {
           const bounds = new mapboxgl.LngLatBounds().extend([currentLocation.lng, currentLocation.lat]).extend(destCoords);
           m.fitBounds(bounds, { padding: {top: 150, bottom: 300, left: 50, right: 50}, pitch: 60, maxZoom: 16 });
        }
    } else {
        if (destMarkerRef.current) { destMarkerRef.current.remove(); destMarkerRef.current = null; }
    }
  }, [routeGeoJSON, destCoords, currentLocation]);

  async function completeDelivery() {
    if (!activeDelivery) return;
    await supabase.from('deliveries').update({ status: 'completed' }).eq('id', activeDelivery.id);
    setActiveDelivery(null);
  }

  if (!selectedVehicle) {
    return (
      <main className="min-h-screen bg-vexto-bg text-white flex flex-col items-center justify-center p-6 gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10 mb-2">
            <Truck className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-3xl font-medium tracking-tight">Vexto Driver</h1>
          <p className="text-vexto-textMuted text-sm">Selecione o seu veículo de frota</p>
        </div>

        {isRegisteringNew ? (
          <form onSubmit={handleCreateNewVehicle} className="w-full max-w-sm flex flex-col gap-5 glass-panel p-6 border border-white/10">
            <h2 className="text-sm font-bold uppercase tracking-wider text-vexto-green">Registar Novo</h2>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] uppercase tracking-widest text-vexto-textMuted">Designação (Ex: Bus 6023)</label>
              <input type="text" value={newDisplayName} onChange={e => setNewDisplayName(e.target.value)} className="p-3 bg-black/40 border border-white/10 rounded-lg text-white outline-none focus:border-vexto-green text-sm transition-colors" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] uppercase tracking-widest text-vexto-textMuted">Matrícula (Ex: LD-02-45)</label>
              <input type="text" value={newPlate} onChange={e => setNewPlate(e.target.value)} className="p-3 bg-black/40 border border-white/10 rounded-lg text-white outline-none focus:border-vexto-green text-sm transition-colors uppercase" required />
            </div>
            <div className="flex gap-3 mt-4">
              <button type="button" onClick={() => setIsRegisteringNew(false)} className="flex-1 py-3 bg-white/5 text-white font-medium rounded-lg text-xs hover:bg-white/10 transition-colors border border-white/10">VOLTAR</button>
              <button type="submit" className="flex-1 py-3 bg-vexto-green text-black font-bold rounded-lg text-xs hover:bg-vexto-green/90 transition-colors">CRIAR</button>
            </div>
          </form>
        ) : (
          <div className="w-full max-w-sm flex flex-col gap-4">
            <div className="max-h-72 overflow-y-auto flex flex-col gap-3 pr-1 custom-scrollbar">
              {vehiclesList.map(v => (
                <button key={v.id} onClick={() => setSelectedVehicle(v)} className="glass-panel p-4 border border-white/5 flex justify-between items-center hover:border-vexto-green hover:bg-vexto-green/5 transition-all text-left group">
                  <div>
                    <div className="font-medium text-sm text-white group-hover:text-vexto-green transition-colors">{v.display_name}</div>
                    <div className="text-vexto-textMuted text-[10px] mt-1 uppercase tracking-widest">{v.plate}</div>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-vexto-green/20 transition-colors">
                    <Truck className="w-4 h-4 text-vexto-textMuted group-hover:text-vexto-green" />
                  </div>
                </button>
              ))}
            </div>

            <button onClick={() => setIsRegisteringNew(true)} className="w-full py-4 mt-2 bg-transparent border border-dashed border-white/20 rounded-xl flex items-center justify-center gap-2 text-vexto-textMuted text-xs font-medium hover:border-white/50 hover:text-white transition-all">
              <PlusCircle className="w-4 h-4" /> ADICIONAR VEÍCULO
            </button>
          </div>
        )}
      </main>
    );
  }

  if (!tracking) {
    return (
      <main className="min-h-screen bg-vexto-bg text-white flex flex-col items-center justify-between p-8">
        <div className="flex flex-col items-center gap-2 mt-12 text-center">
          <div className="px-3 py-1 border border-white/10 bg-white/5 rounded-full mb-4">
             <span className="text-[10px] uppercase tracking-widest text-vexto-textMuted">Telemetria Vexto</span>
          </div>
          <h1 className="text-2xl font-medium tracking-tight">{selectedVehicle.display_name}</h1>
          <p className="text-vexto-textMuted text-xs tracking-widest uppercase">{selectedVehicle.plate}</p>
        </div>

        <button onClick={startTracking} className="relative w-56 h-56 rounded-full bg-vexto-green/10 border border-vexto-green/30 flex flex-col items-center justify-center gap-4 shadow-[0_0_60px_rgba(34,197,94,0.15)] hover:scale-105 hover:bg-vexto-green/20 transition-all duration-300 group">
          <div className="absolute inset-0 rounded-full border border-vexto-green/50 animate-ping opacity-20"></div>
          <Navigation className="w-10 h-10 text-vexto-green" />
          <span className="text-lg font-medium tracking-tight text-vexto-green">INICIAR TURNO</span>
        </button>

        <button onClick={() => setSelectedVehicle(null)} className="text-vexto-textMuted text-xs mb-8 hover:text-white transition-colors border-b border-transparent hover:border-white pb-1">
          Trocar Veículo
        </button>
      </main>
    );
  }

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-vexto-bg">
      <div ref={mapContainer} className="absolute inset-0 w-full h-full z-0" />
      
      <div className="absolute top-8 inset-x-6 z-10 glass-panel p-4 border border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.5)] flex flex-col gap-3 bg-vexto-bg/90 backdrop-blur-md">
        <div className="flex justify-between items-start">
           <div>
             <h3 className="text-white text-base font-medium">{selectedVehicle.display_name}</h3>
             <span className="text-vexto-textMuted text-[10px] uppercase tracking-widest">{selectedVehicle.plate}</span>
           </div>
           <div className="px-2 py-1 bg-vexto-green/10 border border-vexto-green/30 rounded text-vexto-green text-[10px] uppercase tracking-widest font-bold flex items-center gap-2">
             <span className="w-1.5 h-1.5 rounded-full bg-vexto-green animate-pulse"></span>
             ONLINE
           </div>
        </div>
        <div className="flex justify-between items-center text-[10px] text-vexto-textMuted pt-2 border-t border-white/10">
           <span className="flex items-center gap-1"><Signal className="w-3 h-3 text-white" /> GPS Ativo</span>
           <span>Pacotes: {sentCount}</span>
        </div>
      </div>

      <div className="absolute bottom-6 inset-x-4 z-10 flex flex-col gap-3">
        {activeDelivery ? (
          <div className="glass-panel p-5 border border-amber-500/30 bg-black/80 backdrop-blur-xl shadow-[0_10px_40px_rgba(245,158,11,0.15)] rounded-2xl flex flex-col gap-4 animate-in slide-in-from-bottom-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-amber-500" />
                <span className="text-white text-sm font-bold tracking-wide uppercase">Entrega em Curso</span>
              </div>
              {routeGeoJSON && <span className="text-vexto-green text-[10px] uppercase tracking-widest font-bold border border-vexto-green/30 px-2 py-1 rounded bg-vexto-green/10">Rota Calculada</span>}
            </div>
            
            <div className="flex flex-col gap-1 pl-7">
              <span className="text-white text-base leading-tight">{activeDelivery.dropoff_address || 'Sem Morada Registada'}</span>
              <span className="text-vexto-textMuted text-xs flex items-center gap-1 mt-1">
                 Cliente: <strong className="text-white font-medium">{activeDelivery.customer || 'Sem Nome'}</strong>
              </span>
            </div>

            <button onClick={completeDelivery} className="mt-2 w-full flex items-center justify-center gap-2 bg-vexto-green text-black px-4 py-3 rounded-xl hover:bg-vexto-green/90 transition-all font-bold text-sm shadow-[0_0_20px_rgba(34,197,94,0.3)]">
              <CheckCircle2 className="w-5 h-5" /> CONCLUIR ENTREGA
            </button>
          </div>
        ) : (
          <div className="glass-panel p-4 border border-white/10 bg-black/60 backdrop-blur-xl rounded-2xl flex items-center justify-center gap-2 text-vexto-textMuted font-medium text-sm">
            <Wifi className="w-4 h-4" /> A Aguardar Despacho...
          </div>
        )}

        <button onClick={stopTracking} className="w-full glass-panel flex items-center justify-center gap-3 bg-vexto-red/10 hover:bg-vexto-red/20 border border-vexto-red/30 text-vexto-red px-4 py-4 rounded-2xl transition-all duration-300">
          <PowerOff className="w-5 h-5" />
          <span className="text-sm font-bold tracking-wider">TERMINAR TURNO</span>
        </button>
      </div>
    </main>
  );
}