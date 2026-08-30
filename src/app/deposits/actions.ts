"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { recordDepositPayment, setSigningDate as saveSigningDate } from "@/lib/depositPayments";

export async function logDepositPayment(formData: FormData) {
  const { profile } = await requireStaff();

  const stockBoardVehicleId = String(formData.get("stockBoardVehicleId") ?? "");
  const noPlate = String(formData.get("noPlate") ?? "");
  const vehicle = String(formData.get("vehicle") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const amount = Number(formData.get("amount"));
  const file = formData.get("receipt") as File | null;

  if (!stockBoardVehicleId || !noPlate) throw new Error("Missing car reference.");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid amount.");
  if (!file || file.size === 0) throw new Error("A receipt file is required.");

  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();

  await recordDepositPayment({
    stockBoardVehicleId,
    noPlate,
    vehicle,
    label,
    amount,
    receiptBytes: bytes,
    receiptExt: ext,
    uploadedByProfileId: profile.id,
    uploadedByName: profile.full_name || "Staff",
    source: "app",
  });

  revalidatePath("/deposits");
}

export async function updateSigningDate(carDepositId: string, signingDate: string) {
  await requireStaff();
  await saveSigningDate(carDepositId, signingDate);
  revalidatePath("/deposits");
}
