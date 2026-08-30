"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireStaff } from "@/lib/auth";
import {
  DEPOSIT_METHODS,
  recordDepositPayment,
  removeDepositPayment,
  resolveDepositPaymentAndNotify,
  setSigningDate as saveSigningDate,
  type DepositMethod,
} from "@/lib/depositPayments";
import { fetchStockBoardVehicles, findByPlate } from "@/lib/stockBoard";

async function extractPaymentFields(formData: FormData) {
  const note = String(formData.get("note") ?? "").trim();
  const receiptNumber = String(formData.get("receiptNumber") ?? "").trim();
  const methodRaw = String(formData.get("method") ?? "");
  const amount = Number(formData.get("amount"));
  const file = formData.get("receipt") as File | null;

  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid amount.");
  if (!DEPOSIT_METHODS.includes(methodRaw as DepositMethod)) throw new Error("Select a deposit method.");

  const hasReceipt = !!file && file.size > 0;
  const receiptBytes = hasReceipt ? Buffer.from(await file.arrayBuffer()) : null;
  const receiptExt = hasReceipt ? (file.name.split(".").pop() || "jpg").toLowerCase() : null;

  return { note, receiptNumber, method: methodRaw as DepositMethod, amount, receiptBytes, receiptExt };
}

/** Used by each already-tracked car's own "+ Add payment" button, where the car is already known. */
export async function logDepositPayment(formData: FormData) {
  const { profile } = await requireStaff();

  const stockBoardVehicleId = String(formData.get("stockBoardVehicleId") ?? "");
  const noPlate = String(formData.get("noPlate") ?? "");
  const vehicle = String(formData.get("vehicle") ?? "");
  if (!stockBoardVehicleId || !noPlate) throw new Error("Missing car reference.");

  const fields = await extractPaymentFields(formData);

  await recordDepositPayment({
    stockBoardVehicleId,
    noPlate,
    vehicle,
    ...fields,
    uploadedByProfileId: profile.id,
    uploadedByName: profile.full_name || "Staff",
    source: "app",
  });

  revalidatePath("/deposits");
}

/** Used by the standalone "+ Add deposit" button, where staff type the plate directly - looked up here. */
export async function logDepositPaymentByPlate(formData: FormData) {
  const { profile } = await requireStaff();

  const plate = String(formData.get("plate") ?? "").trim();
  if (!plate) throw new Error("Enter a plate number.");

  const vehicles = await fetchStockBoardVehicles();
  const vehicle = findByPlate(plate, vehicles);
  if (!vehicle) throw new Error(`No car on the Stock Board matches plate "${plate}".`);
  if (vehicle.status === "sold") throw new Error(`${vehicle.vehicle} (${vehicle.vin}) is already marked Sold.`);

  const fields = await extractPaymentFields(formData);

  await recordDepositPayment({
    stockBoardVehicleId: vehicle.id,
    noPlate: vehicle.vin,
    vehicle: vehicle.vehicle,
    ...fields,
    uploadedByProfileId: profile.id,
    uploadedByName: profile.full_name || "Staff",
    source: "app",
  });

  revalidatePath("/deposits");
}

/** Admin-only: same effect as tapping ✅ Approve on Telegram, but from the website. */
export async function approveDepositPayment(paymentId: string) {
  const { profile } = await requireAdmin();
  const resolved = await resolveDepositPaymentAndNotify(paymentId, "approved", profile.full_name || "Admin");
  if (!resolved) throw new Error("This payment was already resolved.");
  revalidatePath("/deposits");
}

/** Admin-only: same effect as tapping ❌ Reject on Telegram, but from the website. */
export async function rejectDepositPayment(paymentId: string) {
  const { profile } = await requireAdmin();
  const resolved = await resolveDepositPaymentAndNotify(paymentId, "rejected", profile.full_name || "Admin");
  if (!resolved) throw new Error("This payment was already resolved.");
  revalidatePath("/deposits");
}

export async function deleteDepositPayment(paymentId: string) {
  const { profile } = await requireAdmin();
  await removeDepositPayment(paymentId, profile.full_name || "Admin");
  revalidatePath("/deposits");
}

export async function updateSigningDate(carDepositId: string, signingDate: string) {
  await requireStaff();
  await saveSigningDate(carDepositId, signingDate);
  revalidatePath("/deposits");
}
