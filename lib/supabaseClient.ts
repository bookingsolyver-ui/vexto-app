import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// O ID real do Bus 6023 na base de dados
export const LIVE_VEHICLE_ID = "a708d088-4dff-4a95-8475-854b76a5295a";

export interface LiveVehiclePosition {
  id: string;
  vehicle_id: string;
  lat: number;
  lng: number;
  heading: number | null;
  speed_kmh: number | null;
  updated_at: string;
}