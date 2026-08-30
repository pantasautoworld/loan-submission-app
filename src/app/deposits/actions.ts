"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireStaff } from "@/lib/auth";
import {
  DEPOSIT_METHODS,
  ensureCarDeposit,
  recordDepositPayment,
  removeDepositPayment,
  setSigningDate as saveSigningDate,
  type DepositMethod,
} from "@/lib/depositPayments";
import { fetchStockBoardVehicles, findByPlate } from "@/lib/stockBoard";

export async function logDepositPayment(formData: FormData) {
  const { profile } = await requireStaff();

  const stockBoardVehicleId = String(formData.get("stockBoardVehicleId") ?? "");
  const noPlate = String(formData.get("noPlate") ?? "");
  const vehicle = String(formData.get("vehicle") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const receiptNumber = String(formData.get("receiptNumber") ?? "").trim();
  const methodRaw = String(formData.get("method") ?? "");
  const amount = Number(formData.get("amount"));
  const file = formData.get("receipt") as File | null;

  if (!stockBoardVehicleId || !noPlate) throw new Error("Missing car reference.");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid amount.");
  if (!DEPOSIT_METHODS.includes(methodRaw as DepositMethod)) throw new Error("Select a deposit method.");
  const method = methodRaw as DepositMethod;

  const hasReceipt = !!file && file.size > 0;
  const bytes = hasReceipt ? Buffer.from(await file!.arrayBuffer()) : null;
  const ext = hasReceipt ? (file!.name.split(".").pop() || "jpg").toLowerCase() : null;

  await recordDepositPayment({
    stockBoardVehicleId,
    noPlate,
    vehicle,
    note,
    method,
    receiptNumber,
    amount,
    receiptBytes: bytes,
    receiptExt: ext,
    uploadedByProfileId: profile.id,
    uploadedByName: profile.full_name || "Staff",
    source: "app",
  });

  revalidatePath("/deposits");
}

/** "Add plate manually" - starts tracking a car that isn't auto-listed (e.g. not currently Loan Approved) so staff can log a payment against it. */
export async function addDepositCarByPlate(plate: string) {
  await requireStaff();
  const trimmed = plate.trim();
  if (!trimmed) throw new Error("Enter a plate number.");

  const vehicles = await fetchStockBoardVehicles();
  const vehicle = findByPlate(trimmed, vehicles);
  if (!vehicle) throw new Error(`No car on the Stock Board matches plate "${trimmed}".`);

  await ensureCarDeposit(vehicle.id, vehicle.vin, vehicle.vehicle);
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
