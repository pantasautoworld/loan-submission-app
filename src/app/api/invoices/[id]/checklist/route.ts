import { NextResponse } from "next/server";
import { requireSalesStaff } from "@/lib/auth";
import { fetchClaimInvoice } from "@/lib/claimInvoices";
import { buildSalesChecklistWorkbook, fetchSalesChecklistInput } from "@/lib/salesChecklist";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireSalesStaff();

  const invoice = await fetchClaimInvoice(supabase, id);
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const input = await fetchSalesChecklistInput(supabase, invoice);
  const bytes = await buildSalesChecklistWorkbook(input);

  const plate = invoice.vehicle_no.replace(/[^A-Za-z0-9]/g, "") || "car";
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Sales-Checklist-${plate}.xlsx"`,
    },
  });
}
