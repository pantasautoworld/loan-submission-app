import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { unlockPdf } from "./unlockPdf";

export interface Attachment {
  bytes: Buffer;
  /** File extension (no dot), e.g. "jpg", "png", "pdf" - used to decide how to embed it. */
  extension: string;
}

/** A4 at 72dpi, matching the ELK packet's page size closely enough for attachments. */
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;

/**
 * Phone photos often carry an EXIF orientation tag ("rotate 90°/180°/270° before
 * displaying") rather than storing pixels upright - pdf-lib embeds raw pixel data
 * and ignores that tag entirely, so an upright-looking photo can come out sideways
 * or upside-down ("terbalik") in the generated PDF. sharp's rotate() with no args
 * auto-rotates based on the EXIF tag and bakes it into the pixels, then strips the
 * tag so there's nothing left to be misread later.
 */
async function normalizeOrientation(bytes: Buffer, ext: "png" | "jpg"): Promise<Buffer> {
  try {
    const image = sharp(bytes).rotate();
    return ext === "png" ? await image.png().toBuffer() : await image.jpeg().toBuffer();
  } catch {
    return bytes; // fall back to the original bytes rather than failing the whole packet
  }
}

async function appendAttachment(target: PDFDocument, attachment: Attachment): Promise<void> {
  const ext = attachment.extension.toLowerCase();

  if (ext === "pdf") {
    // Some scanned/exported PDFs (EPF/KWSP statements especially) set restriction
    // flags (e.g. "no printing") without an actual open password - unlockPdf strips
    // that so the page content isn't garbled, and ignoreEncryption is a fallback for
    // whatever it couldn't strip (e.g. qpdf unavailable).
    const unlocked = await unlockPdf(attachment.bytes);
    const src = await PDFDocument.load(unlocked, { ignoreEncryption: true });
    const pages = await target.copyPages(src, src.getPageIndices());
    pages.forEach((p) => target.addPage(p));
    return;
  }

  const normalizedExt = ext === "png" ? "png" : "jpg";
  const normalizedBytes = await normalizeOrientation(attachment.bytes, normalizedExt);
  const image =
    normalizedExt === "png"
      ? await target.embedPng(normalizedBytes)
      : await target.embedJpg(normalizedBytes);

  const page = target.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const scale = Math.min((PAGE_WIDTH - 40) / image.width, (PAGE_HEIGHT - 40) / image.height, 1);
  const w = image.width * scale;
  const h = image.height * scale;
  page.drawImage(image, {
    x: (PAGE_WIDTH - w) / 2,
    y: (PAGE_HEIGHT - h) / 2,
    width: w,
    height: h,
  });
}

export async function mergePdfPacketWithAttachments(
  basePdfBytes: Buffer,
  attachments: Attachment[]
): Promise<Buffer> {
  const combined = await PDFDocument.load(basePdfBytes, { ignoreEncryption: true });
  for (const attachment of attachments) {
    await appendAttachment(combined, attachment);
  }
  const bytes = await combined.save();
  return Buffer.from(bytes);
}

/** Combines attachments into a standalone PDF with no base document - e.g. the income packet. */
export async function combineAttachments(attachments: Attachment[]): Promise<Buffer> {
  const combined = await PDFDocument.create();
  for (const attachment of attachments) {
    await appendAttachment(combined, attachment);
  }
  const bytes = await combined.save();
  return Buffer.from(bytes);
}
