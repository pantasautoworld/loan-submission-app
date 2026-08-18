import ExcelJS from "exceljs";
import { join } from "node:path";
import {
  CELL_WRITES,
  SIGNATURE_SLOTS,
  TEMPLATE_PATH,
  type SubmissionDocData,
  type SignerRole,
} from "@/lib/formTemplate";

/** Parses e.g. "C44" into 0-indexed {col, row}. */
function cellToIndex(address: string): { col: number; row: number } {
  const match = address.match(/^([A-Z]+)(\d+)$/)!;
  let col = 0;
  for (const ch of match[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { col: col - 1, row: parseInt(match[2], 10) - 1 };
}

/**
 * Inset a two-cell anchor range by `marginFraction` on each side, so an image
 * placed in it sits centered with breathing room instead of stretched edge-to-edge.
 */
function centeredAnchor(from: string, to: string, marginFraction = 0.02) {
  const start = cellToIndex(from);
  const end = cellToIndex(to);
  const colSpan = end.col + 1 - start.col;
  const rowSpan = end.row + 1 - start.row;
  const colInset = (colSpan * marginFraction) / 2;
  const rowInset = (rowSpan * marginFraction) / 2;
  return {
    tl: { col: start.col + colInset, row: start.row + rowInset },
    br: { col: end.col + 1 - colInset, row: end.row + 1 - rowInset },
  };
}

export async function buildWorkbookBuffer(
  doc: SubmissionDocData,
  guarantor2Present: boolean,
  signatureImages: Partial<Record<SignerRole, Buffer>>
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  // templates/ is copied into the deploy image explicitly (see Dockerfile),
  // so we don't need/want Next's file tracer to bundle it into .next/standalone.
  await workbook.xlsx.readFile(/* turbopackIgnore: true */ join(process.cwd(), TEMPLATE_PATH));

  for (const write of CELL_WRITES) {
    const ws = workbook.getWorksheet(write.sheet);
    if (!ws) continue;
    ws.getCell(write.cell).value = write.value(doc);
  }

  // The "Adress ##" row (each section's second address line) has no explicit
  // height in the template, unlike the "House/Residence" row above it - match
  // it so a longer address split across both rows doesn't get vertically
  // clipped in the PDF.
  const pg1 = workbook.getWorksheet("ELK pg1");
  if (pg1) {
    for (const row of [21, 28, 36]) pg1.getRow(row).height = 30;
  }

  for (const [role, slots] of Object.entries(SIGNATURE_SLOTS) as [SignerRole, typeof SIGNATURE_SLOTS.hirer][]) {
    const buffer = signatureImages[role];
    if (!buffer) continue;
    // exceljs's bundled types predate Node's newer generic Buffer<TArrayBuffer>
    // signature, which TS treats as structurally incompatible even though the
    // runtime value is a plain Buffer - safe to cast through.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const imageId = workbook.addImage({ buffer: buffer as any, extension: "png" });
    for (const slot of slots) {
      const ws = workbook.getWorksheet(slot.sheet);
      if (!ws) continue;
      // exceljs's bundled types require the full internal Anchor shape (nativeCol,
      // nativeColOff, ...) for tl/br, but the runtime accepts plain {col, row}
      // numbers - safe to cast through, same as the buffer cast above.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ws.addImage(imageId, centeredAnchor(slot.anchor.from, slot.anchor.to) as any);
    }
  }

  if (!guarantor2Present) {
    const pg5 = workbook.getWorksheet("ELK pg5");
    if (pg5) workbook.removeWorksheet(pg5.id);
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
