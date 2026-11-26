import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { fetchPhoto } from "@/lib/stockBoard";

/**
 * GET /api/stock-board/photo/:id - a Stock Board car photo as an image, for staff only.
 * Firebase is locked down, so the browser can't read the photo (stored there as a data URL)
 * directly; serving it as a plain image also lets the board load all photos in parallel
 * and cache them. Add ?v=<updatedAt> so a re-saved car gets its new photo.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;

  let dataUrl: string | null;
  try {
    dataUrl = await fetchPhoto(id);
  } catch {
    return new NextResponse("Stock Board unreachable", { status: 502 });
  }
  const match = typeof dataUrl === "string" ? dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i) : null;
  if (!match) return new NextResponse("No photo", { status: 404, headers: { "Cache-Control": "private, max-age=60" } });

  return new NextResponse(new Uint8Array(Buffer.from(match[2], "base64")), {
    headers: { "Content-Type": match[1], "Cache-Control": "private, max-age=3600" },
  });
}
