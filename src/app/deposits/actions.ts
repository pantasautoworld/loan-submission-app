"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireStaff } from "@/lib/auth";
import {
  DEPOSIT_METHODS,
  recordDepositPayment,
  removeDepositPayment,
  setSigningDate as saveSigningDate,
  type DepositMethod,
} from "@/lib/depositPayments";

export async function logDepositPayment(formData: FormData) {
  const { profile } = await requireStaff();

  const stockBoardVehicleId = String(formData.get("stockBoardVehicleId") ?? "");
  const noPlate = String(formData.get("noPlate") ?? "");
  const vehicle = String(formData.get("vehicle") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const methodRaw = String(formData.get("method") ?? "");
  const amount = Number(formData.get("amount"));
  const file = formData.get("receipt") as File | null;

  if (!stockBoardVehicleId || !noPlate) throw new Error("Missing car reference.");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid amount.");
  if (!file || file.size === 0) throw new Error("A receipt file is required.");
  if (!DEPOSIT_METHODS.includes(methodRaw as DepositMethod)) throw new Error("Select a deposit method.");
  const method = methodRaw as DepositMethod;

  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();

  await recordDepositPayment({
    stockBoardVehicleId,
    noPlate,
    vehicle,
    note,
    method,
    amount,
    receiptBytes: bytes,
    receiptExt: ext,
    uploadedByProfileId: profile.id,
    uploadedByName: profile.full_name || "Staff",
    source: "app",
  });

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
