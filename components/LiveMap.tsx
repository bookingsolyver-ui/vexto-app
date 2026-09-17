"use client";

import React, { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '../lib/supabaseClient';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

export default function ManagerLiveMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<{ [key: string]: mapboxgl.Marker }>({});
  const activePopup = useRef<mapboxgl.Popup | null>(null);

  useEffect(() => {
    if (!mapContainer.current) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-9.3235, 38.6826], // Centro de Oeiras
      zoom: 13,
    });

    map.current.on('load', () => {
      if (!map.current) return;
      
      // Camada invisível pronta para desenhar a rota quando o gestor clica num autocarro
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

    // 1. Buscar as posições iniciais
    async function fetchInitialPositions() {
      const { data } = await supabase.from('vehicle_positions').select('*');
      data?.forEach(updateMarker);
    }
    fetchInitialPositions();

    // 2. Escutar movimento em tempo real
    const channel = supabase.channel('manager-tracking')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vehicle_positions' }, (payload: any) => {
         updateMarker(payload.new);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      map.current?.remove();
    };
  }, []);

  // Função para o Gestor consultar a API da Mapbox e desenhar a estrada exata
  async function drawRouteOnManager(startLng: number, startLat: number, endLng: number, endLat: number) {
    try {
      const query = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${startLng},${startLat};${endLng},${endLat}?geometries=geojson&access_token=${MAPBOX_TOKEN}`);
      const json = await query.json();
      if (json.routes && json.routes.length > 0 && map.current) {
        const source = map.current.getSource('manager-route') as mapboxgl.GeoJSONSource;
        if (source) {
          source.setData({ type: 'Feature', properties: {}, geometry: json.routes[0].geometry } as any);
        }
      }
    } catch (e) { console.error("Erro na rota do gestor", e); }
  }

  async function updateMarker(position: any) {
    if (!map.current) return;
    const { vehicle_id, lat, lng, updated_at } = position;

    // Se o marcador NÃO existe, cria-o e injeta a lógica de clique
    if (!markersRef.current[vehicle_id]) {
      const el = document.createElement('div');
      el.className = 'w-4 h-4 bg-emerald-500 rounded-full border-2 border-black shadow-[0_0_10px_rgba(34,197,94,0.8)] cursor-pointer hover:scale-125 transition-transform';
      
      const marker = new mapboxgl.Marker(el).setLngLat([lng, lat]).addTo(map.current);
      markersRef.current[vehicle_id] = marker;

      // ==========================================
      // LÓGICA DE CLIQUE NO MOTORISTA (PAINEL GESTOR)
      // ==========================================
      el.addEventListener('click', async () => {
        if (activePopup.current) activePopup.current.remove();

        // 1. Vai ao Supabase ver se este motorista tem uma entrega 'in_progress'
        const { data: delivery } = await supabase
          .from('deliveries')
          .select('*')
          .eq('driver_id', vehicle_id)
          .eq('status', 'in_progress')
          .single();

        // 2. Formata Data e Hora
        const dataAtual = new Date(updated_at || Date.now()).toLocaleDateString('pt-PT');
        const horaAtual = new Date(updated_at || Date.now()).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });

        // 3. Monta o cartão informativo (Popup)
        let html = `
          <div style="padding: 6px; font-family: -apple-system, sans-serif; color: #18181b; min-width: 220px;">
            <h3 style="margin: 0 0 8px 0; font-weight: 800; font-size: 15px; border-bottom: 1px solid #e4e4e7; padding-bottom: 6px;">
              Motorista — Bus 6023
            </h3>
            <p style="margin: 4px 0; font-size: 13px;"><b>Data:</b> ${dataAtual}</p>
            <p style="margin: 4px 0; font-size: 13px;"><b>Última atualização:</b> ${horaAtual}</p>
        `;

        if (delivery) {
          html += `
            <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #e4e4e7; background: #f0fdf4; padding: 8px; border-radius: 6px;">
              <p style="margin: 0; font-size: 13px; color: #15803d; font-weight: bold;">🟢 Serviço em Curso</p>
              <p style="margin: 4px 0 0 0; font-size: 12px; line-height: 1.4;"><b>Destino:</b><br/>${delivery.dropoff_address}</p>
            </div>
          `;
          // Pede à API para desenhar a linha no ecrã do gestor
          drawRouteOnManager(lng, lat, delivery.dropoff_lng || -9.3000, delivery.dropoff_lat || 38.7070);
        } else {
          html += `
            <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #e4e4e7;">
              <p style="margin: 0; font-size: 13px; color: #ca8a04; font-weight: bold;">🟡 Aguarda Serviço (Livre)</p>
            </div>
          `;
        }

        html += `</div>`;

        // 4. Lança o Popup no mapa
        const popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: false })
          .setLngLat([lng, lat])
          .setHTML(html)
          .addTo(map.current!);
          
        activePopup.current = popup;

        // 5. Apagar a linha da rota se o gestor fechar o popup
        popup.on('close', () => {
          const source = map.current?.getSource('manager-route') as mapboxgl.GeoJSONSource;
          if (source) source.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } } as any);
        });
      });
    } else {
      // Se já existe, move o ponto verde e a linha acompanha
      markersRef.current[vehicle_id].setLngLat([lng, lat]);
    }
  }

  return (
    <div className="relative w-full h-full min-h-[400px] rounded-2xl overflow-hidden shadow-2xl border border-white/5">
      <div ref={mapContainer} className="absolute inset-0 w-full h-full" />
    </div>
  );
}