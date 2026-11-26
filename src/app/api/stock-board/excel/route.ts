import { NextResponse } from "next/server";
import { requireSalesStaff } from "@/lib/auth";
import { refreshStockBoardVehicles } from "@/lib/stockBoard";
import { buildStockBoardXlsx } from "@/lib/stockBoardExcel";
import { asStockBoardId } from "@/lib/stockBoardShared";

/** GET /api/stock-board/excel?board=main|cash - every car on that stock board as an .xlsx download. */
export async function GET(request: Request) {
  await requireSalesStaff();
  const board = asStockBoardId(new URL(request.url).searchParams.get("board"));

  let bytes: Buffer;
  try {
    bytes = await buildStockBoardXlsx(await refreshStockBoardVehicles(board), board);
  } catch {
    return new NextResponse("Stock Board unreachable - try again in a minute.", { status: 502 });
  }
  const stamp = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
  const name = board === "cash" ? "Stock-Board-Cash" : "Stock-Board";
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
