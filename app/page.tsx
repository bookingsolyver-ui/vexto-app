"use client";

import LiveMap from '../components/LiveMap';
import React, { useEffect, useState } from 'react';
import { Wifi, ArrowUpRight, TrendingUp, Zap, Activity, Clock, AlertTriangle, CheckCircle2, Truck, MapPin, Search, Globe, PlusCircle, X } from 'lucide-react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase, LiveVehiclePosition } from '../lib/supabaseClient';

const fallbackPassengerData = [
  { time: '06:00', value: 45 },
  { time: '09:00', value: 57 },
  { time: '12:00', value: 60 },
  { time: '15:00', value: 52 },
  { time: '18:00', value: 55 },
  { time: '21:00', value: 48 },
];

// DICIONÁRIO DE LOCALIZAÇÃO (ATUALIZADO COM MODAL DE ENTREGAS)
const translations = {
  PT: {
    liveMap: "Live Map",
    fleet: "Frota",
    routes: "Rotas",
    analytics: "Analytics",
    active: "Ativos",
    offline: "Offline",
    search: "Procurar veículo...",
    fleetDir: "Diretório de Frota",
    fleetDesc: "Gestão completa de ativos, veículos e estado operacional.",
    statusCurrent: "Estado Atual:",
    statusActive: "Ativo / Em Campo",
    statusGarage: "Offline / Garagem",
    routesMon: "Monitoramento de Rotas",
    routesDesc: "Cronograma logístico, entregas em curso e pontos de passagem.",
    activeRoute: "Rota Ativa",
    departure: "Partida",
    eta: "Previsão",
    inTransit: "Em Trânsito",
    completed: "Concluída",
    deliveredAt: "Entregue às",
    overview: "Visão Geral da Frota",
    overviewDesc: "Desempenho operacional e telemetria preditiva das últimas 24h.",
    delCompleted: "Entregas Concluídas (Hoje)",
    avgTime: "Tempo Médio de Serviço",
    slaRisks: "Riscos de SLA Ativos",
    perfVolume: "Desempenho da Frota: Volume vs Capacidade",
    live: "Ao Vivo",
    analysis: "Análise",
    inProgress: "Serviço em Curso",
    available: "Livre / Patrulha",
    hoursWorked: "Número de Horas Trabalhadas (Hoje)",
    gpsReal: "GPS REAL AO VIVO",
    globalEff: "Eficiência Global",
    aiScan: "IA Scanning",
    mktShift: "Mkt Shift",
    opAlert: "Alerta Operacional",
    slaRisk: "Risco de Atraso (SLA)",
    outOfWindow: "Entrega(s) fora da janela",
    aiDetected: "Detetado pelo sistema IA (> 3 min)",
    predAction: "Ação Preditiva (IA):",
    analyzeReassign: "Analisar opções de reatribuição",
    logCenter: "Centro Logístico",
    warehouse: "Armazém Norte",
    zone: "Zona Sul",
    newDelivery: "Nova Entrega",
    dispatchAction: "Despachar Serviço",
    customerName: "Nome do Cliente",
    destAddress: "Morada de Destino",
    selectDriver: "Atribuir a Veículo",
    cancel: "Cancelar",
    confirmDispatch: "Confirmar Despacho"
  },
  EN: {
    liveMap: "Live Map",
    fleet: "Fleet",
    routes: "Routes",
    analytics: "Analytics",
    active: "Active",
    offline: "Offline",
    search: "Search vehicle...",
    fleetDir: "Fleet Directory",
    fleetDesc: "Complete asset, vehicle, and operational status management.",
    statusCurrent: "Current Status:",
    statusActive: "Active / On Field",
    statusGarage: "Offline / Garage",
    routesMon: "Route Monitoring",
    routesDesc: "Logistics timeline, ongoing deliveries, and waypoints.",
    activeRoute: "Active Route",
    departure: "Departure",
    eta: "ETA",
    inTransit: "In Transit",
    completed: "Completed",
    deliveredAt: "Delivered at",
    overview: "Fleet Overview",
    overviewDesc: "Operational performance and predictive telemetry (last 24h).",
    delCompleted: "Completed Deliveries (Today)",
    avgTime: "Avg. Service Time",
    slaRisks: "Active SLA Risks",
    perfVolume: "Fleet Performance: Volume vs Capacity",
    live: "Live",
    analysis: "Analysis",
    inProgress: "In Progress",
    available: "Available / Patrol",
    hoursWorked: "Number of Hours Worked (Today)",
    gpsReal: "LIVE REAL-TIME GPS",
    globalEff: "Global Efficiency",
    aiScan: "AI Scanning",
    mktShift: "Mkt Shift",
    opAlert: "Operational Alert",
    slaRisk: "Delay Risk (SLA)",
    outOfWindow: "Delivery(ies) out of window",
    aiDetected: "Detected by AI system (> 3 min)",
    predAction: "Predictive Action (AI):",
    analyzeReassign: "Analyze reassignment options",
    logCenter: "Logistics Center",
    warehouse: "North Warehouse",
    zone: "South Zone",
    newDelivery: "New Delivery",
    dispatchAction: "Dispatch Service",
    customerName: "Customer Name",
    destAddress: "Destination Address",
    selectDriver: "Assign to Vehicle",
    cancel: "Cancel",
    confirmDispatch: "Confirm Dispatch"
  }
};

