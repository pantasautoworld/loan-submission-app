"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireStaff } from "@/lib/auth";
import {
  createPuspakomBooking,
  deletePuspakomBooking,
  markPuspakomBookingComplete,
  PUSPAKOM_TYPES,
  type PuspakomType,
} from "@/lib/puspakomBookings";
import { fetchStockBoardVehicles, findByPlate } from "@/lib/stockBoard";

export async function logPuspakomBooking(formData: FormData) {
  const { profile, supabase } = await requireStaff();

  const plate = String(formData.get("plate") ?? "").trim();
  const branch = String(formData.get("branch") ?? "").trim();
  const appointmentDate = String(formData.get("appointmentDate") ?? "").trim();
  const inspectionType = String(formData.get("inspectionType") ?? "");
  if (!plate) throw new Error("Enter a plate number.");
  if (!appointmentDate) throw new Error("Pick an appointment date.");
  if (!PUSPAKOM_TYPES.includes(inspectionType as PuspakomType)) throw new Error("Select an inspection type.");

  const vehicles = await fetchStockBoardVehicles();
  const vehicle = findByPlate(plate, vehicles);
  if (!vehicle) throw new Error(`No car on the Stock Board matches plate "${plate}".`);
  if (vehicle.status === "sold") throw new Error(`${vehicle.vehicle} (${vehicle.vin}) is already marked Sold.`);

  await createPuspakomBooking(supabase, {
    stockBoardVehicleId: vehicle.id,
    noPlate: vehicle.vin,
    vehicle: vehicle.vehicle,
    branch,
    appointmentDate,
    inspectionType: inspectionType as PuspakomType,
    createdByProfileId: profile.id,
    createdByName: profile.full_name || "Staff",
  });

  revalidatePath("/puspakom");
  revalidatePath("/stock-board");
}

export async function completePuspakomBooking(bookingId: string) {
  const { profile, supabase } = await requireStaff();
  await markPuspakomBookingComplete(supabase, bookingId, profile.full_name || "Staff");
  revalidatePath("/puspakom");
  revalidatePath("/stock-board");
}

export async function removePuspakomBooking(bookingId: string) {
  const { supabase } = await requireAdmin();
  await deletePuspakomBooking(supabase, bookingId);
  revalidatePath("/puspakom");
  revalidatePath("/stock-board");
}
