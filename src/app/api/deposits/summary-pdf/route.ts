import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { fetchCarDeposits, summarizeApprovedDepositsForMonth } from "@/lib/depositPayments";
import { buildDepositSummaryPdf } from "@/lib/pdf/depositSummaryPdf";

export async function GET(request: Request) {
  const { supabase } = await requireStaff();

  const month = new URL(request.url).searchParams.get("month") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "Invalid or missing month (expected YYYY-MM)." }, { status: 400 });
  }

  const deposits = await fetchCarDeposits(supabase);
  const summary = summarizeApprovedDepositsForMonth(deposits, month);

  const [year, mon] = month.split("-").map(Number);
  const monthLabel = new Date(Date.UTC(year, mon - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const pdfBytes = await buildDepositSummaryPdf(monthLabel, summary);

  return new NextResponse(new Uint8Array(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="deposit-summary-${month}.pdf"`,
    },
  });
}
