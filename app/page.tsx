"use client";

import LiveMap from '../components/LiveMap';
import React, { useEffect, useState } from 'react';
import { Wifi, ArrowUpRight, Navigation } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { useFleetStore } from '../store/useFleetStore';
import { supabase, LIVE_VEHICLE_ID, LiveVehiclePosition } from '../lib/supabaseClient';

const fallbackPassengerData = [
  { time: '06:00', value: 45 },
  { time: '09:00', value: 57 },
  { time: '12:00', value: 60 },
  { time: '15:00', value: 52 },
  { time: '18:00', value: 55 },
  { time: '21:00', value: 48 },
];

export default function Dashboard() {
  const [livePosition, setLivePosition] = useState<LiveVehiclePosition | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(LIVE_VEHICLE_ID);
  
  const [activeDelivery, setActiveDelivery] = useState<any>(null);

  const { vehicles, overview, passengerVolume, efficiency, loadInitialData, startLiveUpdates, stopLiveUpdates } = useFleetStore();

  useEffect(() => {
    loadInitialData().then(() => startLiveUpdates(3000));
    return () => stopLiveUpdates();
  }, []);

  useEffect(() => {
    const channel = supabase.channel('vehicle-positions-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicle_positions', filter: `vehicle_id=eq.${LIVE_VEHICLE_ID}` }, (payload: any) => {
          setLivePosition(payload.new);
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (!selectedVehicleId) {
      setActiveDelivery(null);
      return;
    }

    const fetchDelivery = async () => {
      const { data } = await supabase.from('deliveries').select('*').eq('driver_id', selectedVehicleId).eq('status', 'in_progress').single();
      setActiveDelivery(data || null);
    };
    fetchDelivery();

    // ERRO CORRIGIDO AQUI -> (payload: any)
    const deliveriesChannel = supabase.channel(`deliveries-${selectedVehicleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries', filter: `driver_id=eq.${selectedVehicleId}` }, (payload: any) => {
         if (payload.new.status === 'completed' || payload.new.status === 'cancelled') {
           setActiveDelivery(null);
         } else if (payload.new.status === 'in_progress') {
           setActiveDelivery(payload.new);
         }
      }).subscribe();

    return () => { supabase.removeChannel(deliveriesChannel); };
  }, [selectedVehicleId]);

  const onlineCount = overview?.onlineCount ?? 12;
  const offlineCount = overview?.offlineCount ?? 4;
  const passengerToday = passengerVolume?.todayTotal ?? 142580;
  const chartData = passengerVolume?.series ?? fallbackPassengerData;
  const isLiveGpsActive = livePosition && Date.now() - new Date(livePosition.updated_at).getTime() < 15000;

  const selectedVeh = vehicles.find(v => v.id === selectedVehicleId) || vehicles[0];

  return (
    <main className="h-screen w-full relative flex overflow-hidden bg-vexto-bg">

      <div className="absolute inset-0 z-0">
        <LiveMap selectedVehicleId={selectedVehicleId} onSelectVehicle={setSelectedVehicleId} />
        <div className="absolute inset-0 bg-vexto-bg/40 pointer-events-none"></div>
      </div>

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
      </div>

      <div className="glass-panel w-105 h-full rounded-none relative z-10 flex flex-col bg-vexto-bg/80 backdrop-blur-xl border-y-0 border-l-0 border-r border-white/5 overflow-hidden">
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
        </header>

        <div className="flex-1 overflow-y-auto px-8 pb-8 custom-scrollbar">
          <div className="grid grid-cols-2 gap-4">
            {vehicles.map(vehicle => (
              <div key={vehicle.id} onClick={() => setSelectedVehicleId(vehicle.id)} className={`glass-pod p-4 flex flex-col gap-3 relative overflow-hidden group cursor-pointer transition-all border ${selectedVehicleId === vehicle.id ? 'border-vexto-green bg-vexto-green/5 shadow-[0_0_15px_rgba(34,197,94,0.1)]' : 'border-white/5 hover:border-white/20'}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-white text-sm font-medium tracking-tight">{vehicle.displayName}</h3>
                  </div>
                  <ArrowUpRight className="text-vexto-textMuted w-4 h-4 group-hover:text-white transition-colors" />
                </div>
                <div className="flex justify-between items-center text-[10px] font-medium tracking-wide mt-2">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${vehicle.status === 'online' ? 'bg-vexto-green' : 'bg-vexto-red'}`}></span>
                    <span className={vehicle.status === 'online' ? 'text-vexto-green' : 'text-vexto-red'}>{vehicle.status === 'online' ? 'Online' : 'Offline'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="absolute bottom-8 right-8 z-20 flex items-end gap-6 pointer-events-none">
        
        {/* PAINEL DINÂMICO (Substitui o Live Passenger Volume) */}
        <div className="glass-panel w-120 p-6 pointer-events-auto border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.5)] flex flex-col justify-between bg-black/60 backdrop-blur-xl">
           
           <div className="flex justify-between items-start mb-5">
              <div>
                 <h3 className="text-white text-sm font-medium tracking-tight">
                   Análise: {selectedVeh?.displayName || 'Frota'}
                 </h3>
                 
                 <div className="flex items-center gap-2 mt-2">
                   {activeDelivery ? (
                     <div className="px-2 py-1 bg-vexto-green/10 border border-vexto-green/30 rounded text-vexto-green text-[10px] uppercase tracking-widest font-bold flex items-center gap-2">
                       <span className="w-1.5 h-1.5 rounded-full bg-vexto-green animate-pulse"></span>
                       Serviço em Curso
                     </div>
                   ) : (
                     <div className="px-2 py-1 bg-amber-500/10 border border-amber-500/30 rounded text-amber-500 text-[10px] uppercase tracking-widest font-bold flex items-center gap-2">
                       <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                       Livre / Patrulha
                     </div>
                   )}
                 </div>
              </div>
              <ArrowUpRight className="text-vexto-textMuted w-5 h-5 hover:text-white cursor-pointer transition-colors" />
           </div>

           {activeDelivery && (
             <div className="mb-5 bg-black/40 border border-white/5 rounded-xl p-3 flex flex-col gap-1">
               <span className="text-vexto-textMuted text-[10px] uppercase tracking-widest">Destino Atual</span>
               <span className="text-white text-xs leading-relaxed">{activeDelivery.dropoff_address}</span>
             </div>
           )}

           <div>
              <div className="flex justify-between items-end mb-2">
                <span className="text-vexto-textMuted text-[10px] uppercase tracking-widest">
                  {activeDelivery ? 'Atividade Operacional (24h)' : 'Volume de Passageiros (Hoje)'}
                </span>
                <span className="text-white text-xl font-light">
                  {activeDelivery ? '82%' : passengerToday.toLocaleString('en-US')}
                </span>
              </div>

              <div className="h-24 w-full relative mb-3">
                 <ResponsiveContainer width="100%" height="100%">
                   <LineChart data={chartData}>
                     <Line 
                       type="monotone" 
                       dataKey="value" 
                       stroke={activeDelivery ? '#22c55e' : '#ffffff'} 
                       strokeWidth={2} 
                       dot={{ r: 2, fill: activeDelivery ? '#22c55e' : '#ffffff', strokeWidth: 0 }} 
                       activeDot={{ r: 4, fill: '#ffffff' }} 
                     />
                   </LineChart>
                 </ResponsiveContainer>
              </div>
              
              <div className="flex justify-between text-[9px] text-vexto-textMuted tracking-widest uppercase border-t border-white/5 pt-3">
                 {chartData.map((point) => (
                   <span key={point.time}>{point.time}</span>
                 ))}
              </div>
           </div>
        </div>
      </div>
    </main>
  );
}