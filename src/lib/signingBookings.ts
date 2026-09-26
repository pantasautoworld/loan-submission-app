import type { SupabaseClient } from "@supabase/supabase-js";

export interface SigningBookingRow {
  id: string;
  stock_board_vehicle_id: string;
  no_plate: string;
  vehicle: string;
  buyer_name: string;
  financier: string;
  loan_amount: number | null;
  retention_amount: number;
  appointment_date: string;
  appointment_time: string | null;
  runner_id: string | null;
  runner_name: string;
  status: "scheduled" | "completed";
  remark: string;
  photo_path: string | null;
  created_by_name: string;
  created_at: string;
  completed_by_name: string | null;
  completed_at: string | null;
}

export async function fetchSigningBookings(supabase: SupabaseClient): Promise<SigningBookingRow[]> {
  const { data, error } = await supabase
    .from("signing_bookings")
    .select("*")
    .order("appointment_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SigningBookingRow[];
}

export async function fetchSigningBookingsForRunner(
  supabase: SupabaseClient,
  runnerId: string
): Promise<SigningBookingRow[]> {
  const { data, error } = await supabase
    .from("signing_bookings")
    .select("*")
    .eq("runner_id", runnerId)
    .order("appointment_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SigningBookingRow[];
}
