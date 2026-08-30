import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  editTelegramMessageCaption,
  editTelegramMessageText,
  sendTelegramMessageWithKeyboard,
  sendTelegramPhoto,
  telegramChatAllowlist,
  type InlineKeyboard,
} from "@/lib/telegram";

export const DEPOSIT_METHODS = ["Bank transfer", "Cash", "QR Scan", "E-Wallet"] as const;
export type DepositMethod = (typeof DEPOSIT_METHODS)[number];

export interface DepositPaymentRow {
  id: string;
  car_deposit_id: string;
  note: string;
  amount: number;
  method: DepositMethod | "";
  receipt_number: string;
  receipt_path: string | null;
  status: "pending" | "approved" | "rejected";
  uploaded_by: string | null;
  uploaded_by_name: string;
  source: "app" | "telegram";
  uploaded_at: string;
  approved_by_name: string | null;
  approved_at: string | null;
  telegram_messages: { chat_id: string; message_id: number; has_photo: boolean }[];
}

export interface CarDepositRow {
  id: string;
  stock_board_vehicle_id: string;
  no_plate: string;
  vehicle: string;
  signing_date: string | null;
  created_at: string;
}

export interface CarDepositWithPayments extends CarDepositRow {
  payments: DepositPaymentRow[];
}

/** Folder name for a car's receipts - e.g. "VAJ7259" - so all its payments land in one place, browsable by plate. */
function sanitizePlateForPath(plate: string): string {
  return plate.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") || "UNKNOWN";
}

function mimeFromExt(ext: string): string {
  const e = ext.toLowerCase();
  if (e === "png") return "image/png";
  if (e === "webp") return "image/webp";
  if (e === "heic" || e === "heif") return "image/heic";
  return "image/jpeg";
}

export function buildDepositCaption(input: {
  vehicle: string;
  noPlate: string;
  amount: number;
  note: string;
  method?: string;
  receiptNumber?: string;
  uploadedByName: string;
}): string {
  return (
    `💰 <b>New deposit payment</b>\n` +
    `${input.vehicle} (${input.noPlate})\n` +
    `Amount: RM${input.amount.toLocaleString()}` +
    (input.method ? `\nMethod: ${input.method}` : "") +
    (input.receiptNumber ? `\nReceipt No: ${input.receiptNumber}` : "") +
    (input.note ? `\nNote: ${input.note}` : "") +
    `\nBy: ${input.uploadedByName}`
  );
}

/** Edits one previously-sent Telegram message, using the right endpoint depending on whether it was a photo or plain text. */
export async function editDepositTelegramMessage(
  message: { chat_id: string; message_id: number; has_photo: boolean },
  text: string
): Promise<void> {
  if (message.has_photo) {
    await editTelegramMessageCaption(message.chat_id, message.message_id, text);
  } else {
    await editTelegramMessageText(message.chat_id, message.message_id, text);
  }
}

/**
 * Sum of *approved* payments per car, keyed by stock_board_vehicle_id - for
 * the Stock Board's "Deposit pending" / "Fully deposited" filter, which
 * compares this against each car's own "Deposit Required" figure.
 */
export async function fetchApprovedDepositTotals(supabase: SupabaseClient): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("car_deposit_payments")
    .select("amount, car_deposits!inner(stock_board_vehicle_id)")
    .eq("status", "approved");
  if (error) throw new Error(error.message);

  const totals: Record<string, number> = {};
  for (const row of (data ?? []) as unknown as { amount: number; car_deposits: { stock_board_vehicle_id: string } }[]) {
    const vehicleId = row.car_deposits.stock_board_vehicle_id;
    totals[vehicleId] = (totals[vehicleId] ?? 0) + Number(row.amount);
  }
  return totals;
}

/** Every car_deposits row plus its payments, joined in-memory (small tables, simplest reliable option). */
export async function fetchCarDeposits(supabase: SupabaseClient): Promise<CarDepositWithPayments[]> {
  const { data: deposits, error: depErr } = await supabase.from("car_deposits").select("*");
  if (depErr) throw new Error(depErr.message);

  const { data: payments, error: payErr } = await supabase
    .from("car_deposit_payments")
    .select("*")
    .order("uploaded_at", { ascending: false });
  if (payErr) throw new Error(payErr.message);

  return ((deposits ?? []) as CarDepositRow[]).map((d) => ({
    ...d,
    payments: ((payments ?? []) as DepositPaymentRow[]).filter((p) => p.car_deposit_id === d.id),
  }));
}

