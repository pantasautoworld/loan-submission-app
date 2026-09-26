"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireSalesStaff, requireStaff } from "@/lib/auth";

export async function logSigningBooking(formData: FormData) {
  const { profile, supabase } = await requireSalesStaff();

  const stockBoardVehicleId = String(formData.get("stockBoardVehicleId") ?? "").trim();
  const noPlate = String(formData.get("noPlate") ?? "").trim();
  const vehicle = String(formData.get("vehicle") ?? "").trim();
  const claimInvoiceId = String(formData.get("claimInvoiceId") ?? "").trim() || null;
  const buyerName = String(formData.get("buyerName") ?? "").trim();
  const financier = String(formData.get("financier") ?? "").trim();
  const loanAmount = formData.get("loanAmount") ? Number(formData.get("loanAmount")) : null;
  const interestRate = formData.get("interestRate") ? Number(formData.get("interestRate")) : null;
  const tenureMonths = formData.get("tenureMonths") ? Number(formData.get("tenureMonths")) : null;
  const monthlyInstallment = formData.get("monthlyInstallment")
    ? Number(formData.get("monthlyInstallment"))
    : null;
  const retentionAmount = Number(formData.get("retentionAmount") ?? 0) || 0;
  const appointmentDate = String(formData.get("appointmentDate") ?? "").trim();
  const appointmentTime = String(formData.get("appointmentTime") ?? "").trim();
  const runnerId = String(formData.get("runnerId") ?? "").trim() || null;
  const runnerName = String(formData.get("runnerName") ?? "").trim();

  if (!stockBoardVehicleId || !noPlate) throw new Error("Pick a car.");
  if (!appointmentDate) throw new Error("Pick an appointment date.");

  const { error } = await supabase.from("signing_bookings").insert({
    stock_board_vehicle_id: stockBoardVehicleId,
    no_plate: noPlate,
    vehicle,
    claim_invoice_id: claimInvoiceId,
    buyer_name: buyerName,
    financier,
    loan_amount: loanAmount,
    interest_rate: interestRate,
    tenure_months: tenureMonths,
    monthly_installment: monthlyInstallment,
    retention_amount: retentionAmount,
    appointment_date: appointmentDate,
    appointment_time: appointmentTime || null,
    runner_id: runnerId,
    runner_name: runnerName,
    created_by_name: profile.full_name || "Staff",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/signing");
  revalidatePath("/recon");
}

export async function editSigningBooking(bookingId: string, formData: FormData) {
  const { supabase } = await requireSalesStaff();

  const buyerName = String(formData.get("buyerName") ?? "").trim();
  const financier = String(formData.get("financier") ?? "").trim();
  const loanAmount = formData.get("loanAmount") ? Number(formData.get("loanAmount")) : null;
  const interestRate = formData.get("interestRate") ? Number(formData.get("interestRate")) : null;
  const tenureMonths = formData.get("tenureMonths") ? Number(formData.get("tenureMonths")) : null;
  const monthlyInstallment = formData.get("monthlyInstallment")
    ? Number(formData.get("monthlyInstallment"))
    : null;
  const retentionAmount = Number(formData.get("retentionAmount") ?? 0) || 0;
  const appointmentDate = String(formData.get("appointmentDate") ?? "").trim();
  const appointmentTime = String(formData.get("appointmentTime") ?? "").trim();
  const runnerId = String(formData.get("runnerId") ?? "").trim() || null;
  const runnerName = String(formData.get("runnerName") ?? "").trim();
  if (!appointmentDate) throw new Error("Pick an appointment date.");

  const { error } = await supabase
    .from("signing_bookings")
    .update({
      buyer_name: buyerName,
      financier,
      loan_amount: loanAmount,
      interest_rate: interestRate,
      tenure_months: tenureMonths,
      monthly_installment: monthlyInstallment,
      retention_amount: retentionAmount,
      appointment_date: appointmentDate,
      appointment_time: appointmentTime || null,
      runner_id: runnerId,
      runner_name: runnerName,
    })
    .eq("id", bookingId);
  if (error) throw new Error(error.message);
  revalidatePath("/signing");
  revalidatePath("/recon");
}

/** Records a photo already uploaded to storage against this booking - photoPath must already exist there. */
export async function saveSigningPhoto(bookingId: string, photoPath: string) {
  const { profile, supabase } = await requireStaff();
  const { data: booking } = await supabase
    .from("signing_bookings")
    .select("runner_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (profile.role === "runner" && booking?.runner_id !== profile.id) {
    throw new Error("You can only update your own signing bookings.");
  }
  const { error } = await supabase
    .from("signing_bookings")
    .update({ photo_path: photoPath })
    .eq("id", bookingId);
  if (error) throw new Error(error.message);
  revalidatePath("/recon");
  revalidatePath("/signing");
}

export async function markSigningBookingComplete(bookingId: string) {
  const { profile, supabase } = await requireStaff();
  const { data: booking } = await supabase
    .from("signing_bookings")
    .select("runner_id, photo_path")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) throw new Error("Booking not found.");
  if (profile.role === "runner" && booking.runner_id !== profile.id) {
    throw new Error("You can only complete your own signing bookings.");
  }
  if (!booking.photo_path) throw new Error("Attach a photo before marking this done.");

  const { error } = await supabase
    .from("signing_bookings")
    .update({
      status: "completed",
      completed_by_name: profile.full_name || "Staff",
      completed_at: new Date().toISOString(),
    })
    .eq("id", bookingId)
    .eq("status", "scheduled");
  if (error) throw new Error(error.message);
  revalidatePath("/recon");
  revalidatePath("/signing");
}

export async function removeSigningBooking(bookingId: string) {
  const { supabase } = await requireAdmin();
  const { data: existing } = await supabase
    .from("signing_bookings")
    .select("photo_path")
    .eq("id", bookingId)
    .maybeSingle();
  const { error } = await supabase.from("signing_bookings").delete().eq("id", bookingId);
  if (error) throw new Error(error.message);
  if (existing?.photo_path) {
    await supabase.storage.from("submission-files").remove([existing.photo_path]);
  }
  revalidatePath("/signing");
  revalidatePath("/recon");
}
