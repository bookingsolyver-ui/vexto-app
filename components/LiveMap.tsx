"use client";

import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '../lib/supabaseClient';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

interface LiveMapProps {
  selectedVehicleId: string | null;
  onSelectVehicle: (id: string) => void;
}

export default function LiveMap({ selectedVehicleId, onSelectVehicle }: LiveMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<{ [key: string]: mapboxgl.Marker }>({});

  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11', // O teu tema escuro
      center: [-9.3235, 38.6826], // Centro (ex: Oeiras/Lisboa)
      zoom: 15.5, // O zoom tem de ser > 15 para os edifícios 3D ficarem incríveis
      pitch: 60, // INCLINAÇÃO 3D (O Segredo!)
      bearing: -20, // Rotação da câmara para dar um aspeto de "Centro de Comando"
      antialias: true // Essencial para as bordas dos edifícios 3D ficarem suaves
    });

    map.current.on('style.load', () => {
      if (!map.current) return;

      // Injetar os edifícios 3D por baixo das labels (nomes das ruas)
      const layers = map.current.getStyle().layers;
      const labelLayerId = layers?.find(
        (layer) => layer.type === 'symbol' && layer.layout && layer.layout['text-field']
      )?.id;

      map.current.addLayer(
        {
          'id': '3d-buildings',
          'source': 'composite',
          'source-layer': 'building',
          'filter': ['==', 'extrude', 'true'],
          'type': 'fill-extrusion',
          'minzoom': 15,
          'paint': {
            'fill-extrusion-color': '#1f1f1f', // Cor dos edifícios (Escuro para manter o Dark Mode)
            'fill-extrusion-height': [
              'interpolate',
              ['linear'],
              ['zoom'],
              15,
              0,
              15.05,
              ['get', 'height']
            ],
            'fill-extrusion-base': [
              'interpolate',
              ['linear'],
              ['zoom'],
              15,
              0,
              15.05,
              ['get', 'min_height']
            ],
            'fill-extrusion-opacity': 0.7 // Leve transparência tipo "vidro fosco"
          }
        },
        labelLayerId
      );
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Lógica para desenhar/atualizar os marcadores dos veículos (Mantida intacta)
  useEffect(() => {
    if (!map.current) return;

    const fetchPositions = async () => {
      const { data: vehicles } = await supabase.from('vehicles').select('id, status');
      if (!vehicles) return;

      for (const v of vehicles) {
        const { data: posData } = await supabase
          .from('vehicle_positions')
          .select('*')
          .eq('vehicle_id', v.id)
          .order('updated_at', { ascending: false })
          .limit(1);

        if (posData && posData.length > 0) {
          const pos = posData[0];
          const isSelected = selectedVehicleId === v.id;
          
          if (markersRef.current[v.id]) {
            markersRef.current[v.id].setLngLat([pos.lng, pos.lat]);
            
            // Atualiza o estilo visual se estiver selecionado
            const el = markersRef.current[v.id].getElement();
            if (isSelected) {
              el.className = 'w-4 h-4 bg-vexto-green rounded-full border-2 border-white shadow-[0_0_20px_rgba(34,197,94,1)] animate-pulse cursor-pointer';
            } else {
              el.className = v.status === 'online' 
                ? 'w-3 h-3 bg-vexto-green/60 rounded-full border border-white/50 cursor-pointer'
                : 'w-3 h-3 bg-vexto-red/60 rounded-full border border-white/50 cursor-pointer';
            }
          } else {
            // Cria o marcador 3D no mapa
            const el = document.createElement('div');
            el.className = isSelected
              ? 'w-4 h-4 bg-vexto-green rounded-full border-2 border-white shadow-[0_0_20px_rgba(34,197,94,1)] animate-pulse cursor-pointer'
              : (v.status === 'online' ? 'w-3 h-3 bg-vexto-green/60 rounded-full border border-white/50 cursor-pointer' : 'w-3 h-3 bg-vexto-red/60 rounded-full border border-white/50 cursor-pointer');
            
            el.onclick = () => onSelectVehicle(v.id);

            markersRef.current[v.id] = new mapboxgl.Marker(el)
              .setLngLat([pos.lng, pos.lat])
              .addTo(map.current!);
          }

          // A câmara "voa" para o veículo selecionado mantendo a perspetiva 3D
          if (isSelected && map.current) {
            map.current.flyTo({ 
              center: [pos.lng, pos.lat], 
              zoom: 16, // Mais perto para ver os edifícios!
              pitch: 60, // Mantém a inclinação
              essential: true,
              speed: 1.2
            });
          }
        }
      }
    };

    fetchPositions();

    const channel = supabase.channel('realtime-map-positions')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vehicle_positions' }, () => {
        fetchPositions();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedVehicleId, onSelectVehicle]);

  return <div ref={mapContainer} className="w-full h-full" />;
}