export async function getReceiptSignedUrl(
  supabase: SupabaseClient,
  receiptPath: string
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from("submission-files")
    .createSignedUrl(receiptPath, 3600);
  if (error || !data) return null;
  return data.signedUrl;
}

export interface RecordDepositPaymentInput {
  stockBoardVehicleId: string;
  noPlate: string;
  vehicle: string;
  note: string;
  method: DepositMethod | "";
  receiptNumber: string;
  amount: number;
  receiptBytes: Buffer | null;
  receiptExt: string | null;
  uploadedByProfileId: string | null;
  uploadedByName: string;
  source: "app" | "telegram";
}

async function upsertCarDeposit(
  admin: SupabaseClient,
  stockBoardVehicleId: string,
  noPlate: string,
  vehicle: string
): Promise<CarDepositRow> {
  const { data, error } = await admin
    .from("car_deposits")
    .upsert(
      { stock_board_vehicle_id: stockBoardVehicleId, no_plate: noPlate, vehicle },
      { onConflict: "stock_board_vehicle_id" }
    )
    .select()
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not create deposit record");
  return data as CarDepositRow;
}

/**
 * Starts tracking a car for deposit payments without logging one yet - the
 * "add plate manually" entry point, for a car not currently auto-listed
 * (e.g. its Stock Board status isn't Loan Approved/Deposit Received). Just
 * an upsert, so calling it again for the same car is a harmless no-op.
 */
export async function ensureCarDeposit(
  stockBoardVehicleId: string,
  noPlate: string,
  vehicle: string
): Promise<CarDepositRow> {
  const admin = createAdminClient();
  return upsertCarDeposit(admin, stockBoardVehicleId, noPlate, vehicle);
}

/**
 * Shared by both entry points (in-app upload and a receipt texted straight
 * to the Telegram bot) so they can't drift: creates/reuses the car's
 * deposit record, uploads the receipt, records the payment as "pending",
 * and sends it to every admin on Telegram with Approve/Reject buttons.
 */
export async function recordDepositPayment(
  input: RecordDepositPaymentInput
): Promise<{ payment: DepositPaymentRow; carDepositId: string }> {
  const admin = createAdminClient();

  const carDeposit = await upsertCarDeposit(admin, input.stockBoardVehicleId, input.noPlate, input.vehicle);

  const { data: payment, error: insertErr } = await admin
    .from("car_deposit_payments")
    .insert({
      car_deposit_id: carDeposit.id,
      note: input.note,
      method: input.method,
      receipt_number: input.receiptNumber,
      amount: input.amount,
      status: "pending",
      uploaded_by: input.uploadedByProfileId,
      uploaded_by_name: input.uploadedByName,
      source: input.source,
    })
    .select()
    .single();
  if (insertErr || !payment) throw new Error(insertErr?.message ?? "Could not record payment");

  const hasReceipt = !!input.receiptBytes && !!input.receiptExt;
  let receiptPath: string | null = null;
  if (hasReceipt) {
    receiptPath = `deposits/${sanitizePlateForPath(input.noPlate)}/${payment.id}.${input.receiptExt}`;
    const { error: uploadErr } = await admin.storage
      .from("submission-files")
      .upload(receiptPath, input.receiptBytes!, {
        contentType: mimeFromExt(input.receiptExt!),
        upsert: true,
      });
    if (uploadErr) throw new Error(uploadErr.message);
  }

  const caption = buildDepositCaption({
    vehicle: input.vehicle,
    noPlate: input.noPlate,
    amount: input.amount,
    note: input.note,
    method: input.method,
    receiptNumber: input.receiptNumber,
    uploadedByName: input.uploadedByName,
  });

  const keyboard: InlineKeyboard = [
    [
      { text: "✅ Approve", callback_data: `dep:${payment.id}:approve` },
      { text: "❌ Reject", callback_data: `dep:${payment.id}:reject` },
    ],
  ];

  const telegramMessages: { chat_id: string; message_id: number; has_photo: boolean }[] = [];
  for (const chatId of telegramChatAllowlist()) {
    const messageId = hasReceipt
      ? await sendTelegramPhoto(chatId, input.receiptBytes!, `receipt.${input.receiptExt}`, caption, keyboard)
      : await sendTelegramMessageWithKeyboard(chatId, caption, keyboard);
    if (messageId) telegramMessages.push({ chat_id: chatId, message_id: messageId, has_photo: hasReceipt });
  }

  const { data: finalPayment, error: finalErr } = await admin
    .from("car_deposit_payments")
    .update({ receipt_path: receiptPath, telegram_messages: telegramMessages })
    .eq("id", payment.id)
    .select()
    .single();
  if (finalErr || !finalPayment) throw new Error(finalErr?.message ?? "Could not finalize payment");

  return { payment: finalPayment as DepositPaymentRow, carDepositId: carDeposit.id };
}

