import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { detectPlateBoxes, type PlateBox } from "@/lib/anthropic";

// Photos are normalised to this long edge before detection, so the model's pixel
// coordinates line up exactly with the image that gets blacked out and printed.
const MAX_EDGE = 1568;
const JPEG_QUALITY = 88;
// Two independent reads of the whole photo, boxes unioned - one miss won't leave a plate showing.
const DETECTION_PASSES = 2;
// A plate is never a big part of the frame; anything larger is the model boxing the wrong thing.
const MAX_BOX_AREA_RATIO = 0.3;
// Second look: each plate is cropped out with this much room around it and measured again at
// high zoom, which gives a far tighter box than the first read of the whole photo.
const ZOOM_CONTEXT_RATIO = 0.6;
const ZOOM_MIN_CONTEXT = 24;
const ZOOM_LONG_EDGE = 1000;
// A zoomed box much smaller than the first one means the model latched onto a fragment of the plate.
const MIN_REFINED_AREA_RATIO = 0.35;
// Just enough black to be sure of covering the plate border.
const PAINT_PADDING_RATIO = 0.04;
const PAINT_MIN_PADDING = 3;

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

function normalizeBox(box: PlateBox, width: number, height: number): PlateBox | null {
  const x1 = Math.max(0, Math.min(box.x1, box.x2));
  const x2 = Math.min(width, Math.max(box.x1, box.x2));
  const y1 = Math.max(0, Math.min(box.y1, box.y2));
  const y2 = Math.min(height, Math.max(box.y1, box.y2));
  const w = x2 - x1;
  const h = y2 - y1;
  if (w < 4 || h < 3) return null;
  if ((w * h) / (width * height) > MAX_BOX_AREA_RATIO) return null;
  return { x1, y1, x2, y2 };
}

function overlaps(a: PlateBox, b: PlateBox): boolean {
  return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
}

function area(b: PlateBox): number {
  return Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
}

function intersectionArea(a: PlateBox, b: PlateBox): number {
  return area({
    x1: Math.max(a.x1, b.x1),
    y1: Math.max(a.y1, b.y1),
    x2: Math.min(a.x2, b.x2),
    y2: Math.min(a.y2, b.y2),
  });
}

/** Overlapping boxes from separate passes are the same plate - merge each cluster into one. */
function mergeOverlapping(boxes: PlateBox[]): PlateBox[] {
  const groups: PlateBox[] = [];
  for (const box of boxes) {
    let merged = { ...box };
    for (let i = groups.length - 1; i >= 0; i--) {
      if (overlaps(groups[i], merged)) {
        const g = groups.splice(i, 1)[0];
        merged = {
          x1: Math.min(g.x1, merged.x1),
          y1: Math.min(g.y1, merged.y1),
          x2: Math.max(g.x2, merged.x2),
          y2: Math.max(g.y2, merged.y2),
        };
      }
    }
    groups.push(merged);
  }
  return groups;
}

/** First read of the whole photo: loose boxes, one per distinct plate. */
async function findRoughPlateBoxes(photo: PreparedPhoto): Promise<PlateBox[]> {
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
      const box = normalizeBox(raw, photo.width, photo.height);
      if (box) boxes.push(box);
    }
  }
  return mergeOverlapping(boxes);
}

/** Second read of one plate, cropped and enlarged. Falls back to the rough box if the zoomed read is unusable. */
async function tightenBox(photo: PreparedPhoto, rough: PlateBox): Promise<PlateBox> {
  const w = rough.x2 - rough.x1;
  const h = rough.y2 - rough.y1;
  const padX = Math.max(ZOOM_MIN_CONTEXT, w * ZOOM_CONTEXT_RATIO);
  const padY = Math.max(ZOOM_MIN_CONTEXT, h * ZOOM_CONTEXT_RATIO);
  const left = Math.max(0, Math.floor(rough.x1 - padX));
  const top = Math.max(0, Math.floor(rough.y1 - padY));
  const right = Math.min(photo.width, Math.ceil(rough.x2 + padX));
  const bottom = Math.min(photo.height, Math.ceil(rough.y2 + padY));
  const cropW = right - left;
  const cropH = bottom - top;

  try {
    const { data, info } = await sharp(photo.jpeg)
      .extract({ left, top, width: cropW, height: cropH })
      .resize({ width: ZOOM_LONG_EDGE, height: ZOOM_LONG_EDGE, fit: "inside" })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer({ resolveWithObject: true });

    const scale = info.width / cropW;
    const found = await detectPlateBoxes(data, info.width, info.height);

    // The crop can catch a neighbouring plate; the right one is the box that lines up with the rough one.
    let best: PlateBox | null = null;
    let bestOverlap = 0;
    for (const raw of found) {
      const box = normalizeBox(raw, info.width, info.height);
      if (!box) continue;
      const inPhoto: PlateBox = {
        x1: left + box.x1 / scale,
        y1: top + box.y1 / scale,
        x2: left + box.x2 / scale,
        y2: top + box.y2 / scale,
      };
      const overlap = intersectionArea(inPhoto, rough);
      if (overlap > bestOverlap) {
        best = inPhoto;
        bestOverlap = overlap;
      }
    }
    if (best && area(best) >= area(rough) * MIN_REFINED_AREA_RATIO) return best;
  } catch {
    // keep the rough box
  }
  return rough;
}

function toPaintBox(box: PlateBox, width: number, height: number): PlateBox | null {
  const padX = Math.max(PAINT_MIN_PADDING, (box.x2 - box.x1) * PAINT_PADDING_RATIO);
  const padY = Math.max(PAINT_MIN_PADDING, (box.y2 - box.y1) * PAINT_PADDING_RATIO);
  const left = Math.max(0, Math.floor(box.x1 - padX));
  const top = Math.max(0, Math.floor(box.y1 - padY));
  const right = Math.min(width, Math.ceil(box.x2 + padX));
  const bottom = Math.min(height, Math.ceil(box.y2 + padY));
  if (right <= left || bottom <= top) return null;
  return { x1: left, y1: top, x2: right, y2: bottom };
}

/** Boxes to paint, one per plate, fitted close to the plate. */
export async function findPlateBoxes(photo: PreparedPhoto): Promise<PlateBox[]> {
  const rough = await findRoughPlateBoxes(photo);
  const tight = await Promise.all(rough.map((box) => tightenBox(photo, box)));
  return tight
    .map((box) => toPaintBox(box, photo.width, photo.height))
    .filter((box): box is PlateBox => box !== null);
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

  return { jpeg, width: photo.width, height: photo.height, platesFound: boxes.length };
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
