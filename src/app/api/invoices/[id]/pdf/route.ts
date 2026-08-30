import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { fetchClaimInvoice } from "@/lib/claimInvoices";
import { buildClaimInvoicePdf } from "@/lib/pdf/claimInvoicePdf";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireStaff();

  const invoice = await fetchClaimInvoice(supabase, id);
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const pdfBytes = await buildClaimInvoicePdf(invoice);

  return new NextResponse(new Uint8Array(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.invoice_no.replace(/[^A-Za-z0-9]/g, "-")}.pdf"`,
    },
  });
}
