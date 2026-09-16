// types/vexto.ts
// Tipos centrais da plataforma Vexto.
// Mantidos independentes de "mock" ou "real" — a UI consome sempre estas shapes.

export type VehicleStatus = "online" | "offline" | "no_signal";
export type SignalQuality = "GPS" | "LTE";

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface Vehicle {
  id: string;              // ex: "bus-6023"
  displayName: string;     // ex: "Bus 6023"
  plate: string;           // ex: "L 45623"
  type: "bus" | "e-bus" | "train" | "taxi";
  status: VehicleStatus;
  position: GeoPoint;
  heading: number;         // graus 0-360, direção do movimento
  speedKmh: number;
  passengerLoadPct: number;    // 0-100
  nextStop: string;
  routeId: string;
  scheduleOffsetMin: number;   // negativo = atrasado, positivo = adiantado
  signals: {
    gps: boolean;
    lte: boolean;
  };
  lastUpdate: string;       // ISO timestamp
}

export interface FleetOverview {
  onlineCount: number;
  offlineCount: number;
  totalCount: number;
}

export interface PassengerVolumePoint {
  time: string;   // "06:00", "09:00", etc.
  value: number;
}

export interface PassengerVolume {
  todayTotal: number;
  series: PassengerVolumePoint[];
}

export type AlertSeverity = "info" | "warning" | "critical";

export interface Alert {
  id: string;
  severity: AlertSeverity;
  title: string;            // ex: "Capacity Issues"
  message: string;          // ex: "180 passengers left behind"
  vehicleId?: string;
  recommendedAction?: string; // ex: "Dispatching reserve E-Bus"
  createdAt: string;
}

export interface EfficiencyMetrics {
  operationalEfficiencyPct: number;   // ex: 78.3
  marketValueUsd: number;             // ex: 68_000_000_000
  annualLossesUsd: number;            // ex: 4_000_000
  scheduleOffsetAvgMin: number;       // ex: 2.5
}

export type CurrencyCode = "EUR" | "USD" | "AOA";

export interface CurrencyAmount {
  code: CurrencyCode;
  value: number;
}
