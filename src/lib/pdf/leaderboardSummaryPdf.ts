import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { LeaderboardEntry, LeaderboardSubmissionDetail } from "@/lib/leaderboard";

const PAGE_WIDTH = 595; // A4 @ 72dpi
const PAGE_HEIGHT = 842;
const MARGIN = 40;
const ROW_HEIGHT = 15;

const DETAIL_COLUMNS = [
  { label: "Ticket No", x: MARGIN, width: 95 },
  { label: "Hirer", x: MARGIN + 95, width: 110 },
  { label: "Plate", x: MARGIN + 205, width: 65 },
  { label: "Model", x: MARGIN + 270, width: 130 },
  { label: "Staff", x: MARGIN + 400, width: 90 },
  { label: "Date", x: MARGIN + 490, width: 55 },
];

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 2) + ".." : str;
}

export async function buildLeaderboardSummaryPdf(
  monthLabel: string,
  leaderboard: LeaderboardEntry[],
  details: LeaderboardSubmissionDetail[]
): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function ensureSpace(needed: number, redrawHeader?: () => void) {
    if (y - needed < MARGIN) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
      redrawHeader?.();
    }
  }

  // Title
  page.drawText("Pantas Autoworld - Submission Leaderboard", { x: MARGIN, y, size: 15, font: bold });
  y -= 20;
  page.drawText(monthLabel, { x: MARGIN, y, size: 11, font, color: rgb(0.4, 0.4, 0.4) });
  y -= 28;

  // Ranking
  page.drawText("Ranking", { x: MARGIN, y, size: 11, font: bold });
  y -= 18;
  if (leaderboard.length === 0) {
    page.drawText("No cases submitted this month.", { x: MARGIN, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
    y -= ROW_HEIGHT;
  } else {
    leaderboard.forEach((entry, i) => {
      ensureSpace(ROW_HEIGHT);
      page.drawText(`${i + 1}.`, { x: MARGIN, y, size: 9, font: bold });
      page.drawText(truncate(entry.name, 30), { x: MARGIN + 22, y, size: 9, font });
      page.drawText(`${entry.count} case${entry.count === 1 ? "" : "s"}`, {
        x: MARGIN + 220,
        y,
        size: 9,
        font,
      });
      y -= ROW_HEIGHT;
    });
  }
  y -= 16;

  // Detail table - every submitted case that month, not just the top 10
  function drawDetailHeader() {
    page.drawRectangle({
      x: MARGIN,
      y: y - 4,
      width: PAGE_WIDTH - MARGIN * 2,
      height: 16,
      color: rgb(0.91, 0.91, 0.91),
    });
    for (const col of DETAIL_COLUMNS) {
      page.drawText(col.label, { x: col.x + 3, y, size: 8, font: bold });
    }
    y -= 18;
  }

  ensureSpace(40);
  page.drawText("All submissions this month", { x: MARGIN, y, size: 11, font: bold });
  y -= 18;
  drawDetailHeader();

  if (details.length === 0) {
    page.drawText("No cases submitted this month.", { x: MARGIN, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
    y -= ROW_HEIGHT;
  }

  for (const d of details) {
    ensureSpace(ROW_HEIGHT, drawDetailHeader);
    const cells = [
      d.ticketNo ?? "-",
      truncate(d.hirerName, 20),
      d.plate,
      truncate(d.model, 24),
      truncate(d.staffName, 16),
      fmtDate(d.submittedAt),
    ];
    cells.forEach((cell, i) => {
      page.drawText(cell, { x: DETAIL_COLUMNS[i].x + 3, y, size: 8, font });
    });
    y -= ROW_HEIGHT;
  }

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
