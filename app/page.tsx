"use client";

import LiveMap from '../components/LiveMap';
import React, { useEffect, useState } from 'react';
import { Wifi, ArrowUpRight, Navigation } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { supabase, LiveVehiclePosition } from '../lib/supabaseClient';

const fallbackPassengerData = [
  { time: '06:00', value: 45 },
  { time: '09:00', value: 57 },
  { time: '12:00', value: 60 },
  { time: '15:00', value: 52 },
  { time: '18:00', value: 55 },
  { time: '21:00', value: 48 },
];

export default function Dashboard() {
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [livePosition, setLivePosition] = useState<LiveVehiclePosition | null>(null);
  const [activeDelivery, setActiveDelivery] = useState<any>(null);

  // 1. BUSCAR TODOS OS VEÍCULOS REGISTADOS NA BASE DE DADOS EM TEMPO REAL
  useEffect(() => {
    async function fetchVehicles() {
      const { data, error } = await supabase.from('vehicles').select('*');
      if (data && data.length > 0) {
        setVehicles(data);
        if (!selectedVehicleId) {
          setSelectedVehicleId(data[0].id);
        }
      } else if (error) {
        console.error("Erro ao buscar veículos:", error);
      }
    }

    fetchVehicles();

    const vehiclesChannel = supabase.channel('global-vehicles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, () => {
        fetchVehicles();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(vehiclesChannel);
    };
  }, []);

  // 2. ESCUTA DINÂMICA DO GPS DO VEÍCULO SELECIONADO NA BARRA LATERAL
  useEffect(() => {
    if (!selectedVehicleId) return;

    supabase
      .from('vehicle_positions')
      .select('*')
      .eq('vehicle_id', selectedVehicleId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) {
          setLivePosition(data[0] as LiveVehiclePosition);
        } else {
          setLivePosition(null);
        }
      });

    const channel = supabase
      .channel(`dynamic-pos-${selectedVehicleId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'vehicle_positions', filter: `vehicle_id=eq.${selectedVehicleId}` },
        (payload: any) => {
          setLivePosition(payload.new);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedVehicleId]);

  // 3. ESCUTAR ENTREGAS DO VEÍCULO SELECIONADO (Com maybeSingle seguro contra 406)
  useEffect(() => {
    if (!selectedVehicleId) {
      setActiveDelivery(null);
      return;
    }

    const fetchDelivery = async () => {
      try {
        const { data } = await supabase
          .from('deliveries')
          .select('*')
          .eq('driver_id', selectedVehicleId)
          .eq('status', 'in_progress')
          .maybeSingle();
        
        setActiveDelivery(data || null);
      } catch (err) {
        setActiveDelivery(null);
      }
    };
    fetchDelivery();

    const deliveriesChannel = supabase.channel(`deliveries-${selectedVehicleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries', filter: `driver_id=eq.${selectedVehicleId}` }, (payload: any) => {
         if (payload.new && (payload.new.status === 'completed' || payload.new.status === 'cancelled')) {
           setActiveDelivery(null);
         } else if (payload.new && payload.new.status === 'in_progress') {
           setActiveDelivery(payload.new);
         }
      }).subscribe();

    return () => { supabase.removeChannel(deliveriesChannel); };
  }, [selectedVehicleId]);

  const onlineCount = vehicles.length || 2;
  const offlineCount = 0;
  const passengerToday = 142580;
  const chartData = fallbackPassengerData;

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
        </div>

        {isLiveGpsActive && (
          <div className="glass-panel px-4 py-1.5 rounded-full flex w-fit items-center gap-2 border border-vexto-green/30">
            <span className="w-1.5 h-1.5 rounded-full bg-vexto-green animate-pulse"></span>
            <span className="text-vexto-green text-xs font-medium tracking-wide">GPS REAL AO VIVO</span>
          </div>
        )}
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
                <span className="text-vexto-textMuted text-xs">Ativos</span>
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
              <div 
                key={vehicle.id} 
                onClick={() => setSelectedVehicleId(vehicle.id)}
                className={`glass-pod p-4 flex flex-col gap-3 relative overflow-hidden group cursor-pointer transition-all border ${selectedVehicleId === vehicle.id ? 'border-vexto-green bg-vexto-green/5 shadow-[0_0_15px_rgba(34,197,94,0.1)]' : 'border-white/5 hover:border-white/20'}`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-white text-sm font-medium tracking-tight">{vehicle.display_name || vehicle.displayName || 'Veículo'}</h3>
                  </div>
                  <ArrowUpRight className="text-vexto-textMuted w-4 h-4 group-hover:text-white transition-colors" />
                </div>

                <div className="h-14 border border-white/5 rounded-lg flex items-center justify-center bg-black/20 relative overflow-hidden mt-1">
                  <div className="border border-white/10 px-3 py-1 rounded bg-black/60 backdrop-blur-md flex items-center gap-2 z-10">
                    <span className="text-vexto-textMuted text-[10px]">L</span>
                    <span className="text-white text-xs tracking-widest font-medium uppercase">{vehicle.plate || 'S/N'}</span>
                  </div>
                </div>

                <div className="flex justify-between items-center text-[10px] font-medium tracking-wide">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-vexto-green shadow-[0_0_8px_rgba(34,197,94,0.8)]"></span>
                    <span className="text-vexto-green">Online</span>
                  </div>
                  <div className="flex gap-3 text-vexto-textMuted">
                    <span className="flex items-center gap-1"><Wifi className="w-3 h-3" /> GPS</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="absolute bottom-8 right-8 z-20 flex items-end gap-6 pointer-events-none">
        <div className="glass-panel w-120 p-6 pointer-events-auto border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.5)] flex flex-col justify-between">
           <div className="flex justify-between items-start mb-5">
              <div>
                 <h3 className="text-white text-sm font-medium tracking-tight">
                   Análise: {selectedVeh?.display_name || selectedVeh?.displayName || 'Frota'}
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
           </div>

           <div>
              <div className="flex justify-between items-end mb-2">
                <span className="text-vexto-textMuted text-[10px] uppercase tracking-widest">Volume de Passageiros (Hoje)</span>
                <span className="text-2xl text-functional text-white">{passengerToday.toLocaleString('en-US')}</span>
              </div>
              <div className="h-28 w-full relative mb-3">
                 <ResponsiveContainer width="100%" height="100%">
                   <LineChart data={chartData}>
                     <Line type="monotone" dataKey="value" stroke="#ffffff" strokeWidth={1.5} dot={{ r: 2, fill: '#ffffff', strokeWidth: 0 }} activeDot={{ r: 4, fill: '#ffffff' }} />
                   </LineChart>
                 </ResponsiveContainer>
              </div>
           </div>
        </div>
      </div>
    </main>
  );
}