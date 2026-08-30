import type { SupabaseClient } from "@supabase/supabase-js";

export const PUSPAKOM_TYPES = ["B5", "B7"] as const;
export type PuspakomType = (typeof PUSPAKOM_TYPES)[number];

export interface PuspakomBookingRow {
  id: string;
  stock_board_vehicle_id: string;
  no_plate: string;
  vehicle: string;
  branch: string;
  appointment_date: string;
  inspection_type: PuspakomType;
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
 * Which inspection type(s) each Stock Board car has completed - for the ✅
 * B5 / ✅ B7 tags beside its plate. Returned as a plain object (not a Map) so
 * it serializes cleanly across the server/client component boundary.
 */
export async function fetchCompletedPuspakomTypesByVehicle(
  supabase: SupabaseClient
): Promise<Record<string, PuspakomType[]>> {
  const { data, error } = await supabase
    .from("puspakom_bookings")
    .select("stock_board_vehicle_id, inspection_type")
    .eq("status", "completed");
  if (error) throw new Error(error.message);

  const byVehicle: Record<string, PuspakomType[]> = {};
  for (const row of (data ?? []) as { stock_board_vehicle_id: string; inspection_type: PuspakomType }[]) {
    const types = byVehicle[row.stock_board_vehicle_id] ?? [];
    if (!types.includes(row.inspection_type)) types.push(row.inspection_type);
    byVehicle[row.stock_board_vehicle_id] = types;
  }
  return byVehicle;
}

export interface CreatePuspakomBookingInput {
  stockBoardVehicleId: string;
  noPlate: string;
  vehicle: string;
  branch: string;
  appointmentDate: string;
  inspectionType: PuspakomType;
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
    inspection_type: input.inspectionType,
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
