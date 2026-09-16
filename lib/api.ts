// lib/api.ts
// Ponto único de acesso a dados. A store nunca fala diretamente com mockData
// nem com fetch — fala sempre com este módulo. Assim, no dia de ligares o
// backend real, só editas este ficheiro.

import type {
  Vehicle,
  FleetOverview,
  PassengerVolume,
  Alert,
  EfficiencyMetrics,
} from "../types/vexto";
import {
  generateFleet,
  computeFleetOverview,
  generatePassengerVolume,
  generateAlerts,
  generateEfficiencyMetrics,
  stepVehicle,
} from "./mockData";

// Muda para false quando tiveres endpoints reais prontos,
// ou lê de uma env var: process.env.NEXT_PUBLIC_USE_MOCK === "true"
const USE_MOCK = true;

export async function fetchFleet(): Promise<Vehicle[]> {
  if (USE_MOCK) return generateFleet(16);

  const res = await fetch("/api/fleet");
  if (!res.ok) throw new Error(`fetchFleet failed: ${res.status}`);
  return res.json();
}

export async function fetchFleetOverview(vehicles: Vehicle[]): Promise<FleetOverview> {
  if (USE_MOCK) return computeFleetOverview(vehicles);

  const res = await fetch("/api/fleet/overview");
  if (!res.ok) throw new Error(`fetchFleetOverview failed: ${res.status}`);
  return res.json();
}

export async function fetchPassengerVolume(): Promise<PassengerVolume> {
  if (USE_MOCK) return generatePassengerVolume();

  const res = await fetch("/api/analytics/passenger-volume");
  if (!res.ok) throw new Error(`fetchPassengerVolume failed: ${res.status}`);
  return res.json();
}

export async function fetchAlerts(vehicles: Vehicle[]): Promise<Alert[]> {
  if (USE_MOCK) return generateAlerts(vehicles);

  const res = await fetch("/api/alerts");
  if (!res.ok) throw new Error(`fetchAlerts failed: ${res.status}`);
  return res.json();
}

export async function fetchEfficiencyMetrics(): Promise<EfficiencyMetrics> {
  if (USE_MOCK) return generateEfficiencyMetrics();

  const res = await fetch("/api/analytics/efficiency");
  if (!res.ok) throw new Error(`fetchEfficiencyMetrics failed: ${res.status}`);
  return res.json();
}

// Em modo mock, "telemetria em tempo real" é simulada localmente.
// Em modo real, isto seria substituído por uma subscrição WebSocket/SSE
// (ex: new EventSource("/api/telemetry/stream")).
export function nextTelemetryTick(vehicles: Vehicle[]): Vehicle[] {
  if (USE_MOCK) return vehicles.map(stepVehicle);
  // No modo real, esta função não é chamada — os updates chegam via socket
  // e são despachados diretamente para a store (ver store/useFleetStore.ts).
  return vehicles;
}
