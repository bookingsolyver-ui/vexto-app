"use client";

import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Navigation, Wifi, AlertCircle, Package, CheckCircle2 } from 'lucide-react';

// O teu autocarro real: Bus 6023
const MEU_VEICULO_ID = "a708d088-4dff-4a95-8475-854b76a5295a"; 

export default function DriverPage() {
  const [tracking, setTracking] = useState(false);
  const [lastPosition, setLastPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sentCount, setSentCount] = useState(0);
  
  // Novos estados para a Gestão de Entregas em Tempo Real
  const [pendingOrder, setPendingOrder] = useState<any>(null);
  const [acceptedOrder, setAcceptedOrder] = useState<any>(null);

  const watchIdRef = useRef<number | null>(null);

  // 1. Buscar entregas pendentes em tempo real
  useEffect(() => {
    async function fetchPendingDeliveries() {
      const { data } = await supabase
        .from('deliveries')
        .select('*')
        .eq('status', 'pending')
        .limit(1);
      
      if (data && data.length > 0) {
        setPendingOrder(data[0]);
      }
    }

    fetchPendingDeliveries();

    // Subscrever a novas entregas criadas pelo gestor
    const deliveryChannel = supabase
      .channel('deliveries-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'deliveries' },
        (payload) => {
          if (payload.new && payload.new.status === 'pending') {
            setPendingOrder(payload.new);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(deliveryChannel);
    };
  }, []);

  // 2. Ação do motorista para Aceitar a Entrega
  async function handleAcceptOrder() {
    if (!pendingOrder) return;

    const { error: updateError } = await supabase
      .from('deliveries')
      .update({ status: 'in_progress', driver_id: MEU_VEICULO_ID })
      .eq('id', pendingOrder.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      setAcceptedOrder(pendingOrder);
      setPendingOrder(null);
      // Se o motorista ainda não iniciou o turno, podemos ligar o tracking automaticamente!
      if (!tracking) {
        startTracking();
      }
    }
  }

  async function sendPosition(pos: GeolocationPosition) {
    const { latitude, longitude, heading, speed } = pos.coords;
    setLastPosition({ lat: latitude, lng: longitude });

    // Gravar a posição no Histórico
    const { error: insertError } = await supabase.from('vehicle_positions').insert({
      vehicle_id: MEU_VEICULO_ID,
      lat: latitude,
      lng: longitude,
      heading: heading ?? null,
      speed_kmh: speed ? speed * 3.6 : null,
      updated_at: new Date().toISOString(),
    });

    // Avisar a Dashboard que o motorista está ONLINE
    if (!insertError) {
      await supabase.from('vehicles').update({ 
        status: 'online', 
        last_update: new Date().toISOString() 
      }).eq('id', MEU_VEICULO_ID);
    }

    if (insertError) {
      setError(insertError.message);
    } else {
      setError(null);
      setSentCount((n) => n + 1);
    }
  }

  function startTracking() {
    if (!navigator.geolocation) {
      setError('Este browser não suporta geolocalização.');
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (pos.coords.accuracy > 25) return; 
        sendPosition(pos);
      },
      (err) => setError(`Erro de GPS: ${err.message}`),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
    setTracking(true);
  }

  function stopTracking() {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setTracking(false);
    supabase.from('vehicles').update({ status: 'offline' }).eq('id', MEU_VEICULO_ID);
  }

  useEffect(() => {
    return () => stopTracking();
  }, []);

  return (
    <main className="min-h-screen bg-vexto-bg text-white flex flex-col items-center justify-between p-6 font-sans">
      
      {/* Header Premium */}
      <div className="flex flex-col items-center gap-1 mt-4">
        <div className="flex gap-0.5 transform -rotate-45 mb-1">
          <div className="w-1 h-3 bg-white rounded-full"></div>
          <div className="w-1 h-4 bg-white rounded-full -mt-0.5"></div>
          <div className="w-1 h-3 bg-white rounded-full -mt-1"></div>
        </div>
        <h1 className="text-lg font-medium tracking-tight">Vexto Mobile</h1>
        <p className="text-vexto-textMuted text-[10px] tracking-widest uppercase">Motorista — Bus 6023</p>
      </div>

      {/* Secção Central: Pedidos Pendentes ou Entrega Ativa */}
      <div className="w-full max-w-sm flex flex-col gap-4 my-auto">
        
        {/* Se houver um pedido pendente para aceitar */}
        {pendingOrder && !acceptedOrder && (
          <div className="glass-panel p-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 flex flex-col gap-3 animate-bounce">
            <div className="flex items-center gap-2 text-amber-400 font-medium text-sm">
              <Package className="w-5 h-5" /> Nova Entrega Disponível!
            </div>
            <div className="text-xs text-white/80 space-y-1">
              <p><b>Recolha:</b> {pendingOrder.pickup_address || 'Ponto A (Luanda)'}</p>
              <p><b>Destino:</b> {pendingOrder.dropoff_address || 'Ponto B'}</p>
            </div>
            <button
              onClick={handleAcceptOrder}
              className="w-full bg-vexto-green text-black font-semibold py-3 rounded-xl text-sm transition-all hover:opacity-90 shadow-lg mt-1"
            >
              ACEITAR ENTREGA
            </button>
          </div>
        )}

        {/* Se a entrega já foi aceita */}
        {acceptedOrder && (
          <div className="glass-panel p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-emerald-400 font-medium text-sm">
              <CheckCircle2 className="w-5 h-5" /> Entrega em Curso
            </div>
            <p className="text-[11px] text-white/70">Segue a linha branca otimizada pela IA.</p>
          </div>
        )}

        {/* Botão de Ignição (GPS) */}
        <div className="flex flex-col items-center justify-center my-2">
          <button
            onClick={tracking ? stopTracking : startTracking}
            className={`w-36 h-36 rounded-full border border-white/5 flex flex-col items-center justify-center gap-2 transition-all duration-500 shadow-2xl ${
              tracking 
                ? 'bg-vexto-red/10 shadow-[0_0_40px_rgba(239,68,68,0.2)] hover:bg-vexto-red/20' 
                : 'bg-vexto-green/10 shadow-[0_0_40px_rgba(34,197,94,0.2)] hover:bg-vexto-green/20'
            }`}
          >
            <Navigation className={`w-6 h-6 ${tracking ? 'text-vexto-red' : 'text-vexto-green'}`} />
            <span className="text-sm font-medium tracking-tight">
              {tracking ? 'Terminar Turno' : 'Iniciar Rota'}
            </span>
          </button>
        </div>

      </div>

      {/* Painel de Estatísticas da Conexão */}
      <div className="w-full max-w-sm mb-4">
        <div className="glass-panel p-4 rounded-2xl border border-white/10 flex flex-col gap-3">
          <div className="flex justify-between items-center border-b border-white/5 pb-3">
            <span className="text-vexto-textMuted text-xs">Status do Sistema</span>
            {tracking ? (
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-vexto-green">
                <span className="w-2 h-2 rounded-full bg-vexto-green animate-pulse"></span>
                Transmissão Ativa
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-vexto-textMuted">
                <span className="w-2 h-2 rounded-full bg-vexto-textMuted"></span>
                Em repouso
              </span>
            )}
          </div>
          
          <div className="flex justify-between items-center text-[11px] text-vexto-textMuted">
            <span className="flex items-center gap-1.5">
              <Wifi className="w-3.5 h-3.5" /> Sinal GPS
            </span>
            <span>{sentCount} pacotes enviados</span>
          </div>

          {lastPosition && tracking && (
             <div className="text-[9px] text-center text-vexto-textMuted/50 tracking-widest bg-black/40 py-1.5 rounded-lg">
               {lastPosition.lat.toFixed(5)} N, {lastPosition.lng.toFixed(5)} W
             </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-vexto-red text-xs bg-vexto-red/10 p-2 rounded">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}
        </div>
      </div>

    </main>
  );
}