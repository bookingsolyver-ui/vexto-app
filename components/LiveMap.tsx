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
  const positionsRef = useRef<{ [key: string]: any }>({});

  const selectedVehicleRef = useRef(selectedVehicleId);
  useEffect(() => {
    selectedVehicleRef.current = selectedVehicleId;
  }, [selectedVehicleId]);

  useEffect(() => {
    if (!mapContainer.current) return;
    if (map.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-9.3235, 38.6826],
      zoom: 13,
    });

    map.current.on('load', () => {
      if (!map.current) return;
      map.current.addSource('manager-route', {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } }
      });
      map.current.addLayer({
        id: 'manager-route-line',
        type: 'line',
        source: 'manager-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#22c55e', 'line-width': 5, 'line-opacity': 0.9 }
      });
    });

    async function fetchInitialPositions() {
      const { data } = await supabase.from('vehicle_positions').select('*');
      data?.forEach(updateMarker);
    }
    fetchInitialPositions();

    const trackingChannel = supabase.channel('manager-tracking')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vehicle_positions' }, (payload) => {
         updateMarker(payload.new);
      })
      .subscribe();

    const deliveriesChannel = supabase.channel('manager-deliveries-updates')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'deliveries' }, (payload) => {
         const delivery = payload.new;
         if (delivery.status === 'completed' || delivery.status === 'cancelled') {
           if (map.current) {
             const source = map.current.getSource('manager-route') as mapboxgl.GeoJSONSource;
             if (source) source.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } } as any);
           }
         }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(trackingChannel);
      supabase.removeChannel(deliveriesChannel);
      map.current?.remove();
      map.current = null;
    };
  }, []);

  async function drawRouteOnManager(startLng: number, startLat: number, endLng: number, endLat: number) {
    try {
      const query = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${startLng},${startLat};${endLng},${endLat}?geometries=geojson&access_token=${MAPBOX_TOKEN}`);
      const json = await query.json();
      if (json.routes && json.routes.length > 0 && map.current) {
        const source = map.current.getSource('manager-route') as mapboxgl.GeoJSONSource;
        if (source) source.setData({ type: 'Feature', properties: {}, geometry: json.routes[0].geometry } as any);
      }
    } catch (e) { console.error("Erro na rota", e); }
  }

  // Agora apenas voa e desenha a rota (sem popup!)
  async function showVehicleData(vehicle_id: string) {
    const pos = positionsRef.current[vehicle_id];
    if (!pos || !map.current) return;

    map.current.flyTo({ center: [pos.lng, pos.lat], zoom: 14, speed: 1.2 });

    const { data: delivery } = await supabase.from('deliveries').select('*').eq('driver_id', vehicle_id).eq('status', 'in_progress').single();
    if (delivery) {
      drawRouteOnManager(pos.lng, pos.lat, delivery.dropoff_lng || -9.3000, delivery.dropoff_lat || 38.7070);
    } else {
      const source = map.current.getSource('manager-route') as mapboxgl.GeoJSONSource;
      if (source) source.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } } as any);
    }
  }

  function updateMarker(position: any) {
    if (!map.current) return;
    const { vehicle_id, lat, lng } = position;
    positionsRef.current[vehicle_id] = position;

    if (!markersRef.current[vehicle_id]) {
      const container = document.createElement('div');
      container.className = 'flex items-center justify-center w-8 h-8 cursor-pointer'; 
      
      const dot = document.createElement('div');
      dot.className = 'w-4 h-4 bg-emerald-500 rounded-full border-2 border-black shadow-[0_0_10px_rgba(34,197,94,0.8)] transition-transform duration-200 hover:scale-150';
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

  useEffect(() => {
    if (selectedVehicleId && positionsRef.current[selectedVehicleId]) {
      showVehicleData(selectedVehicleId);
    }
  }, [selectedVehicleId]);

  return (
    <div className="relative w-full h-full min-h-[400px] rounded-2xl overflow-hidden shadow-2xl border border-white/5">
      <div ref={mapContainer} className="absolute inset-0 w-full h-full" />
    </div>
  );
}