"use client";

import React, { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '../lib/supabaseClient';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

interface LiveMapProps {
  selectedVehicleId: string | null;
  onSelectVehicle: (id: string) => void;
}

export default function ManagerLiveMap({ selectedVehicleId, onSelectVehicle }: LiveMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<{ [key: string]: mapboxgl.Marker }>({});

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-9.3235, 38.6826],
      zoom: 12,
    });

    async function forceFetchAllPositions() {
      const { data: vehiclesData } = await supabase.from('vehicles').select('id, status');
      const statusMap = new Map();
      vehiclesData?.forEach((v: any) => {
        statusMap.set(v.id, String(v.status).trim().toLowerCase());
      });

      const { data, error } = await supabase.from('vehicle_positions').select('*');
      
      if (error) {
        console.error("ERRO AO LER SUPABASE NO MAPA:", error.message);
        return;
      }

      if (data && data.length > 0) {
        data.forEach((pos: any) => {
          const vehicleStatus = statusMap.get(pos.vehicle_id);
          const isOnline = vehicleStatus === 'online';
          updateMarker(pos, isOnline);
        });
      }
    }

    forceFetchAllPositions();

    const interval = setInterval(() => {
      forceFetchAllPositions();
    }, 3000);

    return () => {
      clearInterval(interval);
      map.current?.remove();
      map.current = null;
    };
  }, []);

  function updateMarker(position: any, isOnline: boolean) {
    if (!map.current) return;
    const { vehicle_id, lat, lng } = position;
    if (!lat || !lng) return;

    if (!markersRef.current[vehicle_id]) {
      const container = document.createElement('div');
      container.className = 'flex items-center justify-center w-10 h-10 cursor-pointer relative'; 
      
      if (isOnline) {
        const pingDot = document.createElement('div');
        pingDot.className = 'absolute w-8 h-8 bg-vexto-green rounded-full opacity-75 animate-ping';
        container.appendChild(pingDot);
      }

      const dot = document.createElement('div');
      // ONLINE = Verde brilhante com sombra | OFFLINE = Cinzento estático claro
      dot.className = isOnline 
        ? 'w-4 h-4 bg-vexto-green rounded-full border-2 border-white shadow-[0_0_25px_rgba(34,197,94,1)] relative z-10'
        : 'w-3.5 h-3.5 bg-zinc-600 rounded-full border-2 border-zinc-400 relative z-10';
      container.appendChild(dot);
      
      const marker = new mapboxgl.Marker(container).setLngLat([lng, lat]).addTo(map.current);
      markersRef.current[vehicle_id] = marker;

      container.addEventListener('click', (e) => {
        e.stopPropagation();
        onSelectVehicle(vehicle_id);
      });
    } else {
      const marker = markersRef.current[vehicle_id];
      marker.setLngLat([lng, lat]);
      
      const container = marker.getElement();
      container.innerHTML = '';
      
      if (isOnline) {
        const pingDot = document.createElement('div');
        pingDot.className = 'absolute w-8 h-8 bg-vexto-green rounded-full opacity-75 animate-ping';
        container.appendChild(pingDot);
      }

      const dot = document.createElement('div');
      dot.className = isOnline 
        ? 'w-4 h-4 bg-vexto-green rounded-full border-2 border-white shadow-[0_0_25px_rgba(34,197,94,1)] relative z-10'
        : 'w-3.5 h-3.5 bg-zinc-600 rounded-full border-2 border-zinc-400 relative z-10';
      container.appendChild(dot);
    }
  }

  useEffect(() => {
    if (!selectedVehicleId || !map.current) return;

    supabase
      .from('vehicle_positions')
      .select('*')
      .eq('vehicle_id', selectedVehicleId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) {
          const { lat, lng } = data[0];
          map.current?.flyTo({
            center: [lng, lat],
            zoom: 14,
            essential: true,
            speed: 1.5
          });
        }
      });
  }, [selectedVehicleId]);
  
  return (
    <div className="relative w-full h-full min-h-[400px] rounded-2xl overflow-hidden shadow-2xl border border-white/5">
      <div ref={mapContainer} className="absolute inset-0 w-full h-full" />
    </div>
  );
}