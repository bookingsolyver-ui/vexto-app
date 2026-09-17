"use client";

import LiveMap from '../components/LiveMap';
import React, { useEffect, useRef } from 'react';
import { Wifi, ArrowUpRight, Navigation, AlertTriangle, AlertCircle } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { useFleetStore } from '../store/useFleetStore';
import { STOPS } from '../lib/mockData';
import { supabase, LIVE_VEHICLE_ID, LiveVehiclePosition } from '../lib/supabaseClient';

const fallbackPassengerData = [
  { time: '06:00', value: 45 },
  { time: '09:00', value: 57 },
  { time: '12:00', value: 60 },
  { time: '15:00', value: 52 },
  { time: '18:00', value: 55 },
  { time: '21:00', value: 48 },
];

function formatCompactUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

export default function Dashboard() {
  const [livePosition, setLivePosition] = React.useState<LiveVehiclePosition | null>(null);
  const [isWidgetOpen, setIsWidgetOpen] = React.useState(false);

  const {
    vehicles,
    overview,
    passengerVolume,
    efficiency,
    loadInitialData,
    startLiveUpdates,
    stopLiveUpdates,
  } = useFleetStore();

  useEffect(() => {
    loadInitialData().then(() => startLiveUpdates(3000));
    return () => stopLiveUpdates();
  }, []);

  useEffect(() => {
    // Variável temporária para a rota da IA
    const routeCoordinates: [number, number][] = []; 

    supabase
      .from('vehicle_positions')
      .select('*')
      .eq('vehicle_id', LIVE_VEHICLE_ID)
      .order('updated_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) setLivePosition(data[0] as LiveVehiclePosition);
      });

    const channel = supabase
      .channel('vehicle-positions-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'vehicle_positions', filter: `vehicle_id=eq.${LIVE_VEHICLE_ID}` },
        (payload) => {
          const newPos = payload.new as any; 
          setLivePosition(newPos);

          // === CONTROLO DE DESVIO DA IA SEGURO ===
          const currentLon = newPos.longitude ?? newPos.lng;
          const currentLat = newPos.latitude ?? newPos.lat;

          if (currentLon && currentLat && routeCoordinates.length > 0) {
            const saiuDoTrajeto = checkRouteDeviation(
              [currentLon, currentLat], 
              routeCoordinates
            );

            if (saiuDoTrajeto) {
              console.warn("⚠️ ALERTA: Motorista desviou-se da linha branca da IA!");
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const featuredVehicle = vehicles.find((v) => v.status === 'online') ?? vehicles[0];
  const onlineCount = overview?.onlineCount ?? 12;
  const offlineCount = overview?.offlineCount ?? 4;
  const passengerToday = passengerVolume?.todayTotal ?? 142580;
  const chartData = passengerVolume?.series ?? fallbackPassengerData;

  const isLiveGpsActive = livePosition && Date.now() - new Date(livePosition.updated_at).getTime() < 15000;

  return (
    <main className="h-screen w-full relative flex overflow-hidden bg-vexto-bg">

      {/* ========================================== */}
      {/* O MAPA INTERATIVO NO FUNDO (Onde entra o LiveMap) */}
      {/* ========================================== */}
      <div className="absolute inset-0 z-0">
        <LiveMap />
        <div className="absolute inset-0 bg-vexto-bg/40 pointer-events-none"></div>
      </div>

      {/* MENU SUPERIOR FLUTUANTE */}
      <div className="absolute top-8 left-112.5 z-20 flex flex-col gap-2">
        <div className="glass-panel px-8 py-3 rounded-full flex items-center gap-8 border border-white/5 shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-2 cursor-pointer">
            <div className="w-1.5 h-1.5 rounded-full bg-vexto-green shadow-[0_0_8px_rgba(34,197,94,0.8)]"></div>
            <span className="text-white text-sm font-medium">Live Map</span>
          </div>
          <span className="text-vexto-textMuted text-sm hover:text-white cursor-pointer transition-colors">Fleet</span>
          <span className="text-vexto-textMuted text-sm hover:text-white cursor-pointer transition-colors">Routes</span>
          <span className="text-vexto-textMuted text-sm hover:text-white cursor-pointer transition-colors">Analytics</span>
          <div className="w-px h-4 bg-white/10 mx-2"></div>
          <span className="text-vexto-textMuted text-sm hover:text-white cursor-pointer transition-colors">Maintenance</span>
          <span className="text-vexto-textMuted text-sm hover:text-white cursor-pointer transition-colors">Incidents</span>
        </div>

        {isLiveGpsActive && (
          <div className="glass-panel px-4 py-1.5 rounded-full flex w-fit items-center gap-2 border border-vexto-green/30">
            <span className="w-1.5 h-1.5 rounded-full bg-vexto-green animate-pulse"></span>
            <span className="text-vexto-green text-xs font-medium tracking-wide">GPS REAL AO VIVO</span>
          </div>
        )}
      </div>

      {/* WIDGET FLUTUANTE NO MAPA (Passenger Load) */}
      {featuredVehicle && isWidgetOpen && (
        <div
          className="absolute z-20 pointer-events-none top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
        >
          <div>
            <div className="glass-panel p-5 rounded-2xl flex flex-col gap-2 border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)] pointer-events-auto relative">
              <div className="absolute -top-3 -right-3 cursor-pointer p-1 rounded-full bg-vexto-bg border border-white/10 text-vexto-textMuted hover:text-white transition-colors" onClick={() => setIsWidgetOpen(false)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </div>
              <div className="flex justify-between items-start gap-8">
                <div>
                  <h3 className="text-vexto-textMuted text-sm font-medium">Passenger Load</h3>
                  <p className="text-vexto-textMuted text-xs">GPS real</p>
                </div>
                <ArrowUpRight className="text-white w-4 h-4" />
              </div>
              <div className="text-5xl text-functional text-white mt-1">
                {Math.round(featuredVehicle.passengerLoadPct)}%
              </div>
            </div>
          </div>
        </div>
      )}

      {/* NOVA BARRA LATERAL (COMMAND CENTER) */}
      <div className="glass-panel w-105 h-full rounded-none relative z-10 flex flex-col bg-vexto-bg/80 backdrop-blur-xl border-y-0 border-l-0 border-r border-white/5 overflow-hidden">
        
        {/* Cabeçalho */}
        <header className="p-8 pb-6 shrink-0">
          <div className="flex items-center gap-3 mb-8">
            <div className="flex gap-0.5 transform -rotate-45">
              <div className="w-1 h-4 bg-white rounded-full"></div>
              <div className="w-1 h-5 bg-white rounded-full -mt-0.5"></div>
              <div className="w-1 h-4 bg-white rounded-full -mt-1"></div>
              <div className="w-1 h-3 bg-white rounded-full -mt-0.5"></div>
            </div>
            <h1 className="text-2xl font-medium tracking-tight text-white">Vexto</h1>
          </div>

          {/* Filtros de Frota */}
          <div className="grid grid-cols-4 gap-2 mb-8">
            <button className="glass-panel px-3 py-2 rounded-full border border-white/10 text-white text-xs font-medium hover:bg-white/5 transition-colors cursor-pointer">24 Bus</button>
            <button className="glass-panel px-3 py-2 rounded-full border border-transparent text-vexto-textMuted text-xs font-medium hover:text-white transition-colors cursor-pointer">100 Taxi</button>
            <button className="glass-panel px-3 py-2 rounded-full border border-transparent text-vexto-textMuted text-xs font-medium hover:text-white transition-colors cursor-pointer">12 Trains</button>
            <button className="glass-panel px-3 py-2 rounded-full border border-transparent text-vexto-textMuted text-xs font-medium hover:text-white transition-colors cursor-pointer">13 Trams</button>
          </div>

          {/* Estado da Frota */}
          <div className="flex gap-4 mb-8">
            <div className="flex-1 glass-panel px-5 py-4 rounded-2xl flex flex-col gap-1 border border-white/5">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-vexto-green shadow-[0_0_8px_rgba(34,197,94,0.8)]"></span>
                <span className="text-vexto-textMuted text-xs">Online</span>
              </div>
              <span className="text-2xl text-functional text-white mt-1">{onlineCount}</span>
            </div>
            <div className="flex-1 glass-panel px-5 py-4 rounded-2xl flex flex-col gap-1 border border-white/5">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-vexto-red shadow-[0_0_8px_rgba(239,68,68,0.8)]"></span>
                <span className="text-vexto-textMuted text-xs">Offline</span>
              </div>
              <span className="text-2xl text-functional text-white mt-1">{offlineCount}</span>
            </div>
          </div>

          {/* Eficiência Operacional */}
          <div className="flex flex-col gap-2 mb-2">
            <div className="flex justify-between items-end">
              <span className="text-vexto-textMuted text-xs">Operational Efficiency</span>
              <ArrowUpRight className="text-vexto-textMuted w-4 h-4 cursor-pointer hover:text-white" />
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-4xl text-functional text-white">{efficiency ? efficiency.operationalEfficiencyPct : '78.3'}</span>
              <span className="text-vexto-textMuted text-sm">%</span>
            </div>
            <span className="text-vexto-textMuted text-[10px] uppercase tracking-widest mt-1">Target 80%</span>
          </div>
        </header>

        {/* Lista de Veículos (Tracking Pods) */}
        <div className="flex-1 overflow-y-auto px-8 pb-8 custom-scrollbar">
          <div className="grid grid-cols-2 gap-4">
            {vehicles.map(vehicle => (
              <div key={vehicle.id} className="glass-pod p-4 flex flex-col gap-3 relative overflow-hidden group cursor-pointer hover:border-white/20">
                
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-white text-sm font-medium tracking-tight">{vehicle.displayName}</h3>
                    <p className="text-vexto-textMuted text-[10px] mt-0.5 opacity-60">
                      {new Date(vehicle.lastUpdate).toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </p>
                  </div>
                  <ArrowUpRight className="text-vexto-textMuted w-4 h-4 group-hover:text-white transition-colors" />
                </div>

                <div className="h-14 border border-white/5 rounded-lg flex items-center justify-center bg-black/20 relative overflow-hidden mt-1">
                  <div className="border border-white/10 px-3 py-1 rounded bg-black/60 backdrop-blur-md flex items-center gap-2 z-10">
                    <span className="text-vexto-textMuted text-[10px]">L</span>
                    <span className="text-white text-xs tracking-widest font-medium uppercase">{vehicle.plate}</span>
                  </div>
<div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_49%,rgba(255,255,255,0.03)_50%,transparent_51%)]" style={{ backgroundSize: '10px 100%' }}></div>
                  <div className="absolute inset-0 bg-linear-to-b from-transparent to-black/80"></div>
                </div>

                <div className="flex justify-between items-center text-[10px] font-medium tracking-wide">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${vehicle.status === 'online' ? 'bg-vexto-green shadow-[0_0_8px_rgba(34,197,94,0.8)]' : 'bg-vexto-red shadow-[0_0_8px_rgba(239,68,68,0.8)]'}`}></span>
                    <span className={vehicle.status === 'online' ? 'text-vexto-green' : 'text-vexto-red'}>
                      {vehicle.status === 'online' ? 'Online' : 'Offline'}
                    </span>
                  </div>
                  <div className="flex gap-3 text-vexto-textMuted">
                    <span className="flex items-center gap-1"><Wifi className="w-3 h-3" /> {vehicle.signals?.gps ? 'GPS' : '—'}</span>
                    <span className="flex items-center gap-1"><Navigation className="w-3 h-3" /> {vehicle.signals?.lte ? 'LTE' : '—'}</span>
                  </div>
                </div>

                <div className="mt-1 h-24 rounded-lg bg-[#050505] border border-white/5 relative overflow-hidden flex flex-col justify-end p-2.5">
                  <svg className="absolute inset-0 w-full h-full opacity-30" preserveAspectRatio="none" viewBox="0 0 100 100">
                    <path d="M -10,90 L 30,50 L 50,70 L 80,20 L 110,30" fill="none" stroke="#ffffff" strokeWidth="1" strokeDasharray="2,2" />
                  </svg>
                  {vehicle.status === 'online' && (
                    <div className="absolute top-[45%] left-[45%] w-2 h-2 bg-white rounded-full border border-black shadow-[0_0_10px_rgba(255,255,255,1)]">
                      <div className="absolute -inset-2 border border-white/30 rounded-full animate-ping"></div>
                    </div>
                  )}

                  <div className="relative z-10 w-full mt-auto">
                    <div className="flex justify-between text-[8px] text-vexto-textMuted mb-1.5 uppercase tracking-wider">
                      <span>06AM</span>
                      <span>11PM</span>
                    </div>
                    <div className="w-full h-2 relative flex items-center">
                      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.1)_1px,transparent_1px)]" style={{ backgroundSize: '3px 100%' }}></div>
                      <div className="absolute left-0 h-full bg-[linear-gradient(90deg,rgba(255,255,255,0.4)_1px,transparent_1px)]" style={{ backgroundSize: '3px 100%', width: `${Math.max(10, vehicle.passengerLoadPct)}%` }}></div>
                      
                      <div className="absolute z-20 bg-black border border-white/20 rounded p-0.5 shadow-lg transform -translate-y-1/2" style={{ left: `calc(${Math.max(10, vehicle.passengerLoadPct)}% - 8px)` }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="4" y="11" width="16" height="2"></rect><path d="M8 20v2"></path><path d="M16 20v2"></path><circle cx="8" cy="15" r="1"></circle><circle cx="16" cy="15" r="1"></circle></svg>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            ))}
          </div>
        </div>
      </div>

      {/* WIDGET DE CONTROLOS DO MAPA (Flutua ao lado da Sidebar) */}
      <div className="absolute bottom-8 left-112.5 z-20 glass-panel px-5 py-2.5 rounded-full flex items-center gap-5 border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.5)] pointer-events-auto">
        <button className="text-vexto-textMuted hover:text-white transition-colors cursor-pointer">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"></path></svg>
        </button>
        
        <div className="w-px h-4 bg-white/10"></div>
        
        <button className="text-white transition-colors cursor-pointer">
          <div className="flex gap-0.5 transform -rotate-45">
            <div className="w-0.5 h-3 bg-white rounded-full"></div>
            <div className="w-0.5 h-4 bg-white rounded-full -mt-0.5"></div>
            <div className="w-0.5 h-3 bg-white rounded-full -mt-1"></div>
            <div className="w-0.5 h-2 bg-white rounded-full -mt-0.5"></div>
          </div>
        </button>

        <div className="w-px h-4 bg-white/10"></div>

        <button className="text-vexto-textMuted hover:text-white transition-colors cursor-pointer">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
        </button>
      </div>

      {/* PAINÉIS INFERIORES DIREITOS (Schedule Offset & Volume) */}
      <div className="absolute bottom-8 right-8 z-20 flex items-end gap-6 pointer-events-none">

        {/* Módulo: Schedule Offset (Tabela de Atrasos) */}
        <div className="glass-panel w-105 p-6 pointer-events-auto flex flex-col gap-5 border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
          <div className="flex justify-between items-start">
             <div>
               <h3 className="text-white text-sm font-medium tracking-tight">Schedule Offset</h3>
               <div className="flex items-baseline gap-2 mt-1">
                 <span className="text-2xl text-functional text-white">± 2.5 min</span>
                 <span className="text-vexto-textMuted text-[10px] uppercase tracking-widest">Average Variance</span>
               </div>
             </div>
             <div className="flex gap-2">
               <button className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center text-vexto-textMuted hover:text-white hover:bg-white/5 transition-colors cursor-pointer">+</button>
               <button className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center text-vexto-textMuted hover:text-white hover:bg-white/5 transition-colors cursor-pointer">-</button>
             </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex justify-between text-[9px] text-vexto-textMuted uppercase tracking-[0.2em]">
              <span className="w-16">Route number</span>
              <span>L1</span>
              <span>L12</span>
              <span>L14</span>
              <span>L24</span>
            </div>
            
            <div className="flex justify-between items-center text-xs border-t border-white/5 pt-3">
              <span className="text-vexto-textMuted w-16 tracking-widest text-[10px]">L 45623</span>
              <span className="text-white">-2min</span>
              <span className="text-vexto-orange">+3min</span>
              <span className="text-vexto-orange">+1.5min</span>
              <span className="text-white">-1min</span>
            </div>
            
            <div className="flex justify-between items-center text-xs">
              <span className="text-vexto-textMuted w-16 tracking-widest text-[10px]">L 34654</span>
              <span className="text-white">-1min</span>
              <span className="text-white">-2min</span>
              <span className="text-vexto-orange">+2min</span>
              <span className="text-vexto-orange">+2min</span>
            </div>
          </div>
        </div>

        {/* Módulo: Live Passenger Volume */}
        <div className="glass-panel w-120 p-6 pointer-events-auto border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
           <div className="flex justify-between items-start mb-6">
              <div>
                 <h3 className="text-white text-sm font-medium tracking-tight">Live Passenger Volume</h3>
                 <div className="flex items-baseline gap-2 mt-1">
                   <span className="text-5xl text-functional text-white">{passengerToday.toLocaleString('en-US')}</span>
                   <span className="text-vexto-textMuted text-[10px] uppercase tracking-widest pb-1">today</span>
                 </div>
              </div>
              <ArrowUpRight className="text-vexto-textMuted w-5 h-5 hover:text-white cursor-pointer transition-colors" />
           </div>

           <div className="h-28 w-full relative mb-3 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                 <LineChart data={chartData}>
                   <Line type="monotone" dataKey="value" stroke="#ffffff" strokeWidth={1.5} dot={{ r: 2, fill: '#ffffff', strokeWidth: 0 }} activeDot={{ r: 4, fill: '#ffffff' }} />
                 </LineChart>
              </ResponsiveContainer>
              
              <div className="absolute top-2 left-6 px-1.5 py-0.5 bg-black/60 border border-white/10 rounded flex gap-1 items-center text-[9px] text-white backdrop-blur-md">
                <span className="text-vexto-textMuted">55k</span> -0%
              </div>
              <div className="absolute top-10 left-[38%] px-1.5 py-0.5 bg-vexto-orange/10 border border-vexto-orange/30 rounded flex gap-1 items-center text-[9px] text-vexto-orange backdrop-blur-md shadow-[0_0_10px_rgba(249,115,22,0.1)]">
                <span className="text-vexto-textMuted">56k</span> +6%
              </div>
              <div className="absolute top-16 right-12 px-1.5 py-0.5 bg-vexto-green/10 border border-vexto-green/30 rounded flex gap-1 items-center text-[9px] text-vexto-green backdrop-blur-md shadow-[0_0_10px_rgba(34,197,94,0.1)]">
                <span className="text-vexto-textMuted">52k</span> -12%
              </div>
           </div>
           
           <div className="flex justify-between text-[9px] text-vexto-textMuted tracking-widest uppercase border-t border-white/5 pt-3">
              {chartData.map((point) => (
                <span key={point.time}>{point.time}</span>
              ))}
           </div>
        </div>
      </div>

    </main>
  );
}

// ==========================================
// 1. FUNÇÃO PARA DESENHAR A LINHA BRANCA
// ==========================================
async function fetchAndDrawRoute(map: any, startCoords: [number, number], endCoords: [number, number], token: string) {
  const query = await fetch(
    `https://api.mapbox.com/directions/v5/mapbox/driving/${startCoords[0]},${startCoords[1]};${endCoords[0]},${endCoords[1]}?geometries=geojson&access_token=${token}`
  );
  const json = await query.json();
  
  if (!json.routes || json.routes.length === 0) return;
  
  const routeGeoJSON = json.routes[0].geometry;

  if (map.getSource('route')) {
    map.getSource('route').setData({
      type: 'Feature',
      properties: {},
      geometry: routeGeoJSON
    });
  } else {
    map.addSource('route', {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: routeGeoJSON
      }
    });

    map.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'route',
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': '#ffffff', 
        'line-width': 5,
        'line-opacity': 0.85
      }
    });
  }
}

// ==========================================
// 2. FUNÇÕES DE CÁLCULO E ALERTA DE DESVIO
// ==========================================
function getDistanceFromLatLonInMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000; // Raio da Terra em metros
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function checkRouteDeviation(driverCurrentPos: [number, number], routeCoordinates: [number, number][]) {
  const THRESHOLD_METERS = 100; // Limite de tolerância de desvio (100 metros)
  
  let minDistance = Infinity;
  for (const coord of routeCoordinates) {
    const dist = getDistanceFromLatLonInMeters(
      driverCurrentPos[1], driverCurrentPos[0], 
      coord[1], coord[0]
    );
    if (dist < minDistance) {
      minDistance = dist;
    }
  }

  if (minDistance > THRESHOLD_METERS) {
    return true; 
  }
  return false;
}