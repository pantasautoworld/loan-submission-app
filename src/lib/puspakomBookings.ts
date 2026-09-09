import type { SupabaseClient } from "@supabase/supabase-js";

/** The two Puspakom inspections a car needs - always done together in one visit/booking. */
export const PUSPAKOM_TYPES = ["B5", "B7"] as const;
export type PuspakomType = (typeof PUSPAKOM_TYPES)[number];

export interface PuspakomBookingRow {
  id: string;
  stock_board_vehicle_id: string;
  no_plate: string;
  vehicle: string;
  branch: string;
  company: string;
  appointment_date: string;
  /** "HH:MM:SS" (Postgres time), or null if no specific time was given. */
  appointment_time: string | null;
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

export interface PuspakomStatusInfo {
  status: "scheduled" | "completed";
  /** ISO date (YYYY-MM-DD) of the appointment - the actual inspection date once completed. */
  appointmentDate: string;
}

/**
 * Each Stock Board car's most recent Puspakom booking (B5 and B7 are done
 * together in one visit, so this is one status per car, not per inspection
 * type). A car can be re-booked after its previous inspection expires, so
 * this takes the latest booking by appointment date regardless of status -
 * not just "has any completed booking ever" - so a fresh re-booking
 * correctly shows as pending again. Keyed by Stock Board vehicle id, plain
 * object so it serializes cleanly across the server/client boundary.
 */
export async function fetchLatestPuspakomStatusByVehicle(
  supabase: SupabaseClient
): Promise<Record<string, PuspakomStatusInfo>> {
  const { data, error } = await supabase
    .from("puspakom_bookings")
    .select("stock_board_vehicle_id, status, appointment_date")
    .order("appointment_date", { ascending: false });
  if (error) throw new Error(error.message);
  const result: Record<string, PuspakomStatusInfo> = {};
  for (const row of data ?? []) {
    const id = row.stock_board_vehicle_id as string;
    if (!(id in result)) {
      result[id] = { status: row.status as "scheduled" | "completed", appointmentDate: row.appointment_date as string };
    }
  }
  return result;
}

export interface CreatePuspakomBookingInput {
  stockBoardVehicleId: string;
  noPlate: string;
  vehicle: string;
  branch: string;
  company: string;
  appointmentDate: string;
  appointmentTime: string;
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
    company: input.company,
    appointment_date: input.appointmentDate,
    appointment_time: input.appointmentTime || null,
    created_by: input.createdByProfileId,
    created_by_name: input.createdByName,
  });
  if (error) throw new Error(error.message);
}

export interface UpdatePuspakomBookingInput {
  branch: string;
  company: string;
  appointmentDate: string;
  appointmentTime: string;
}

export async function updatePuspakomBooking(
  supabase: SupabaseClient,
  bookingId: string,
  input: UpdatePuspakomBookingInput
): Promise<void> {
  const { error } = await supabase
    .from("puspakom_bookings")
    .update({
      branch: input.branch,
      company: input.company,
      appointment_date: input.appointmentDate,
      appointment_time: input.appointmentTime || null,
    })
    .eq("id", bookingId);
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
