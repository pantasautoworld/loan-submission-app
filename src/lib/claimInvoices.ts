import type { SupabaseClient } from "@supabase/supabase-js";

export interface ClaimInvoiceRow {
  id: string;
  invoice_no: string;
  invoice_date: string;
  agent_name: string;
  financier: string;
  term: "Loan" | "Cash";
  buyer_name: string;
  buyer_address: string;
  vehicle_no: string;
  model: string;
  chassis_no: string;
  engine_no: string;
  selling_price: number;
  loan_amount: number;
  deposit_amount: number;
  grant_path: string | null;
  created_by: string | null;
  created_by_name: string;
  created_at: string;
}

export async function fetchClaimInvoices(supabase: SupabaseClient): Promise<ClaimInvoiceRow[]> {
  const { data, error } = await supabase
    .from("claim_invoices")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ClaimInvoiceRow[];
}

export async function fetchClaimInvoice(supabase: SupabaseClient, id: string): Promise<ClaimInvoiceRow | null> {
  const { data, error } = await supabase.from("claim_invoices").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ClaimInvoiceRow) ?? null;
}

export interface CreateClaimInvoiceInput {
  invoiceDate: string;
  agentName: string;
  financier: string;
  term: "Loan" | "Cash";
  buyerName: string;
  buyerAddress: string;
  vehicleNo: string;
  model: string;
  chassisNo: string;
  engineNo: string;
  sellingPrice: number;
  loanAmount: number;
  depositAmount: number;
  createdByProfileId: string | null;
  createdByName: string;
}

/** Assigns the invoice number atomically (assign_claim_invoice_no) then inserts the row. */
export async function createClaimInvoice(
  supabase: SupabaseClient,
  input: CreateClaimInvoiceInput
): Promise<ClaimInvoiceRow> {
  const { data: invoiceNo, error: numError } = await supabase.rpc("assign_claim_invoice_no");
  if (numError || !invoiceNo) throw new Error(numError?.message ?? "Could not assign an invoice number");

  const { data, error } = await supabase
    .from("claim_invoices")
    .insert({
      invoice_no: invoiceNo,
      invoice_date: input.invoiceDate,
      agent_name: input.agentName,
      financier: input.financier,
      term: input.term,
      buyer_name: input.buyerName,
      buyer_address: input.buyerAddress,
      vehicle_no: input.vehicleNo,
      model: input.model,
      chassis_no: input.chassisNo,
      engine_no: input.engineNo,
      selling_price: input.sellingPrice,
      loan_amount: input.loanAmount,
      deposit_amount: input.depositAmount,
      created_by: input.createdByProfileId,
      created_by_name: input.createdByName,
    })
    .select()
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not create the invoice");
  return data as ClaimInvoiceRow;
}

export async function attachClaimInvoiceGrant(
  supabase: SupabaseClient,
  invoiceId: string,
  grantBytes: Buffer,
  grantExt: string
): Promise<void> {
  const grantPath = `claim-invoices/${invoiceId}/grant.${grantExt}`;
  const { error: uploadError } = await supabase.storage
    .from("submission-files")
    .upload(grantPath, grantBytes, { upsert: true });
  if (uploadError) throw new Error(uploadError.message);

  const { error } = await supabase.from("claim_invoices").update({ grant_path: grantPath }).eq("id", invoiceId);
  if (error) throw new Error(error.message);
}

export async function deleteClaimInvoice(supabase: SupabaseClient, id: string): Promise<void> {
  const invoice = await fetchClaimInvoice(supabase, id);
  const { error } = await supabase.from("claim_invoices").delete().eq("id", id);
  if (error) throw new Error(error.message);
  if (invoice?.grant_path) {
    await supabase.storage.from("submission-files").remove([invoice.grant_path]).catch(() => {});
  }
}
