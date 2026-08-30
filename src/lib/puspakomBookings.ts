import type { SupabaseClient } from "@supabase/supabase-js";

export interface PuspakomBookingRow {
  id: string;
  stock_board_vehicle_id: string;
  no_plate: string;
  vehicle: string;
  branch: string;
  appointment_date: string;
  status: "scheduled" | "completed";
  created_by: string | null;
  created_by_name: string;
  completed_by_name: string | null;
  completed_at: string | null;
  created_at: string;
}

export async function fetchPuspakomBookings(supabase: SupabaseClient): Promise<PuspakomBookingRow[]> {
  const { data, error } = await supabase
    .from("puspakom_bookings")
    .select("*")
    .order("appointment_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as PuspakomBookingRow[];
}

/**
 * Which Stock Board cars have at least one completed booking - for the ✅
 * Puspakom tag on the Stock Board. Returned as a plain array (not a Set) so
 * it serializes cleanly across the server/client component boundary.
 */
export async function fetchCompletedPuspakomVehicleIds(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase
    .from("puspakom_bookings")
    .select("stock_board_vehicle_id")
    .eq("status", "completed");
  if (error) throw new Error(error.message);
  return [...new Set((data ?? []).map((r) => r.stock_board_vehicle_id as string))];
}

export interface CreatePuspakomBookingInput {
  stockBoardVehicleId: string;
  noPlate: string;
  vehicle: string;
  branch: string;
  appointmentDate: string;
  createdByProfileId: string | null;
  createdByName: string;
}

export async function createPuspakomBooking(
  supabase: SupabaseClient,
  input: CreatePuspakomBookingInput
): Promise<void> {
  const { error } = await supabase.from("puspakom_bookings").insert({
    stock_board_vehicle_id: input.stockBoardVehicleId,
    no_plate: input.noPlate,
    vehicle: input.vehicle,
    branch: input.branch,
    appointment_date: input.appointmentDate,
    created_by: input.createdByProfileId,
    created_by_name: input.createdByName,
  });
  if (error) throw new Error(error.message);
}

export async function markPuspakomBookingComplete(
  supabase: SupabaseClient,
  bookingId: string,
  actorName: string
): Promise<void> {
  const { error } = await supabase
    .from("puspakom_bookings")
    .update({ status: "completed", completed_by_name: actorName, completed_at: new Date().toISOString() })
    .eq("id", bookingId)
    .eq("status", "scheduled");
  if (error) throw new Error(error.message);
}

export async function deletePuspakomBooking(supabase: SupabaseClient, bookingId: string): Promise<void> {
  const { error } = await supabase.from("puspakom_bookings").delete().eq("id", bookingId);
  if (error) throw new Error(error.message);
}
