import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
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
  receipt_path: string | null;
  status: "pending" | "approved" | "rejected";
  uploaded_by: string | null;
  uploaded_by_name: string;
  source: "app" | "telegram";
  uploaded_at: string;
  approved_by_name: string | null;
  approved_at: string | null;
  telegram_messages: { chat_id: string; message_id: number }[];
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
  uploadedByName: string;
}): string {
  return (
    `💰 <b>New deposit payment</b>\n` +
    `${input.vehicle} (${input.noPlate})\n` +
    `Amount: RM${input.amount.toLocaleString()}` +
    (input.method ? `\nMethod: ${input.method}` : "") +
    (input.note ? `\nNote: ${input.note}` : "") +
    `\nBy: ${input.uploadedByName}`
  );
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
  amount: number;
  receiptBytes: Buffer;
  receiptExt: string;
  uploadedByProfileId: string | null;
  uploadedByName: string;
  source: "app" | "telegram";
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

  const { data: carDeposit, error: upsertErr } = await admin
    .from("car_deposits")
    .upsert(
      {
        stock_board_vehicle_id: input.stockBoardVehicleId,
        no_plate: input.noPlate,
        vehicle: input.vehicle,
      },
      { onConflict: "stock_board_vehicle_id" }
    )
    .select()
    .single();
  if (upsertErr || !carDeposit) throw new Error(upsertErr?.message ?? "Could not create deposit record");

  const { data: payment, error: insertErr } = await admin
    .from("car_deposit_payments")
    .insert({
      car_deposit_id: carDeposit.id,
      note: input.note,
      method: input.method,
      amount: input.amount,
      status: "pending",
      uploaded_by: input.uploadedByProfileId,
      uploaded_by_name: input.uploadedByName,
      source: input.source,
    })
    .select()
    .single();
  if (insertErr || !payment) throw new Error(insertErr?.message ?? "Could not record payment");

  const receiptPath = `deposits/${carDeposit.id}/${payment.id}.${input.receiptExt}`;
  const { error: uploadErr } = await admin.storage
    .from("submission-files")
    .upload(receiptPath, input.receiptBytes, {
      contentType: mimeFromExt(input.receiptExt),
      upsert: true,
    });
  if (uploadErr) throw new Error(uploadErr.message);

  const caption = buildDepositCaption({
    vehicle: input.vehicle,
    noPlate: input.noPlate,
    amount: input.amount,
    note: input.note,
    method: input.method,
    uploadedByName: input.uploadedByName,
  });

  const keyboard: InlineKeyboard = [
    [
      { text: "✅ Approve", callback_data: `dep:${payment.id}:approve` },
      { text: "❌ Reject", callback_data: `dep:${payment.id}:reject` },
    ],
  ];

  const telegramMessages: { chat_id: string; message_id: number }[] = [];
  for (const chatId of telegramChatAllowlist()) {
    const messageId = await sendTelegramPhoto(
      chatId,
      input.receiptBytes,
      `receipt.${input.receiptExt}`,
      caption,
      keyboard
    );
    if (messageId) telegramMessages.push({ chat_id: chatId, message_id: messageId });
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

export async function setSigningDate(carDepositId: string, signingDate: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("car_deposits")
    .update({ signing_date: signingDate })
    .eq("id", carDepositId);
  if (error) throw new Error(error.message);
}
