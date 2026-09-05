import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { MonthlyDepositSummary } from "@/lib/depositPayments";

const PAGE_WIDTH = 595; // A4 @ 72dpi, matching the rest of this app's PDFs
const PAGE_HEIGHT = 842;
const MARGIN = 40;
const ROW_HEIGHT = 15;

const COLUMNS = [
  { label: "Plate", x: MARGIN, width: 60 },
  { label: "Vehicle", x: MARGIN + 60, width: 115 },
  { label: "Amount", x: MARGIN + 175, width: 55 },
  { label: "Method", x: MARGIN + 230, width: 65 },
  { label: "Submitted by", x: MARGIN + 295, width: 90 },
  { label: "Approved by", x: MARGIN + 385, width: 90 },
  { label: "Date", x: MARGIN + 475, width: 55 },
];

function fmtMoney(n: number): string {
  return `RM${n.toLocaleString()}`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 2) + ".." : str;
}

export async function buildDepositSummaryPdf(
  monthLabel: string,
  summary: MonthlyDepositSummary
): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function drawTableHeader() {
    page.drawRectangle({
      x: MARGIN,
      y: y - 4,
      width: PAGE_WIDTH - MARGIN * 2,
      height: 16,
      color: rgb(0.91, 0.91, 0.91),
    });
    for (const col of COLUMNS) {
      page.drawText(col.label, { x: col.x + 3, y, size: 8, font: bold });
    }
    y -= 18;
  }

  function ensureSpace(needed: number) {
    if (y - needed < MARGIN) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
      drawTableHeader();
    }
  }

  // Title
  page.drawText("Pantas Autoworld - Deposit Payment Summary", { x: MARGIN, y, size: 15, font: bold });
  y -= 20;
  page.drawText(monthLabel, { x: MARGIN, y, size: 11, font, color: rgb(0.4, 0.4, 0.4) });
  y -= 28;

  // Stat cards
  const stats: [string, string][] = [
    ["Collected", fmtMoney(summary.total)],
    ["Approved payments", String(summary.rows.length)],
    ["Cars", String(summary.carCount)],
    ["Still pending", String(summary.pendingCount)],
  ];
  const statWidth = (PAGE_WIDTH - MARGIN * 2) / stats.length;
  stats.forEach(([label, value], i) => {
    const x = MARGIN + i * statWidth;
    page.drawText(value, { x, y, size: 13, font: bold });
    page.drawText(label, { x, y: y - 13, size: 8, font, color: rgb(0.4, 0.4, 0.4) });
  });
  y -= 40;

  // Payment-method breakdown
  if (summary.byMethod.length > 0) {
    const line = summary.byMethod.map(([method, amount]) => `${method}: ${fmtMoney(amount)}`).join("   |   ");
    page.drawText(`By method - ${line}`, { x: MARGIN, y, size: 9, font, color: rgb(0.3, 0.3, 0.3) });
    y -= 22;
  }

  drawTableHeader();

  if (summary.rows.length === 0) {
    page.drawText("No approved deposits in this month.", { x: MARGIN, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
    y -= ROW_HEIGHT;
  }

  for (const r of summary.rows) {
    ensureSpace(ROW_HEIGHT);
    const cells = [
      truncate(r.plate, 12),
      truncate(r.vehicle, 26),
      fmtMoney(r.amount),
      r.method || "-",
      truncate(r.uploadedBy, 18),
      truncate(r.approvedBy ?? "-", 18),
      fmtDate(r.paymentDate),
    ];
    cells.forEach((cell, i) => {
      page.drawText(cell, { x: COLUMNS[i].x + 3, y, size: 8, font });
    });
    y -= ROW_HEIGHT;
  }

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
