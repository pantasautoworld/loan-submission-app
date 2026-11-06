import { NextResponse } from "next/server";
import { requireSalesStaff } from "@/lib/auth";
import { CAR_PHOTO_FIELD_PREFIX, MAX_CAR_PHOTOS } from "@/lib/carPhotoSlots";
import { blackOutPlates, buildCarPhotoPdf } from "@/lib/carPhotos";

// Each photo makes several model calls, so a big batch is worked through a few at a time.
const PHOTOS_AT_ONCE = 4;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function POST(request: Request) {
  await requireSalesStaff();

  try {
    const formData = await request.formData();
    const name = String(formData.get("name") ?? "").trim();

    // photo_0, photo_1, ... - the number is the page order the user arranged.
    const uploads: Buffer[] = [];
    for (let i = 0; i < MAX_CAR_PHOTOS; i++) {
      const file = formData.get(`${CAR_PHOTO_FIELD_PREFIX}${i}`);
      if (!(file instanceof File) || file.size === 0) continue;
      uploads.push(Buffer.from(await file.arrayBuffer()));
    }
    if (uploads.length === 0) {
      return NextResponse.json({ error: "Add at least one photo." }, { status: 400 });
    }

    const masked = await mapWithConcurrency(uploads, PHOTOS_AT_ONCE, blackOutPlates);
    const pdf = await buildCarPhotoPdf(masked, name ? `Car photos - ${name}` : "Car photos");

    const platesFound = masked.map((m) => m.platesFound);
    const safeName = name.replace(/[^A-Za-z0-9]/g, "") || "car";
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Car-Photos-${safeName}.pdf"`,
        "X-Plates-Found": JSON.stringify(platesFound),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not make the PDF";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
