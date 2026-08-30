"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireStaff } from "@/lib/auth";
import { attachClaimInvoiceGrant, createClaimInvoice, deleteClaimInvoice } from "@/lib/claimInvoices";

/** Every claim invoice goes through the same financier - no longer a per-invoice choice. */
const FINANCIER = "ELK";

export async function createInvoice(formData: FormData) {
  const { profile, supabase } = await requireStaff();

  const invoiceDate = String(formData.get("invoiceDate") ?? "").trim();
  const agentName = String(formData.get("agentName") ?? "").trim();
  const term = String(formData.get("term") ?? "Loan") === "Cash" ? "Cash" : "Loan";
  const buyerName = String(formData.get("buyerName") ?? "").trim();
  const buyerAddress = String(formData.get("buyerAddress") ?? "").trim();
  const vehicleNo = String(formData.get("vehicleNo") ?? "").trim();
  const model = String(formData.get("model") ?? "").trim();
  const chassisNo = String(formData.get("chassisNo") ?? "").trim();
  const engineNo = String(formData.get("engineNo") ?? "").trim();
  const loanAmountRaw = Number(formData.get("loanAmount") ?? 0);
  const depositAmountRaw = Number(formData.get("depositAmount") ?? 0);
  const loanAmount = Number.isFinite(loanAmountRaw) ? loanAmountRaw : 0;
  const depositAmount = Number.isFinite(depositAmountRaw) ? depositAmountRaw : 0;
  // Selling price is never entered directly - it's always the sum of the loan and deposit.
  const sellingPrice = loanAmount + depositAmount;

  if (!invoiceDate) throw new Error("Pick the invoice date (car delivery date).");
  if (!buyerName) throw new Error("Enter the buyer's name.");
  if (!vehicleNo) throw new Error("Enter the vehicle number.");
  if (sellingPrice <= 0) throw new Error("Enter a deposit and/or loan amount.");

  const invoice = await createClaimInvoice(supabase, {
    invoiceDate,
    agentName: agentName || profile.full_name || "Staff",
    financier: FINANCIER,
    term,
    buyerName,
    buyerAddress,
    vehicleNo,
    model,
    chassisNo,
    engineNo,
    sellingPrice,
    loanAmount,
    depositAmount,
    createdByProfileId: profile.id,
    createdByName: profile.full_name || "Staff",
  });

  const grantFile = formData.get("grant") as File | null;
  if (grantFile && grantFile.size > 0) {
    const bytes = Buffer.from(await grantFile.arrayBuffer());
    const ext = (grantFile.name.split(".").pop() || "jpg").toLowerCase();
    await attachClaimInvoiceGrant(supabase, invoice.id, bytes, ext);
  }

  revalidatePath("/invoices");
  redirect("/invoices");
}

export async function removeInvoice(invoiceId: string) {
  const { supabase } = await requireAdmin();
  await deleteClaimInvoice(supabase, invoiceId);
  revalidatePath("/invoices");
}
