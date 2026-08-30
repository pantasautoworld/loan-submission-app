"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireStaff } from "@/lib/auth";
import { attachClaimInvoiceGrant, createClaimInvoice, deleteClaimInvoice } from "@/lib/claimInvoices";

export async function createInvoice(formData: FormData) {
  const { profile, supabase } = await requireStaff();

  const agentName = String(formData.get("agentName") ?? "").trim();
  const financier = String(formData.get("financier") ?? "").trim();
  const term = String(formData.get("term") ?? "Loan") === "Cash" ? "Cash" : "Loan";
  const buyerName = String(formData.get("buyerName") ?? "").trim();
  const buyerAddress = String(formData.get("buyerAddress") ?? "").trim();
  const vehicleNo = String(formData.get("vehicleNo") ?? "").trim();
  const model = String(formData.get("model") ?? "").trim();
  const chassisNo = String(formData.get("chassisNo") ?? "").trim();
  const engineNo = String(formData.get("engineNo") ?? "").trim();
  const sellingPrice = Number(formData.get("sellingPrice") ?? 0);
  const loanAmount = Number(formData.get("loanAmount") ?? 0);
  const depositAmount = Number(formData.get("depositAmount") ?? 0);

  if (!buyerName) throw new Error("Enter the buyer's name.");
  if (!vehicleNo) throw new Error("Enter the vehicle number.");
  if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) throw new Error("Enter a valid selling price.");

  const invoice = await createClaimInvoice(supabase, {
    agentName: agentName || profile.full_name || "Staff",
    financier,
    term,
    buyerName,
    buyerAddress,
    vehicleNo,
    model,
    chassisNo,
    engineNo,
    sellingPrice,
    loanAmount: Number.isFinite(loanAmount) ? loanAmount : 0,
    depositAmount: Number.isFinite(depositAmount) ? depositAmount : 0,
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
