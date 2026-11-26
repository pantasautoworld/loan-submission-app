import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { brokerSheetCsv, buildBrokerSheet, findActiveBroker } from "@/lib/brokerSheet";

/**
 * GET /broker/:key/excel - the broker's stock list as CSV, for Excel (Data > From Web, refreshed
 * on a timer) or Google Sheets (=IMPORTDATA). Same columns and cars as their phone page.
 * No staff login: the key is the access check; a blocked broker gets 403.
 */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const admin = createAdminClient();
  const broker = await findActiveBroker(admin, key);
  if (!broker) return new NextResponse("This link is not active.", { status: 403 });

  let csv: string;
  try {
    csv = brokerSheetCsv(await buildBrokerSheet(admin));
  } catch {
    return new NextResponse("Stock list is temporarily unavailable. Try again in a minute.", { status: 502 });
  }
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'inline; filename="stock-list.csv"',
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
