import { NextResponse } from "next/server";
import { requireSalesStaff } from "@/lib/auth";
import { CAR_PHOTO_FIELD_PREFIX, CAR_PHOTO_SLOTS } from "@/lib/carPhotoSlots";
import { blackOutPlates, buildCarPhotoPdf } from "@/lib/carPhotos";

export async function POST(request: Request) {
  await requireSalesStaff();

  try {
    const formData = await request.formData();
    const name = String(formData.get("name") ?? "").trim();

    const uploads: { key: string; bytes: Buffer }[] = [];
    for (const slot of CAR_PHOTO_SLOTS) {
      const file = formData.get(`${CAR_PHOTO_FIELD_PREFIX}${slot.key}`);
      if (!(file instanceof File) || file.size === 0) continue;
      uploads.push({ key: slot.key, bytes: Buffer.from(await file.arrayBuffer()) });
    }
    if (uploads.length === 0) {
      return NextResponse.json({ error: "Add at least one photo." }, { status: 400 });
    }

    const masked = await Promise.all(uploads.map((u) => blackOutPlates(u.bytes)));
    const pdf = await buildCarPhotoPdf(masked, name ? `Car photos - ${name}` : "Car photos");

    const platesFound = Object.fromEntries(uploads.map((u, i) => [u.key, masked[i].platesFound]));
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
