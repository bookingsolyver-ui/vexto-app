// lib/mockData.ts
// Gera dados mock realistas para desenvolvimento local, sem depender de nenhuma API.
// Quando tiveres o backend pronto, troca só o ficheiro lib/api.ts — isto fica intacto
// como "modo demo" (útil para storybook, testes, e onboarding).

import type {
  Vehicle,
  FleetOverview,
  PassengerVolume,
  Alert,
  EfficiencyMetrics,
  GeoPoint,
} from "../types/vexto";

// Centro aproximado de São Francisco, como no mockup
const CITY_CENTER: GeoPoint = { lat: 37.7699, lng: -122.4469 };

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Coordenadas reais das paragens, para a Mapbox Directions API poder
// calcular uma rota a sério (a seguir ruas) entre o veículo e a próxima paragem.
export const STOPS: Record<string, GeoPoint> = {
  "Central Station": { lat: 37.7793, lng: -122.4193 },
  "Haight-Ashbury Terminal": { lat: 37.7692, lng: -122.4481 },
  "Castro District Hub": { lat: 37.7609, lng: -122.4350 },
  "Cole Valley Stop": { lat: 37.7658, lng: -122.4498 },
  "Market St Interchange": { lat: 37.7749, lng: -122.4194 },
};

const STOP_NAMES = Object.keys(STOPS);

const VEHICLE_TYPES: Vehicle["type"][] = ["bus", "e-bus", "bus", "train"];

export function generateVehicle(index: number): Vehicle {
  const isOnline = Math.random() > 0.25;
  return {
    id: `veh-${1000 + index}`,
    displayName: `Bus ${6000 + index}`,
    plate: `L ${40000 + Math.floor(rand(0, 9999))}`,
    type: pick(VEHICLE_TYPES),
    status: isOnline ? "online" : Math.random() > 0.5 ? "offline" : "no_signal",
    position: {
      lat: CITY_CENTER.lat + rand(-0.03, 0.03),
      lng: CITY_CENTER.lng + rand(-0.03, 0.03),
    },
    heading: rand(0, 360),
    speedKmh: isOnline ? rand(0, 55) : 0,
    passengerLoadPct: Math.round(rand(10, 98)),
    nextStop: pick(STOP_NAMES),
    routeId: `route-${Math.ceil(rand(1, 8))}`,
    scheduleOffsetMin: Math.round(rand(-15, 5)),
    signals: { gps: isOnline, lte: isOnline && Math.random() > 0.1 },
    lastUpdate: new Date().toISOString(),
  };
}

export function generateFleet(size = 16): Vehicle[] {
  return Array.from({ length: size }, (_, i) => generateVehicle(i));
}

export function computeFleetOverview(vehicles: Vehicle[]): FleetOverview {
  const onlineCount = vehicles.filter((v) => v.status === "online").length;
  return {
    onlineCount,
    offlineCount: vehicles.length - onlineCount,
    totalCount: vehicles.length,
  };
}

export function generatePassengerVolume(): PassengerVolume {
  const hours = ["06:00", "09:00", "12:00", "15:00", "18:00", "21:00"];
  const series = hours.map((time) => ({ time, value: Math.round(rand(60000, 145000)) }));
  return {
    todayTotal: series[series.length - 1].value,
    series,
  };
}

export function generateAlerts(vehicles: Vehicle[]): Alert[] {
  const delayed = vehicles.filter((v) => v.scheduleOffsetMin <= -10).slice(0, 3);
  const overloaded = vehicles.filter((v) => v.passengerLoadPct >= 90).slice(0, 2);

  const alerts: Alert[] = [];

  delayed.forEach((v) =>
    alerts.push({
      id: `alert-delay-${v.id}`,
      severity: "warning",
      title: "Schedule Deviation",
      message: `${v.displayName} is ${Math.round(Math.abs(v.scheduleOffsetMin))} mins behind schedule`,
      vehicleId: v.id,
      recommendedAction: "Dispatching reserve E-Bus",
      createdAt: new Date().toISOString(),
    })
  );

  overloaded.forEach((v) =>
    alerts.push({
      id: `alert-capacity-${v.id}`,
      severity: "critical",
      title: "Capacity Issues",
      message: `${Math.round(rand(50, 200))} passengers left behind on ${v.displayName}`,
      vehicleId: v.id,
      createdAt: new Date().toISOString(),
    })
  );

  return alerts;
}

export function generateEfficiencyMetrics(): EfficiencyMetrics {
  return {
    operationalEfficiencyPct: Number(rand(70, 88).toFixed(1)),
    marketValueUsd: 68_000_000_000,
    annualLossesUsd: 4_000_000,
    scheduleOffsetAvgMin: Number(rand(1.5, 3.5).toFixed(1)),
  };
}

// Simula "tick" de telemetria: pequenas variações de posição, carga e offset,
// para dar sensação de dados ao vivo sem precisar de um servidor.
export function stepVehicle(v: Vehicle): Vehicle {
  if (v.status !== "online") return v;
  return {
    ...v,
    position: {
      lat: v.position.lat + rand(-0.0015, 0.0015),
      lng: v.position.lng + rand(-0.0015, 0.0015),
    },
    passengerLoadPct: clamp(v.passengerLoadPct + rand(-4, 4), 0, 100),
    scheduleOffsetMin: clamp(v.scheduleOffsetMin + rand(-1, 1), -20, 10),
    lastUpdate: new Date().toISOString(),
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
