import { createAdminClient } from "@/lib/supabase/admin";

export type InvoiceDraftStep = "await_date" | "await_loan" | "await_deposit";

export interface TelegramInvoiceDraft {
  chat_id: string;
  step: InvoiceDraftStep;
  grant_path: string;
  delivery_date: string | null;
  loan_amount: number | null;
  created_by_name: string;
  created_at: string;
}

export async function getInvoiceDraft(chatId: string): Promise<TelegramInvoiceDraft | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("telegram_invoice_drafts")
    .select("*")
    .eq("chat_id", chatId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as TelegramInvoiceDraft) ?? null;
}

/** Starts (or restarts, if one was already mid-flow) a draft for this chat - one at a time per chat. */
export async function startInvoiceDraft(chatId: string, grantPath: string, createdByName: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("telegram_invoice_drafts").upsert({
    chat_id: chatId,
    step: "await_date",
    grant_path: grantPath,
    delivery_date: null,
    loan_amount: null,
    created_by_name: createdByName,
  });
  if (error) throw new Error(error.message);
}

export async function advanceInvoiceDraftToLoan(chatId: string, deliveryDate: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("telegram_invoice_drafts")
    .update({ delivery_date: deliveryDate, step: "await_loan" })
    .eq("chat_id", chatId);
  if (error) throw new Error(error.message);
}

export async function advanceInvoiceDraftToDeposit(chatId: string, loanAmount: number): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("telegram_invoice_drafts")
    .update({ loan_amount: loanAmount, step: "await_deposit" })
    .eq("chat_id", chatId);
  if (error) throw new Error(error.message);
}

export async function deleteInvoiceDraft(chatId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("telegram_invoice_drafts").delete().eq("chat_id", chatId);
  if (error) throw new Error(error.message);
}
