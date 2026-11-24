import { NextResponse } from "next/server";
import { requireSalesStaff } from "@/lib/auth";
import { fetchClaimInvoices } from "@/lib/claimInvoices";
import { buildInvoiceSummaryPdf, buildInvoiceSummaryXlsx, fetchInvoiceSummaryRows } from "@/lib/claimInvoiceSummary";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const ISO_MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

/**
 * GET /api/invoices/summary?format=pdf|xlsx&from=YYYY-MM-DD&to=YYYY-MM-DD (dates filter on the delivery date)
 * or ?month=YYYY-MM for one whole calendar month.
 */
export async function GET(request: Request) {
  const { supabase } = await requireSalesStaff();
  const params = new URL(request.url).searchParams;
  const format = params.get("format") === "pdf" ? "pdf" : "xlsx";
  let from = ISO_DATE.test(params.get("from") ?? "") ? params.get("from")! : undefined;
  let to = ISO_DATE.test(params.get("to") ?? "") ? params.get("to")! : undefined;
  const month = params.get("month") ?? "";
  const monthMatch = month.match(ISO_MONTH);
  if (monthMatch) {
    const lastDay = new Date(Date.UTC(Number(monthMatch[1]), Number(monthMatch[2]), 0)).getUTCDate();
    from = `${month}-01`;
    to = `${month}-${String(lastDay).padStart(2, "0")}`;
  }

  const invoices = await fetchClaimInvoices(supabase);
  const rows = await fetchInvoiceSummaryRows(supabase, invoices, { from, to });
  const bytes =
    format === "pdf"
      ? await buildInvoiceSummaryPdf(rows, { from, to })
      : await buildInvoiceSummaryXlsx(rows, { from, to });

  const stamp = monthMatch ? month : [from, to].filter(Boolean).join("_to_") || "all";
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Claim-Invoice-Summary-${stamp}.${format}"`,
    },
  });
}
