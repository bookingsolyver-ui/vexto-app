import { create } from "zustand";
import type {
  Vehicle,
  FleetOverview,
  PassengerVolume,
  Alert,
  EfficiencyMetrics,
} from "../types/vexto";
import {
  fetchFleetOverview,
  fetchPassengerVolume,
  fetchAlerts,
  fetchEfficiencyMetrics,
} from "../lib/api";
import { supabase } from "../lib/supabaseClient"; // <-- Ligação real!

interface FleetState {
  vehicles: Vehicle[];
  overview: FleetOverview | null;
  passengerVolume: PassengerVolume | null;
  alerts: Alert[];
  efficiency: EfficiencyMetrics | null;
  selectedVehicleId: string | null;
  isLoading: boolean;
  error: string | null;
  liveIntervalId: ReturnType<typeof setInterval> | null;

  loadInitialData: () => Promise<void>;
  startLiveUpdates: (intervalMs?: number) => void;
  stopLiveUpdates: () => void;
  selectVehicle: (id: string | null) => void;
}

export const useFleetStore = create<FleetState>((set, get) => ({
  vehicles: [],
  overview: null,
  passengerVolume: null,
  alerts: [],
  efficiency: null,
  selectedVehicleId: null,
  isLoading: false,
  error: null,
  liveIntervalId: null,

  loadInitialData: async () => {
    set({ isLoading: true, error: null });
    try {
      // 1. BUSCAR FROTA REAL AO SUPABASE
      const { data: dbVehicles, error: supabaseError } = await supabase
        .from("vehicles")
        .select("*");

      if (supabaseError) throw supabaseError;

// 2. Mapear os dados da Base de Dados e ir buscar a última posição GPS real
      const vehicles: Vehicle[] = await Promise.all(
        (dbVehicles || []).map(async (v: any) => {
          // Buscar a última posição GPS registada para este veículo ordenada pela mais recente
          const { data: posData } = await supabase
            .from("vehicle_positions")
            .select("lat, lng")
            .eq("vehicle_id", v.id)
            .order("updated_at", { ascending: false })
            .limit(1);

          // Se encontrou posData (é um array), pega no primeiro elemento
          const latestPos = posData && posData.length > 0 ? posData[0] : null;

          return {
            id: v.id,
            plate: v.plate,
            displayName: v.display_name,
            status: v.status,
            passengerLoadPct: Number(v.passenger_load_pct),
            lastStop: v.last_stop || "Central Station",
            nextStop: v.next_stop || "University Campus",
            signals: {
              gps: v.signals_gps,
              lte: v.signals_lte,
            },
            lastUpdate: v.last_update,
            // Se houver coordenadas no Supabase, usa-as. Caso contrário, força Lisboa/Oeiras (38.6916, -9.3082)
            position: latestPos 
              ? { lat: Number(latestPos.lat), lng: Number(latestPos.lng) } 
              : { lat: 38.6916, lng: -9.3082 },
          } as unknown as Vehicle;
        })
      );

      // 3. Manter as métricas analíticas e alertas provisórios (Fase 2)
      const [overview, passengerVolume, alerts, efficiency] = await Promise.all([
        fetchFleetOverview(vehicles),
        fetchPassengerVolume(),
        fetchAlerts(vehicles),
        fetchEfficiencyMetrics(),
      ]);

      set({ vehicles, overview, passengerVolume, alerts, efficiency, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  startLiveUpdates: (intervalMs = 3000) => {
    if (get().liveIntervalId) return;

    // 1. ESCUTAR ALTERAÇÕES REAIS NA BASE DE DADOS (Subscrição WebSockets)
    const channel = supabase
      .channel("realtime-vehicles")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vehicles" },
        (payload) => {
          const currentVehicles = get().vehicles;
          const updatedDbVehicle = payload.new as any;

          // Atualizar apenas o veículo que mudou na base de dados
          const updatedVehicles = currentVehicles.map((v) => {
            if (v.id === updatedDbVehicle.id || v.plate === updatedDbVehicle.plate) {
              return {
                ...v,
                status: updatedDbVehicle.status,
                passengerLoadPct: Number(updatedDbVehicle.passenger_load_pct),
                lastUpdate: updatedDbVehicle.last_update,
              };
            }
            return v;
          });

          set({
            vehicles: updatedVehicles,
            overview: {
              onlineCount: updatedVehicles.filter((v) => v.status === "online").length,
              offlineCount: updatedVehicles.filter((v) => v.status !== "online").length,
              totalCount: updatedVehicles.length,
            },
          });
        }
      )
      .subscribe();

    // 2. Intervalo apenas para simular o motor de alertas de IA a processar
    const id = setInterval(async () => {
      const currentVehicles = get().vehicles;
      const updatedAlerts = await fetchAlerts(currentVehicles);
      set({ alerts: updatedAlerts });
    }, intervalMs);

    set({ liveIntervalId: id as unknown as ReturnType<typeof setInterval> });
  },

  stopLiveUpdates: () => {
    const id = get().liveIntervalId;
    if (id) clearInterval(id);
    supabase.removeAllChannels(); // Desliga a escuta do Supabase
    set({ liveIntervalId: null });
  },

  selectVehicle: (id) => set({ selectedVehicleId: id }),
}));