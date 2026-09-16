"use client";

import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Navigation, Wifi, AlertCircle } from 'lucide-react';

// O teu autocarro real: Bus 6023
const MEU_VEICULO_ID = "a708d088-4dff-4a95-8475-854b76a5295a"; 

export default function DriverPage() {
  const [tracking, setTracking] = useState(false);
  const [lastPosition, setLastPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sentCount, setSentCount] = useState(0);
  const watchIdRef = useRef<number | null>(null);

  async function sendPosition(pos: GeolocationPosition) {
    const { latitude, longitude, heading, speed } = pos.coords;
    setLastPosition({ lat: latitude, lng: longitude });

    // 1. Gravar a posição no Histórico
    const { error: insertError } = await supabase.from('vehicle_positions').insert({
      vehicle_id: MEU_VEICULO_ID,
      lat: latitude,
      lng: longitude,
      heading: heading ?? null,
      speed_kmh: speed ? speed * 3.6 : null,
      updated_at: new Date().toISOString(),
    });

    // 2. Avisar a Dashboard que o motorista está ONLINE
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
        // Se a precisão for superior a 20 metros, ignoramos para o ponto não saltar
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
    // Avisar a Dashboard que o motorista está OFFLINE
    supabase.from('vehicles').update({ status: 'offline' }).eq('id', MEU_VEICULO_ID);
  }

  useEffect(() => {
    return () => stopTracking(); // Limpa ao sair da página
  }, []);

  return (
    <main className="min-h-screen bg-vexto-bg text-white flex flex-col items-center justify-center p-8 font-sans">
      
      {/* Header Premium */}
      <div className="absolute top-10 flex flex-col items-center gap-2">
        <div className="flex gap-0.5 transform -rotate-45 mb-2">
          <div className="w-1 h-4 bg-white rounded-full"></div>
          <div className="w-1 h-5 bg-white rounded-full -mt-0.5"></div>
          <div className="w-1 h-4 bg-white rounded-full -mt-1"></div>
          <div className="w-1 h-3 bg-white rounded-full -mt-0.5"></div>
        </div>
        <h1 className="text-xl font-medium tracking-tight">Vexto Mobile</h1>
        <p className="text-vexto-textMuted text-xs tracking-widest uppercase">Motorista — Bus 6023</p>
      </div>

      {/* Botão de Ignição */}
      <button
        onClick={tracking ? stopTracking : startTracking}
        className={`w-48 h-48 rounded-full border border-white/5 flex flex-col items-center justify-center gap-3 transition-all duration-500 shadow-2xl ${
          tracking 
            ? 'bg-vexto-red/10 shadow-[0_0_60px_rgba(239,68,68,0.3)] hover:bg-vexto-red/20' 
            : 'bg-vexto-green/10 shadow-[0_0_60px_rgba(34,197,94,0.3)] hover:bg-vexto-green/20'
        }`}
      >
        <Navigation className={`w-8 h-8 ${tracking ? 'text-vexto-red' : 'text-vexto-green'}`} />
        <span className="text-xl font-medium tracking-tight">
          {tracking ? 'Fim de Turno' : 'Iniciar Rota'}
        </span>
      </button>

      {/* Painel de Estatísticas da Conexão */}
      <div className="absolute bottom-10 w-full max-w-sm px-8">
        <div className="glass-panel p-5 rounded-2xl border border-white/10 flex flex-col gap-4">
          <div className="flex justify-between items-center border-b border-white/5 pb-4">
            <span className="text-vexto-textMuted text-sm">Status do Sistema</span>
            {tracking ? (
              <span className="flex items-center gap-2 text-xs font-medium text-vexto-green">
                <span className="w-2 h-2 rounded-full bg-vexto-green animate-pulse"></span>
                Transmissão Ativa
              </span>
            ) : (
              <span className="flex items-center gap-2 text-xs font-medium text-vexto-textMuted">
                <span className="w-2 h-2 rounded-full bg-vexto-textMuted"></span>
                Em repouso
              </span>
            )}
          </div>
          
          <div className="flex justify-between items-center text-xs text-vexto-textMuted">
            <span className="flex items-center gap-1.5">
              <Wifi className="w-4 h-4" /> Sinal GPS
            </span>
            <span>{sentCount} pacotes enviados</span>
          </div>

          {lastPosition && tracking && (
             <div className="text-[10px] text-center text-vexto-textMuted/50 tracking-widest bg-black/40 py-2 rounded-lg mt-2">
               {lastPosition.lat.toFixed(5)} N, {lastPosition.lng.toFixed(5)} W
             </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-vexto-red text-xs mt-2 bg-vexto-red/10 p-2 rounded">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}
        </div>
      </div>

    </main>
  );
}