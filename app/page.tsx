"use client";

import LiveMap from '../components/LiveMap';
import React, { useEffect, useState } from 'react';
import { Wifi, ArrowUpRight, TrendingUp, Zap, Activity } from 'lucide-react';
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
  
  // NOVOS ESTADOS ANALÍTICOS
  const [dynamicChartData, setDynamicChartData] = useState<any[]>(fallbackPassengerData);
  const [delayedDeliveriesCount, setDelayedDeliveriesCount] = useState<number>(0);

  // 1. Fetch de Veículos
  useEffect(() => {
    async function fetchVehicles() {
      const { data, error } = await supabase.from('vehicles').select('*');
      if (data && data.length > 0) {
        setVehicles(data);
        if (!selectedVehicleId) setSelectedVehicleId(data[0].id);
      }
    }
    fetchVehicles();
    const vehiclesChannel = supabase.channel('global-vehicles-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, () => fetchVehicles())
      .subscribe();
    return () => { supabase.removeChannel(vehiclesChannel); };
  }, [selectedVehicleId]);

  // 2. Rastreio GPS do Veículo Selecionado
  useEffect(() => {
    if (!selectedVehicleId) return;
    supabase.from('vehicle_positions').select('*').eq('vehicle_id', selectedVehicleId).order('updated_at', { ascending: false }).limit(1)
      .then(({ data }) => setLivePosition(data && data.length > 0 ? data[0] as LiveVehiclePosition : null));

    const channel = supabase.channel(`pos-${selectedVehicleId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vehicle_positions', filter: `vehicle_id=eq.${selectedVehicleId}` },
        (payload: any) => setLivePosition(payload.new)
      ).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedVehicleId]);

  // 3. Entrega Ativa do Veículo (Barra Lateral)
  useEffect(() => {
    if (!selectedVehicleId) { setActiveDelivery(null); return; }
    const fetchDelivery = async () => {
      const { data } = await supabase.from('deliveries').select('*').eq('driver_id', selectedVehicleId).eq('status', 'in_progress').maybeSingle();
      setActiveDelivery(data || null);
    };
    fetchDelivery();
    const delChannel = supabase.channel(`delivery-hud-${selectedVehicleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries', filter: `driver_id=eq.${selectedVehicleId}` },
        (payload: any) => {
           if (payload.new && (payload.new.status === 'completed' || payload.new.status === 'cancelled')) setActiveDelivery(null);
           else if (payload.new && payload.new.status === 'in_progress') setActiveDelivery(payload.new);
        }
      ).subscribe();
    return () => { supabase.removeChannel(delChannel); };
  }, [selectedVehicleId]);

  // 4. CÉREBRO ANALÍTICO (Gráfico Real e Alertas de SLA)
  useEffect(() => {
    async function fetchAnalyticsAndSLA() {
      const { data, error } = await supabase.from('deliveries').select('*');
      if (error || !data) return;

      // LÓGICA DE SLA (Atrasos globais na frota)
      const now = new Date();
      const delayed = data.filter(d => {
        if (d.status !== 'in_progress' || !d.created_at) return false;
        const created = new Date(d.created_at);
        const diffMins = (now.getTime() - created.getTime()) / 60000;
        return diffMins > 3; // SE DEMORAR MAIS DE 3 MINUTOS = ALERTA!
      });
      setDelayedDeliveriesCount(delayed.length);

      // LÓGICA DO GRÁFICO (Entregas concluídas do veículo hoje)
      if (selectedVehicleId) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const completedToday = data.filter(d => 
          d.driver_id === selectedVehicleId && 
          d.status === 'completed' && 
          new Date(d.created_at) >= today
        );

        if (completedToday.length > 0) {
          const grouped: Record<string, number> = {};
          completedToday.forEach(d => {
            const h = new Date(d.created_at).getHours();
            const key = `${h.toString().padStart(2, '0')}:00`;
            grouped[key] = (grouped[key] || 0) + 1;
          });
          const newChart = Object.keys(grouped).map(k => ({ time: k, value: grouped[k] })).sort((a,b) => a.time.localeCompare(b.time));
          if (newChart.length === 1) newChart.unshift({ time: '00:00', value: 0 });
          setDynamicChartData(newChart);
        } else {
          setDynamicChartData(fallbackPassengerData);
        }
      }
    }

    fetchAnalyticsAndSLA();
    const interval = setInterval(fetchAnalyticsAndSLA, 60000);

    const analyticsChannel = supabase.channel('global-analytics')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => {
        fetchAnalyticsAndSLA();
      }).subscribe();

    return () => { clearInterval(interval); supabase.removeChannel(analyticsChannel); };
  }, [selectedVehicleId]);

  const onlineCount = vehicles.filter(v => v.status === 'online').length;
  const offlineCount = vehicles.filter(v => v.status !== 'online').length;
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

      <div className="absolute top-8 right-8 z-20 flex gap-4 pointer-events-none">
        <div className="glass-panel px-5 py-3 rounded-xl flex items-center gap-4 border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.5)] pointer-events-auto">
           <div className="flex flex-col">
             <span className="text-vexto-textMuted text-[10px] uppercase tracking-widest flex items-center gap-1"><Activity className="w-3 h-3 text-vexto-green"/> Eficiência Global</span>
             <span className="text-xl text-white font-medium">78.3%</span>
           </div>
           <div className="w-px h-8 bg-white/10"></div>
           <div className="flex flex-col">
             <span className="text-vexto-textMuted text-[10px] uppercase tracking-widest flex items-center gap-1"><Zap className="w-3 h-3 text-vexto-green"/> IA Scanning</span>
             <span className="text-xl text-white font-medium">+48.4%</span>
           </div>
           <div className="w-px h-8 bg-white/10"></div>
           <div className="flex flex-col">
             <span className="text-vexto-textMuted text-[10px] uppercase tracking-widest flex items-center gap-1"><TrendingUp className="w-3 h-3 text-vexto-green"/> Mkt Shift</span>
             <span className="text-xl text-white font-medium">72%</span>
           </div>
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
            {vehicles.map(vehicle => {
              const isOnline = vehicle.status === 'online';
              return (
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
                      <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-vexto-green shadow-[0_0_8px_rgba(34,197,94,0.8)]' : 'bg-vexto-red shadow-[0_0_8px_rgba(239,68,68,0.8)]'}`}></span>
                      <span className={isOnline ? 'text-vexto-green' : 'text-vexto-red'}>
                        {isOnline ? 'Online' : 'Offline'}
                      </span>
                    </div>
                    <div className="flex gap-3 text-vexto-textMuted">
                      <span className="flex items-center gap-1"><Wifi className="w-3 h-3" /> {isOnline ? 'GPS' : '—'}</span>
                    </div>
                  </div>
                </div>
              );
            })}
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
                <span className="text-vexto-textMuted text-[10px] uppercase tracking-widest">Número de Horas Trabalhadas (Hoje)</span>
                <span className="text-2xl text-functional text-white">
                  {selectedVeh?.status === 'online' ? '01h 15m' : '00h 00m'}
                </span>
              </div>
              <div className="h-28 w-full relative mb-3">
                 <ResponsiveContainer width="100%" height="100%">
                   <LineChart data={dynamicChartData}>
                     <Line type="monotone" dataKey="value" stroke="#22c55e" strokeWidth={1.5} dot={{ r: 2, fill: '#22c55e', strokeWidth: 0 }} activeDot={{ r: 4, fill: '#22c55e' }} />
                   </LineChart>
                 </ResponsiveContainer>
              </div>
           </div>
        </div>
      </div>

      {delayedDeliveriesCount > 0 && (
        <div className="absolute bottom-8 left-110 z-20 flex flex-col gap-3 pointer-events-none">
          <div className="glass-panel w-80 p-5 pointer-events-auto border-vexto-red/30 shadow-[0_10px_40px_rgba(239,68,68,0.15)] backdrop-blur-xl bg-black/40 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-white text-sm font-medium tracking-wide">Alerta Operacional</span>
            </div>
            <div className="flex items-center gap-2 mb-4">
              <div className="px-2 py-1 bg-white/10 rounded text-white text-[10px] tracking-widest uppercase border border-white/10">
                Risco de Atraso (SLA)
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-vexto-red shadow-[0_0_8px_rgba(239,68,68,0.8)] mt-1.5 animate-pulse"></div>
              <div className="flex flex-col gap-1">
                <span className="text-white text-sm">{delayedDeliveriesCount} Entrega(s) fora da janela</span>
                <span className="text-vexto-textMuted text-[10px]">Detetado pelo sistema IA (&gt; 3 min)</span>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-white/10 flex flex-col gap-2">
               <span className="text-vexto-textMuted text-[10px] uppercase tracking-widest">Ação Preditiva (IA):</span>
               <div className="flex justify-between items-center group cursor-pointer bg-vexto-green/10 border border-vexto-green/20 px-3 py-2 rounded hover:bg-vexto-green/20 transition-colors">
                  <span className="text-vexto-green text-xs font-medium">Analisar opções de reatribuição</span>
                  <ArrowUpRight className="text-vexto-green w-3 h-3 group-hover:text-white transition-colors" />
               </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}