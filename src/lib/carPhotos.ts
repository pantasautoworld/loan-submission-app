import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { detectPlateBoxes, type PlateBox } from "@/lib/anthropic";

// Photos are normalised to this long edge before detection, so the model's pixel
// coordinates line up exactly with the image that gets blacked out and printed.
const MAX_EDGE = 1568;
const JPEG_QUALITY = 88;
// Two independent reads per photo, boxes unioned - one miss or one loose box won't leave a plate showing.
const DETECTION_PASSES = 2;
// A plate is never a big part of the frame; anything larger is the model boxing the wrong thing.
const MAX_BOX_AREA_RATIO = 0.3;
const BOX_PADDING_RATIO = 0.15;

export interface PreparedPhoto {
  jpeg: Buffer;
  width: number;
  height: number;
}

export interface MaskedPhoto extends PreparedPhoto {
  platesFound: number;
}

/** Applies the EXIF rotation, caps the size and re-encodes as JPEG. */
export async function preparePhoto(bytes: Buffer): Promise<PreparedPhoto> {
  const { data, info } = await sharp(bytes)
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer({ resolveWithObject: true });
  return { jpeg: data, width: info.width, height: info.height };
}

function toPaintBox(box: PlateBox, width: number, height: number): PlateBox | null {
  const x1 = Math.min(box.x1, box.x2);
  const x2 = Math.max(box.x1, box.x2);
  const y1 = Math.min(box.y1, box.y2);
  const y2 = Math.max(box.y1, box.y2);
  const w = x2 - x1;
  const h = y2 - y1;
  if (w < 4 || h < 3) return null;
  if ((w * h) / (width * height) > MAX_BOX_AREA_RATIO) return null;

  const padX = Math.max(6, w * BOX_PADDING_RATIO);
  const padY = Math.max(6, h * BOX_PADDING_RATIO);
  const left = Math.max(0, Math.floor(x1 - padX));
  const top = Math.max(0, Math.floor(y1 - padY));
  const right = Math.min(width, Math.ceil(x2 + padX));
  const bottom = Math.min(height, Math.ceil(y2 + padY));
  if (right <= left || bottom <= top) return null;
  return { x1: left, y1: top, x2: right, y2: bottom };
}

/** Boxes of every plate found, already padded and clamped to the image. */
async function findPlateBoxes(photo: PreparedPhoto): Promise<PlateBox[]> {
  const passes = await Promise.allSettled(
    Array.from({ length: DETECTION_PASSES }, () =>
      detectPlateBoxes(photo.jpeg, photo.width, photo.height)
    )
  );
  // Every pass failing means detection itself is down (bad key, API error), not "no plate":
  // surface that instead of quietly letting unmasked photos through.
  if (passes.every((p) => p.status === "rejected")) {
    const first = passes[0] as PromiseRejectedResult;
    throw first.reason instanceof Error ? first.reason : new Error("Plate detection failed");
  }

  const boxes: PlateBox[] = [];
  for (const pass of passes) {
    if (pass.status !== "fulfilled") continue;
    for (const raw of pass.value) {
      const box = toPaintBox(raw, photo.width, photo.height);
      if (box) boxes.push(box);
    }
  }
  return boxes;
}

/** Number of distinct plates among the boxes: overlapping boxes from separate passes are the same plate. */
function countDistinctPlates(boxes: PlateBox[]): number {
  const groups: PlateBox[] = [];
  for (const box of boxes) {
    const hit = groups.find(
      (g) => box.x1 < g.x2 && box.x2 > g.x1 && box.y1 < g.y2 && box.y2 > g.y1
    );
    if (hit) {
      hit.x1 = Math.min(hit.x1, box.x1);
      hit.y1 = Math.min(hit.y1, box.y1);
      hit.x2 = Math.max(hit.x2, box.x2);
      hit.y2 = Math.max(hit.y2, box.y2);
    } else {
      groups.push({ ...box });
    }
  }
  return groups.length;
}

/** Paints solid black over every number plate found in the photo. */
export async function blackOutPlates(bytes: Buffer): Promise<MaskedPhoto> {
  const photo = await preparePhoto(bytes);
  const boxes = await findPlateBoxes(photo);
  if (boxes.length === 0) return { ...photo, platesFound: 0 };

  const jpeg = await sharp(photo.jpeg)
    .composite(
      boxes.map((b) => ({
        input: {
          create: {
            width: b.x2 - b.x1,
            height: b.y2 - b.y1,
            channels: 3 as const,
            background: { r: 0, g: 0, b: 0 },
          },
        },
        left: b.x1,
        top: b.y1,
      }))
    )
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();

  return { jpeg, width: photo.width, height: photo.height, platesFound: countDistinctPlates(boxes) };
}

// A4 in points, orientation chosen per photo so landscape and portrait shots both fill the page.
const A4_LONG = 841.89;
const A4_SHORT = 595.28;
const PAGE_MARGIN = 24;

/** One photo per page, in the order given. */
export async function buildCarPhotoPdf(photos: PreparedPhoto[], title: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);

  for (const photo of photos) {
    const landscape = photo.width >= photo.height;
    const pageW = landscape ? A4_LONG : A4_SHORT;
    const pageH = landscape ? A4_SHORT : A4_LONG;
    const page = pdf.addPage([pageW, pageH]);

    const image = await pdf.embedJpg(photo.jpeg);
    const scale = Math.min(
      (pageW - PAGE_MARGIN * 2) / photo.width,
      (pageH - PAGE_MARGIN * 2) / photo.height
    );
    const w = photo.width * scale;
    const h = photo.height * scale;
    page.drawImage(image, { x: (pageW - w) / 2, y: (pageH - h) / 2, width: w, height: h });
  }

  return Buffer.from(await pdf.save());
}
