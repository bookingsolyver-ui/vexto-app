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

    // FUNÇÃO PARA BUSCAR TUDO O QUE ESTÁ NA BASE DE DADOS AGORA MESMO
    async function forceFetchAllPositions() {
      const { data, error } = await supabase.from('vehicle_positions').select('*');
      
      if (error) {
        console.error("ERRO AO LER SUPABASE NO MAPA:", error.message);
        return;
      }

      if (data && data.length > 0) {
        console.log("POSIÇÕES ENCONTRADAS NA BD:", data);
        data.forEach((pos: any) => {
          updateMarker(pos);
        });
      } else {
        console.warn("A tabela vehicle_positions está vazia ou inacessível!");
      }
    }

    forceFetchAllPositions();

    // INTERVALO DE SEGURANÇA: Atualiza o mapa a cada 3 segundos indo buscar diretamente à BD
    const interval = setInterval(() => {
      forceFetchAllPositions();
    }, 3000);

    return () => {
      clearInterval(interval);
      map.current?.remove();
      map.current = null;
    };
  }, []);

  function updateMarker(position: any) {
    if (!map.current) return;
    const { vehicle_id, lat, lng } = position;
    if (!lat || !lng) return;

    if (!markersRef.current[vehicle_id]) {
      const container = document.createElement('div');
      container.className = 'flex items-center justify-center w-8 h-8 cursor-pointer'; 
      
      const dot = document.createElement('div');
      dot.className = 'w-4 h-4 bg-emerald-500 rounded-full border-2 border-white shadow-[0_0_15px_rgba(34,197,94,1)] animate-pulse';
      container.appendChild(dot);
      
      const marker = new mapboxgl.Marker(container).setLngLat([lng, lat]).addTo(map.current);
      markersRef.current[vehicle_id] = marker;

      container.addEventListener('click', (e) => {
        e.stopPropagation();
        onSelectVehicle(vehicle_id);
      });
    } else {
      markersRef.current[vehicle_id].setLngLat([lng, lat]);
    }
  }

 // Quando o gestor clica num veículo na barra lateral, voa com precisão para a localização exata
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
          map.current?.flyTo({ center: [lng, lat], zoom: 14, essential: true, speed: 1.4 });
        }
      });
  }, [selectedVehicleId]);

  return (
    <div className="relative w-full h-full min-h-[400px] rounded-2xl overflow-hidden shadow-2xl border border-white/5">
      <div ref={mapContainer} className="absolute inset-0 w-full h-full" />
    </div>
  );
}