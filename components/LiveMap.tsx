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
  const activePopup = useRef<mapboxgl.Popup | null>(null);

  useEffect(() => {
    if (!mapContainer.current) return;
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

    const channel = supabase.channel('manager-tracking')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vehicle_positions' }, (payload) => {
         updateMarker(payload.new);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      map.current?.remove();
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
    } catch (e) { console.error("Erro na rota do gestor", e); }
  }

  // Função central que voa para o veículo, abre info e desenha rota
  async function showVehicleData(vehicle_id: string) {
    const pos = positionsRef.current[vehicle_id];
    if (!pos || !map.current) return;

    // Voa suavemente para o motorista clicado
    map.current.flyTo({ center: [pos.lng, pos.lat], zoom: 14, speed: 1.2 });

    if (activePopup.current) activePopup.current.remove();

    const { data: delivery } = await supabase.from('deliveries').select('*').eq('driver_id', vehicle_id).eq('status', 'in_progress').single();

    const dataAtual = new Date(pos.updated_at || Date.now()).toLocaleDateString('pt-PT');
    const horaAtual = new Date(pos.updated_at || Date.now()).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });

    let html = `
      <div style="padding: 6px; font-family: -apple-system, sans-serif; color: #18181b; min-width: 220px;">
        <h3 style="margin: 0 0 8px 0; font-weight: 800; font-size: 15px; border-bottom: 1px solid #e4e4e7; padding-bottom: 6px;">
          Motorista ID: ${vehicle_id.slice(0,4)}
        </h3>
        <p style="margin: 4px 0; font-size: 13px;"><b>Data:</b> ${dataAtual}</p>
        <p style="margin: 4px 0; font-size: 13px;"><b>Atualização:</b> ${horaAtual}</p>
    `;

    if (delivery) {
      html += `
        <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #e4e4e7; background: #f0fdf4; padding: 8px; border-radius: 6px;">
          <p style="margin: 0; font-size: 13px; color: #15803d; font-weight: bold;">🟢 Serviço em Curso</p>
          <p style="margin: 4px 0 0 0; font-size: 12px; line-height: 1.4;"><b>Destino:</b><br/>${delivery.dropoff_address}</p>
        </div>
      `;
      drawRouteOnManager(pos.lng, pos.lat, delivery.dropoff_lng || -9.3000, delivery.dropoff_lat || 38.7070);
    } else {
      html += `<div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #e4e4e7;"><p style="margin: 0; font-size: 13px; color: #ca8a04; font-weight: bold;">🟡 Livre / Aguarda</p></div>`;
      // Limpar linha APENAS se este veículo não tiver entrega
      const source = map.current.getSource('manager-route') as mapboxgl.GeoJSONSource;
      if (source) source.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } } as any);
    }
    html += `</div>`;

    // Anchor 'bottom' e offset garantem que o popup abre PARA CIMA do ponto, não tapando a linha
    const popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: false, anchor: 'bottom', offset: [0, -15] })
      .setLngLat([pos.lng, pos.lat])
      .setHTML(html)
      .addTo(map.current!);
      
    activePopup.current = popup;
    // NOTA: Removida a ação que apagava a linha ao fechar o X. A linha agora fica fixa!
  }

  function updateMarker(position: any) {
    if (!map.current) return;
    const { vehicle_id, lat, lng } = position;
    
    // Guardar a posição na memória para o clique da barra lateral conseguir encontrar
    positionsRef.current[vehicle_id] = position;

    if (!markersRef.current[vehicle_id]) {
      const el = document.createElement('div');
      el.className = 'w-4 h-4 bg-emerald-500 rounded-full border-2 border-black shadow-[0_0_10px_rgba(34,197,94,0.8)] cursor-pointer hover:scale-125 transition-transform';
      
      const marker = new mapboxgl.Marker(el).setLngLat([lng, lat]).addTo(map.current);
      markersRef.current[vehicle_id] = marker;

      el.addEventListener('click', () => {
        onSelectVehicle(vehicle_id); // Diz ao painel quem foi clicado
      });
    } else {
      markersRef.current[vehicle_id].setLngLat([lng, lat]);
    }
  }

  // Quando o Painel Lateral muda o veículo selecionado, o mapa reage
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