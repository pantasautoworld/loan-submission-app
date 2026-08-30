import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { fetchLeaderboardData } from "@/lib/leaderboard";
import { buildLeaderboardSummaryPdf } from "@/lib/pdf/leaderboardSummaryPdf";
import { malaysiaMonthStartIso } from "@/lib/timezone";

export async function GET(request: Request) {
  const { supabase } = await requireStaff();

  const month = new URL(request.url).searchParams.get("month") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "Invalid or missing month (expected YYYY-MM)." }, { status: 400 });
  }

  const [year, mon] = month.split("-").map(Number);
  const monthStart = malaysiaMonthStartIso(year, mon);
  const monthEnd = malaysiaMonthStartIso(year, mon + 1);
  const monthLabel = new Date(Date.UTC(year, mon - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const { leaderboard, details } = await fetchLeaderboardData(supabase, monthStart, monthEnd);
  const pdfBytes = await buildLeaderboardSummaryPdf(monthLabel, leaderboard, details);

  return new NextResponse(new Uint8Array(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="leaderboard-${month}.pdf"`,
    },
  });
}
