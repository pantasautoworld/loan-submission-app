import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { detectPlateBoxes, detectPlateCorners, type PlateBox, type PlatePoint } from "@/lib/anthropic";

// Photos are normalised to this long edge before detection, so the model's pixel
// coordinates line up exactly with the image that gets blacked out and printed.
const MAX_EDGE = 1568;
const JPEG_QUALITY = 88;
// Two independent reads of the whole photo, boxes unioned - one miss won't leave a plate showing.
const DETECTION_PASSES = 2;
// A plate is never a big part of the frame; anything larger is the model boxing the wrong thing.
const MAX_BOX_AREA_RATIO = 0.3;
// Second look: each plate is cropped out with this much room around it and its four corners are
// measured again at high zoom - far more exact than the first read of the whole photo, and it follows
// the plate's real (angled) outline instead of an upright box that would also cover the paint.
const ZOOM_CONTEXT_RATIO = 0.35;
const ZOOM_MIN_CONTEXT = 20;
const ZOOM_LONG_EDGE = 1200;
// The zoomed outline should be about the size of the rough box; far smaller means the model found
// a fragment of the plate, far larger means it found something else.
const MIN_REFINED_AREA_RATIO = 0.3;
const MAX_REFINED_AREA_RATIO = 1.5;
// Just enough black to be sure of covering the plate's own edge.
const PAINT_GROW_RATIO = 0.02;
const PAINT_GROW_PX = 1.5;

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

function polygonArea(points: PlatePoint[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

function boxToPolygon(b: PlateBox): PlatePoint[] {
  return [
    { x: b.x1, y: b.y1 },
    { x: b.x2, y: b.y1 },
    { x: b.x2, y: b.y2 },
    { x: b.x1, y: b.y2 },
  ];
}

function polygonBounds(points: PlatePoint[]): PlateBox {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
}

/** Second read of one plate, cropped and enlarged, giving its exact corners. Falls back to the rough box if the zoomed read is unusable. */
async function tightenPlate(photo: PreparedPhoto, rough: PlateBox): Promise<PlatePoint[]> {
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
    const found = await detectPlateCorners(data, info.width, info.height);

    // The crop can catch a neighbouring plate; the right one is the shape that lines up with the rough box.
    let best: PlatePoint[] | null = null;
    let bestOverlap = 0;
    for (const quad of found) {
      const inPhoto = quad.map((p) => ({ x: left + p.x / scale, y: top + p.y / scale }));
      const overlap = intersectionArea(polygonBounds(inPhoto), rough);
      if (overlap > bestOverlap) {
        best = inPhoto;
        bestOverlap = overlap;
      }
    }
    if (best) {
      const shapeArea = polygonArea(best);
      const roughArea = area(rough);
      if (shapeArea >= roughArea * MIN_REFINED_AREA_RATIO && shapeArea <= roughArea * MAX_REFINED_AREA_RATIO) {
        return best;
      }
    }
  } catch {
    // keep the rough box
  }
  return boxToPolygon(rough);
}

/** Grows the shape outward by a hair so the plate's own edge is never left showing. */
function growPolygon(points: PlatePoint[], width: number, height: number): PlatePoint[] {
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  return points.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    return {
      x: Math.min(width, Math.max(0, cx + dx * (1 + PAINT_GROW_RATIO) + Math.sign(dx) * PAINT_GROW_PX)),
      y: Math.min(height, Math.max(0, cy + dy * (1 + PAINT_GROW_RATIO) + Math.sign(dy) * PAINT_GROW_PX)),
    };
  });
}

/** Shapes to paint, one per plate, following the plate's own outline. */
export async function findPlateShapes(photo: PreparedPhoto): Promise<PlatePoint[][]> {
  const rough = await findRoughPlateBoxes(photo);
  const tight = await Promise.all(rough.map((box) => tightenPlate(photo, box)));
  return tight.map((shape) => growPolygon(shape, photo.width, photo.height));
}

/** Paints solid black over every number plate found in the photo. */
export async function blackOutPlates(bytes: Buffer): Promise<MaskedPhoto> {
  const photo = await preparePhoto(bytes);
  const shapes = await findPlateShapes(photo);
  if (shapes.length === 0) return { ...photo, platesFound: 0 };

  const polygons = shapes
    .map((s) => `<polygon points="${s.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}" fill="#000"/>`)
    .join("");
  const overlay = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${photo.width}" height="${photo.height}">${polygons}</svg>`
  );
  const jpeg = await sharp(photo.jpeg)
    .composite([{ input: overlay, left: 0, top: 0 }])
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();

  return { jpeg, width: photo.width, height: photo.height, platesFound: shapes.length };
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