export default function Dashboard() {
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [livePosition, setLivePosition] = useState<LiveVehiclePosition | null>(null);
  const [activeDelivery, setActiveDelivery] = useState<any>(null);
  
  const [dynamicChartData, setDynamicChartData] = useState<any[]>(fallbackPassengerData);
  const [delayedDeliveriesCount, setDelayedDeliveriesCount] = useState<number>(0);
  const [totalDeliveriesToday, setTotalDeliveriesToday] = useState<number>(0);

  const [activeTab, setActiveTab] = useState<'live_map' | 'fleet' | 'routes' | 'analytics'>('live_map');
  const [lang, setLang] = useState<'PT' | 'EN'>('PT');
  const t = translations[lang];

  // NOVO: ESTADOS PARA O MODAL DE DESPACHO
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deliveryForm, setDeliveryForm] = useState({ customer: '', destination: '', driverId: '' });

  useEffect(() => {
    async function fetchVehicles() {
      const { data, error } = await supabase.from('vehicles').select('*');
      if (data && data.length > 0) {
        setVehicles(data);
        if (!selectedVehicleId) setSelectedVehicleId(data[0].id);
        if (!deliveryForm.driverId) setDeliveryForm(prev => ({ ...prev, driverId: data[0].id }));
      }
    }
    fetchVehicles();
    const vehiclesChannel = supabase.channel('global-vehicles-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, () => fetchVehicles())
      .subscribe();
    return () => { supabase.removeChannel(vehiclesChannel); };
  }, [selectedVehicleId]);

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

  useEffect(() => {
    async function fetchAnalyticsAndSLA() {
      const { data, error } = await supabase.from('deliveries').select('*');
      if (error || !data) return;

      const now = new Date();
      const delayed = data.filter(d => {
        if (d.status !== 'in_progress' || !d.created_at) return false;
        const created = new Date(d.created_at);
        const diffMins = (now.getTime() - created.getTime()) / 60000;
        return diffMins > 3; 
      });
      setDelayedDeliveriesCount(delayed.length);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const allCompletedToday = data.filter(d => d.status === 'completed' && new Date(d.created_at) >= today);
      setTotalDeliveriesToday(allCompletedToday.length);

      if (selectedVehicleId) {
        const completedToday = allCompletedToday.filter(d => d.driver_id === selectedVehicleId);
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

  // NOVO: FUNÇÃO PARA DESPACHAR ENTREGA REAL
  async function handleDispatchDelivery(e: React.FormEvent) {
    e.preventDefault();
    if (!deliveryForm.driverId || !deliveryForm.customer || !deliveryForm.destination) return;

    await supabase.from('deliveries').insert({
      id: crypto.randomUUID(),
      driver_id: deliveryForm.driverId,
      customer: deliveryForm.customer,
      destination: deliveryForm.destination,
      status: 'in_progress' // Ao inserir como in_progress, a app do motorista reage logo!
    });

    setIsModalOpen(false);
    setDeliveryForm({ customer: '', destination: '', driverId: vehicles[0]?.id || '' });
    // Força a navegação para o mapa para o gestor ver o veículo selecionado
    setSelectedVehicleId(deliveryForm.driverId);
    setActiveTab('live_map'); 
  }

  const onlineCount = vehicles.filter(v => v.status === 'online').length;
  const offlineCount = vehicles.filter(v => v.status !== 'online').length;
  const isLiveGpsActive = livePosition && Date.now() - new Date(livePosition.updated_at).getTime() < 15000;
  const selectedVeh = vehicles.find(v => v.id === selectedVehicleId) || vehicles[0];

  return (
    <main className="h-screen w-full relative flex overflow-hidden bg-vexto-bg text-white font-helvetica-neue">
      
      <div className="absolute inset-0 z-0 transition-opacity duration-500">
        {activeTab === 'live_map' && (
          <>
            <LiveMap selectedVehicleId={selectedVehicleId} onSelectVehicle={setSelectedVehicleId} />
            <div className="absolute inset-0 bg-vexto-bg/40 pointer-events-none"></div>
          </>
        )}

        {/* ABA: FLEET */}
        {activeTab === 'fleet' && (
          <div className="w-full h-full p-32 pl-120 pt-40 overflow-y-auto custom-scrollbar animate-in fade-in duration-300">
            <div className="max-w-6xl">
              <div className="flex justify-between items-end mb-12">
                <div>
                  <h2 className="text-3xl font-medium tracking-tight mb-2">{t.fleetDir}</h2>
                  <p className="text-vexto-textMuted text-sm">{t.fleetDesc}</p>
                </div>
                <div className="glass-panel px-4 py-2 border border-white/10 rounded-lg flex items-center gap-2">
                  <Search className="w-4 h-4 text-vexto-textMuted" />
                  <input type="text" placeholder={t.search} className="bg-transparent border-none text-sm text-white outline-none placeholder:text-vexto-textMuted w-48" />
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
                {vehicles.map(v => (
                  <div key={v.id} className="glass-panel p-6 border border-white/5 rounded-2xl flex flex-col gap-4 hover:border-white/20 transition-all cursor-pointer group">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/10 group-hover:border-vexto-green/50 transition-colors">
                          <Truck className="w-5 h-5 text-vexto-textMuted group-hover:text-vexto-green" />
                        </div>
                        <div>
                          <h3 className="text-white font-medium">{v.display_name}</h3>
                          <span className="text-vexto-textMuted text-[10px] uppercase tracking-widest">{v.plate}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${v.status === 'online' ? 'bg-vexto-green shadow-[0_0_8px_rgba(34,197,94,0.8)]' : 'bg-vexto-red'}`}></span>
                      </div>
                    </div>
                    <div className="pt-4 border-t border-white/5 flex justify-between items-center text-xs">
                      <span className="text-vexto-textMuted">{t.statusCurrent}</span>
                      <span className={v.status === 'online' ? 'text-vexto-green font-medium' : 'text-vexto-red font-medium'}>
                        {v.status === 'online' ? t.statusActive : t.statusGarage}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ABA: ROUTES (COM BOTÃO DE NOVA ENTREGA) */}
        {activeTab === 'routes' && (
          <div className="w-full h-full p-32 pl-120 pt-40 overflow-y-auto custom-scrollbar animate-in fade-in duration-300">
            <div className="max-w-6xl">
              <div className="flex justify-between items-end mb-12">
                <div>
                  <h2 className="text-3xl font-medium tracking-tight mb-2">{t.routesMon}</h2>
                  <p className="text-vexto-textMuted text-sm">{t.routesDesc}</p>
                </div>
                {/* BOTÃO PARA ABRIR O MODAL DE DESPACHO */}
                <button onClick={() => setIsModalOpen(true)} className="bg-vexto-green text-black px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-vexto-green/90 hover:scale-105 transition-all shadow-[0_0_20px_rgba(34,197,94,0.2)]">
                  <PlusCircle className="w-4 h-4" /> {t.newDelivery}
                </button>
              </div>

              <div className="flex flex-col gap-4">
                {activeDelivery ? (
                  <div className="glass-panel p-6 border border-white/10 rounded-2xl flex items-center justify-between hover:border-vexto-green/50 transition-all cursor-pointer">
                    <div className="flex items-center gap-6 w-1/3">
                      <div className="w-12 h-12 rounded-full bg-vexto-green/10 border border-vexto-green/30 flex items-center justify-center">
                        <Truck className="w-5 h-5 text-vexto-green" />
                      </div>
                      <div>
                        <h4 className="text-white font-medium">{selectedVeh?.display_name || 'Veículo'}</h4>
                        <p className="text-vexto-green text-[10px] uppercase tracking-widest font-bold mt-1">{t.activeRoute}</p>
                      </div>
                    </div>
                    
                    <div className="flex-1 flex items-center justify-center gap-4">
                      <div className="flex flex-col items-end w-32 text-right">
                        <span className="text-white text-sm font-medium">{activeDelivery.customer || t.logCenter}</span>
                        <span className="text-vexto-textMuted text-[10px]">{t.departure}: Agora</span>
                      </div>
                      <div className="w-32 h-px bg-white/20 relative">
                        <div className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-vexto-green animate-ping"></div>
                      </div>
                      <div className="flex flex-col items-start w-32 text-left">
                        <span className="text-white text-sm font-medium truncate w-full">{activeDelivery.destination || 'Destino'}</span>
                        <span className="text-vexto-textMuted text-[10px]">{t.eta}: ---</span>
                      </div>
                    </div>

                    <div className="w-1/4 flex justify-end">
                      <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-lg text-xs text-white flex items-center gap-2">
                        <MapPin className="w-3 h-3 text-vexto-textMuted" /> {t.inTransit}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="glass-panel p-10 border border-white/5 rounded-2xl flex flex-col items-center justify-center gap-3 text-vexto-textMuted opacity-60">
                     <MapPin className="w-8 h-8 opacity-50" />
                     <p className="text-sm">Nenhuma rota ativa no momento.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ABA: ANALYTICS */}
        {activeTab === 'analytics' && (
          <div className="w-full h-full p-32 pl-120 pt-40 overflow-y-auto custom-scrollbar animate-in fade-in duration-300">
             <div className="max-w-6xl">
                <div className="mb-12">
                   <h2 className="text-3xl font-medium tracking-tight mb-2">{t.overview}</h2>
                   <p className="text-vexto-textMuted text-sm">{t.overviewDesc}</p>
                </div>

                <div className="grid grid-cols-3 gap-6 mb-8">
                   <div className="glass-panel p-6 border border-white/5 rounded-2xl flex flex-col gap-2">
                      <span className="text-vexto-textMuted text-xs flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-vexto-green" /> {t.delCompleted}</span>
                      <span className="text-4xl text-functional text-white">{totalDeliveriesToday}</span>
                   </div>
                   <div className="glass-panel p-6 border border-white/5 rounded-2xl flex flex-col gap-2">
                      <span className="text-vexto-textMuted text-xs flex items-center gap-2"><Clock className="w-4 h-4 text-amber-500" /> {t.avgTime}</span>
                      <span className="text-4xl text-functional text-white">24m</span>
                   </div>
                   <div className="glass-panel p-6 border border-white/5 rounded-2xl flex flex-col gap-2">
                      <span className="text-vexto-textMuted text-xs flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-vexto-red" /> {t.slaRisks}</span>
                      <span className="text-4xl text-functional text-white">{delayedDeliveriesCount}</span>
                   </div>
                </div>

                <div className="glass-panel p-8 border border-white/5 rounded-2xl h-96 w-full flex flex-col">
                   <div className="flex justify-between items-center mb-6">
                      <h3 className="text-sm font-medium">{t.perfVolume}</h3>
                      <span className="px-3 py-1 bg-vexto-green/10 text-vexto-green text-[10px] uppercase tracking-widest rounded border border-vexto-green/20">{t.live}</span>
                   </div>
                   <div className="flex-1 w-full relative">
                      <ResponsiveContainer width="100%" height="100%">
                         <AreaChart data={dynamicChartData}>
                           <defs>
                             <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                               <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                               <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                             </linearGradient>
                           </defs>
                           <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                           <XAxis dataKey="time" stroke="#666" fontSize={10} tickLine={false} axisLine={false} />
                           <YAxis stroke="#666" fontSize={10} tickLine={false} axisLine={false} />
                           <Tooltip contentStyle={{ backgroundColor: '#000', border: '1px solid #333', borderRadius: '8px' }} />
                           <Area type="monotone" dataKey="value" stroke="#22c55e" strokeWidth={2} fillOpacity={1} fill="url(#colorValue)" />
                         </AreaChart>
                      </ResponsiveContainer>
                   </div>
                </div>
             </div>
          </div>
        )}
      </div>

      {/* MENU SUPERIOR ESQUERDO */}
      <div className="absolute top-8 left-112.5 z-20 flex flex-col gap-2">
        <div className="glass-panel px-8 py-3 rounded-full flex items-center gap-8 border border-white/5 shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
          <button onClick={() => setActiveTab('live_map')} className="flex items-center gap-2 cursor-pointer group">
            <div className={`w-1.5 h-1.5 rounded-full ${activeTab === 'live_map' ? 'bg-vexto-green shadow-[0_0_8px_rgba(34,197,94,0.8)]' : 'bg-transparent group-hover:bg-white/50 transition-colors'}`}></div>
            <span className={`text-sm font-medium transition-colors ${activeTab === 'live_map' ? 'text-white' : 'text-vexto-textMuted group-hover:text-white'}`}>{t.liveMap}</span>
          </button>
          
          <button onClick={() => setActiveTab('fleet')} className="flex items-center gap-2 cursor-pointer group">
            <div className={`w-1.5 h-1.5 rounded-full ${activeTab === 'fleet' ? 'bg-vexto-green shadow-[0_0_8px_rgba(34,197,94,0.8)]' : 'bg-transparent group-hover:bg-white/50 transition-colors'}`}></div>
            <span className={`text-sm font-medium transition-colors ${activeTab === 'fleet' ? 'text-white' : 'text-vexto-textMuted group-hover:text-white'}`}>{t.fleet}</span>
          </button>
          
          <button onClick={() => setActiveTab('routes')} className="flex items-center gap-2 cursor-pointer group">
            <div className={`w-1.5 h-1.5 rounded-full ${activeTab === 'routes' ? 'bg-vexto-green shadow-[0_0_8px_rgba(34,197,94,0.8)]' : 'bg-transparent group-hover:bg-white/50 transition-colors'}`}></div>
            <span className={`text-sm font-medium transition-colors ${activeTab === 'routes' ? 'text-white' : 'text-vexto-textMuted group-hover:text-white'}`}>{t.routes}</span>
          </button>
          
          <button onClick={() => setActiveTab('analytics')} className="flex items-center gap-2 cursor-pointer group">
            <div className={`w-1.5 h-1.5 rounded-full ${activeTab === 'analytics' ? 'bg-vexto-green shadow-[0_0_8px_rgba(34,197,94,0.8)]' : 'bg-transparent group-hover:bg-white/50 transition-colors'}`}></div>
            <span className={`text-sm font-medium transition-colors ${activeTab === 'analytics' ? 'text-white' : 'text-vexto-textMuted group-hover:text-white'}`}>{t.analytics}</span>
          </button>
        </div>
        
        {isLiveGpsActive && activeTab === 'live_map' && (
          <div className="glass-panel px-4 py-1.5 rounded-full flex w-fit items-center gap-2 border border-vexto-green/30 animate-in fade-in">
            <span className="w-1.5 h-1.5 rounded-full bg-vexto-green animate-pulse"></span>
            <span className="text-vexto-green text-xs font-medium tracking-wide">{t.gpsReal}</span>
          </div>
        )}
      </div>

      {/* BLOCO DE MÉTRICAS GLOBAIS E SELETOR DE IDIOMA */}
      <div className="absolute top-8 right-8 z-20 flex gap-4 pointer-events-none animate-in fade-in">
        <div className="glass-panel p-1 rounded-xl flex items-center gap-1 border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.5)] pointer-events-auto bg-black/40 backdrop-blur-md h-12">
           <div className="pl-3 pr-2 text-vexto-textMuted"><Globe className="w-4 h-4" /></div>
           <button onClick={() => setLang('PT')} className={`px-2.5 py-1.5 rounded-lg text-[10px] uppercase tracking-widest font-bold transition-all ${lang === 'PT' ? 'bg-vexto-green text-black' : 'text-vexto-textMuted hover:text-white'}`}>PT</button>
           <button onClick={() => setLang('EN')} className={`px-2.5 py-1.5 rounded-lg text-[10px] uppercase tracking-widest font-bold transition-all mr-1 ${lang === 'EN' ? 'bg-vexto-green text-black' : 'text-vexto-textMuted hover:text-white'}`}>EN</button>
        </div>

        {activeTab === 'live_map' && (
          <div className="glass-panel px-5 py-3 rounded-xl flex items-center gap-4 border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.5)] pointer-events-auto h-12">
             <div className="flex flex-col">
               <span className="text-vexto-textMuted text-[9px] uppercase tracking-widest flex items-center gap-1"><Activity className="w-3 h-3 text-vexto-green"/> {t.globalEff}</span>
               <span className="text-lg text-white font-medium leading-tight">78.3%</span>
             </div>
             <div className="w-px h-8 bg-white/10"></div>
             <div className="flex flex-col">
               <span className="text-vexto-textMuted text-[9px] uppercase tracking-widest flex items-center gap-1"><Zap className="w-3 h-3 text-vexto-green"/> {t.aiScan}</span>
               <span className="text-lg text-white font-medium leading-tight">+48.4%</span>
             </div>
             <div className="w-px h-8 bg-white/10"></div>
             <div className="flex flex-col">
               <span className="text-vexto-textMuted text-[9px] uppercase tracking-widest flex items-center gap-1"><TrendingUp className="w-3 h-3 text-vexto-green"/> {t.mktShift}</span>
               <span className="text-lg text-white font-medium leading-tight">72%</span>
             </div>
          </div>
        )}
      </div>

      {/* BARRA LATERAL (INTOCÁVEL) */}
      <div className="glass-panel w-105 h-full rounded-none relative z-10 flex flex-col bg-vexto-bg/80 backdrop-blur-xl border-y-0 border-l-0 border-r border-white/5 overflow-hidden shadow-[10px_0_40px_rgba(0,0,0,0.5)]">
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
                <span className="text-vexto-textMuted text-xs">{t.active}</span>
              </div>
              <span className="text-2xl text-functional text-white mt-1">{onlineCount}</span>
            </div>
            <div className="flex-1 glass-panel px-5 py-4 rounded-2xl flex flex-col gap-1 border border-white/5">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-vexto-red shadow-[0_0_8px_rgba(239,68,68,0.8)]"></span>
                <span className="text-vexto-textMuted text-xs">{t.offline}</span>
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

      {/* PAINEL DE ANÁLISE INFERIOR */}
      {activeTab === 'live_map' && (
        <div className="absolute bottom-8 right-8 z-20 flex items-end gap-6 pointer-events-none animate-in fade-in">
          <div className="glass-panel w-120 p-6 pointer-events-auto border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.5)] flex flex-col justify-between">
             <div className="flex justify-between items-start mb-5">
                <div>
                   <h3 className="text-white text-sm font-medium tracking-tight">
                     {t.analysis} {selectedVeh?.display_name || selectedVeh?.displayName || 'Frota'}
                   </h3>
                   <div className="flex items-center gap-2 mt-2">
                     {activeDelivery ? (
                       <div className="px-2 py-1 bg-vexto-green/10 border border-vexto-green/30 rounded text-vexto-green text-[10px] uppercase tracking-widest font-bold flex items-center gap-2">
                         <span className="w-1.5 h-1.5 rounded-full bg-vexto-green animate-pulse"></span>
                         {t.inProgress}
                       </div>
                     ) : (
                       <div className="px-2 py-1 bg-amber-500/10 border border-amber-500/30 rounded text-amber-500 text-[10px] uppercase tracking-widest font-bold flex items-center gap-2">
                         <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                         {t.available}
                       </div>
                     )}
                   </div>
                </div>
             </div>

             <div>
                <div className="flex justify-between items-end mb-2">
                  <span className="text-vexto-textMuted text-[10px] uppercase tracking-widest">{t.hoursWorked}</span>
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
      )}

      {/* ALERTA DE SLA */}
      {delayedDeliveriesCount > 0 && activeTab === 'live_map' && (
        <div className="absolute bottom-8 left-110 z-20 flex flex-col gap-3 pointer-events-none">
          <div className="glass-panel w-80 p-5 pointer-events-auto border-vexto-red/30 shadow-[0_10px_40px_rgba(239,68,68,0.15)] backdrop-blur-xl bg-black/40 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-white text-sm font-medium tracking-wide">{t.opAlert}</span>
            </div>
            <div className="flex items-center gap-2 mb-4">
              <div className="px-2 py-1 bg-white/10 rounded text-white text-[10px] tracking-widest uppercase border border-white/10">
                {t.slaRisk}
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-vexto-red shadow-[0_0_8px_rgba(239,68,68,0.8)] mt-1.5 animate-pulse"></div>
              <div className="flex flex-col gap-1">
                <span className="text-white text-sm">{delayedDeliveriesCount} {t.outOfWindow}</span>
                <span className="text-vexto-textMuted text-[10px]">{t.aiDetected}</span>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-white/10 flex flex-col gap-2">
               <span className="text-vexto-textMuted text-[10px] uppercase tracking-widest">{t.predAction}</span>
               <div className="flex justify-between items-center group cursor-pointer bg-vexto-green/10 border border-vexto-green/20 px-3 py-2 rounded hover:bg-vexto-green/20 transition-colors">
                  <span className="text-vexto-green text-xs font-medium">{t.analyzeReassign}</span>
                  <ArrowUpRight className="text-vexto-green w-3 h-3 group-hover:text-white transition-colors" />
               </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE DESPACHO DE ENTREGA (OVERLAY) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="glass-panel w-full max-w-md p-6 border border-white/10 rounded-2xl shadow-2xl bg-vexto-bg/95 relative animate-in zoom-in-95 duration-200">
            <button onClick={() => setIsModalOpen(false)} className="absolute top-4 right-4 text-vexto-textMuted hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
            
            <h3 className="text-xl text-white font-medium mb-1">{t.newDelivery}</h3>
            <p className="text-vexto-textMuted text-xs mb-6">Insira os dados do cliente e atribua a entrega a um veículo em campo.</p>
            
            <form onSubmit={handleDispatchDelivery} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase tracking-widest text-vexto-textMuted">{t.customerName}</label>
                <input required type="text" value={deliveryForm.customer} onChange={e => setDeliveryForm({...deliveryForm, customer: e.target.value})} placeholder="Ex: TechCorp Lda" className="p-3 bg-black/40 border border-white/10 rounded-lg text-white outline-none focus:border-vexto-green text-sm transition-colors" />
              </div>
              
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase tracking-widest text-vexto-textMuted">{t.destAddress}</label>
                <input required type="text" value={deliveryForm.destination} onChange={e => setDeliveryForm({...deliveryForm, destination: e.target.value})} placeholder="Ex: Avenida da Liberdade, 110" className="p-3 bg-black/40 border border-white/10 rounded-lg text-white outline-none focus:border-vexto-green text-sm transition-colors" />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase tracking-widest text-vexto-textMuted">{t.selectDriver}</label>
                <select required value={deliveryForm.driverId} onChange={e => setDeliveryForm({...deliveryForm, driverId: e.target.value})} className="p-3 bg-black/40 border border-white/10 rounded-lg text-white outline-none focus:border-vexto-green text-sm transition-colors appearance-none cursor-pointer">
                  {vehicles.map(v => (
                    <option key={v.id} value={v.id}>{v.display_name} ({v.status === 'online' ? 'Online' : 'Offline'})</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 mt-4 pt-4 border-t border-white/5">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3 bg-white/5 text-white font-medium rounded-lg text-xs hover:bg-white/10 transition-colors border border-white/10">
                  {t.cancel}
                </button>
                <button type="submit" className="flex-1 py-3 bg-vexto-green text-black font-bold rounded-lg text-xs hover:bg-vexto-green/90 transition-colors">
                  {t.confirmDispatch}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}