/** How many payments for this car have been approved - used to detect "this was the first one". */
export async function countApprovedPayments(carDepositId: string): Promise<number> {
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("car_deposit_payments")
    .select("id", { count: "exact", head: true })
    .eq("car_deposit_id", carDepositId)
    .eq("status", "approved");
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * Resolves a pending payment (Telegram Approve/Reject tap). The extra
 * `.eq("status", "pending")` makes this idempotent - a double-tap or a
 * duplicate Telegram delivery finds no matching row the second time and
 * returns null instead of re-resolving.
 */
export async function resolveDepositPayment(
  paymentId: string,
  decision: "approved" | "rejected",
  approverName: string
): Promise<{ payment: DepositPaymentRow; carDeposit: CarDepositRow } | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("car_deposit_payments")
    .update({ status: decision, approved_by_name: approverName, approved_at: new Date().toISOString() })
    .eq("id", paymentId)
    .eq("status", "pending")
    .select("*, car_deposits(*)")
    .single();
  if (error || !data) return null;

  const { car_deposits: carDeposit, ...payment } = data as DepositPaymentRow & {
    car_deposits: CarDepositRow;
  };
  return { payment: payment as DepositPaymentRow, carDeposit };
}

/**
 * Admin-only correction for a wrongly-uploaded payment: removes the row and
 * its receipt, and best-effort edits every admin's Telegram copy to show it
 * was deleted (removing the now-dangling Approve/Reject buttons) rather than
 * leaving them tappable against a payment that no longer exists.
 */
export async function removeDepositPayment(paymentId: string, actorName: string): Promise<void> {
  const admin = createAdminClient();

  const { data, error: fetchErr } = await admin
    .from("car_deposit_payments")
    .select("*, car_deposits(*)")
    .eq("id", paymentId)
    .single();
  if (fetchErr || !data) throw new Error(fetchErr?.message ?? "Payment not found");

  const { car_deposits: carDeposit, ...payment } = data as DepositPaymentRow & {
    car_deposits: CarDepositRow;
  };

  const { error: deleteErr } = await admin.from("car_deposit_payments").delete().eq("id", paymentId);
  if (deleteErr) throw new Error(deleteErr.message);

  if (payment.receipt_path) {
    await admin.storage.from("submission-files").remove([payment.receipt_path]).catch(() => {});
  }

  if (payment.telegram_messages.length > 0) {
    const caption = `${buildDepositCaption({
      vehicle: carDeposit.vehicle,
      noPlate: carDeposit.no_plate,
      amount: payment.amount,
      note: payment.note,
      method: payment.method,
      receiptNumber: payment.receipt_number,
      uploadedByName: payment.uploaded_by_name,
    })}\n\n🗑 Deleted by ${actorName}`;
    await Promise.all(payment.telegram_messages.map((tm) => editDepositTelegramMessage(tm, caption)));
  }
}

export async function setSigningDate(carDepositId: string, signingDate: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("car_deposits")
    .update({ signing_date: signingDate })
    .eq("id", carDepositId);
  if (error) throw new Error(error.message);
}
