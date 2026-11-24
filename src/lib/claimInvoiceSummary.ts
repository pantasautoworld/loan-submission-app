import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClaimInvoiceRow } from "@/lib/claimInvoices";
import { fetchSalesChecklistInput, loadChecklistSharedData } from "@/lib/salesChecklist";

/**
 * One row per claim invoice for the "Summary" download (PDF and Excel).
 * Sales price = loan approved + rebate; rebate = the invoice's Deposit Amount (the discount);
 * booking fees = the car's approved deposit payments by online transfer only (cash is not counted).
 */
export interface InvoiceSummaryRow {
  deliveryDate: string; // YYYY-MM-DD
  plate: string;
  fullName: string;
  icNumber: string;
  salesPrice: number;
  rebate: number;
  loanApproved: number;
  retention: number | null;
  carCompany: string; // Pantas / Kiwi / ""
  elkPanel: string; // Pantas / Kiwi / ""
  bookingFees: number;
}

export interface SummaryRange {
  /** YYYY-MM-DD, inclusive; empty = no limit */
  from?: string;
  to?: string;
}

const titleCase = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : "");

export async function fetchInvoiceSummaryRows(
  supabase: SupabaseClient,
  invoices: ClaimInvoiceRow[],
  range: SummaryRange = {}
): Promise<InvoiceSummaryRow[]> {
  const inRange = invoices
    .filter((inv) => (!range.from || inv.invoice_date >= range.from) && (!range.to || inv.invoice_date <= range.to))
    .sort((a, b) => a.invoice_date.localeCompare(b.invoice_date) || a.created_at.localeCompare(b.created_at));

  const shared = await loadChecklistSharedData(supabase);
  const rows: InvoiceSummaryRow[] = [];
  const BATCH = 8;
  for (let i = 0; i < inRange.length; i += BATCH) {
    const batch = await Promise.all(
      inRange.slice(i, i + BATCH).map(async (inv) => {
        const input = await fetchSalesChecklistInput(supabase, inv, shared);
        const row: InvoiceSummaryRow = {
          deliveryDate: inv.invoice_date,
          plate: inv.vehicle_no,
          fullName: inv.buyer_name,
          icNumber: input.nric,
          salesPrice: input.loanApproved + input.invoiceDeposit,
          rebate: input.invoiceDeposit,
          loanApproved: input.loanApproved,
          retention: input.retention,
          carCompany: titleCase(input.company.trim()),
          elkPanel: titleCase(inv.company), // the invoice's company is the ELK panel it is claimed under
          bookingFees: input.deposit,
        };
        return row;
      })
    );
    rows.push(...batch);
  }
  return rows;
}

const HEADERS = [
  "Delivery date",
  "Car plate",
  "Full name",
  "IC number",
  "Sales price (RM)",
  "Rebate (RM)",
  "Loan approved (RM)",
  "Retention (RM)",
  "Car (Pantas/Kiwi)",
  "ELK panel (Pantas/Kiwi)",
  "Booking fees - online (RM)",
] as const;

function dateCell(iso: string): Date | string {
  return /^\d{4}-\d{2}-\d{2}/.test(iso) ? new Date(`${iso.slice(0, 10)}T00:00:00Z`) : iso;
}

function fmtDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[3])}/${Number(m[2])}/${m[1]}` : iso;
}

const fmtMoney = (n: number) => n.toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function rangeLabel(range: SummaryRange): string {
  if (range.from && range.to) return `${fmtDate(range.from)} to ${fmtDate(range.to)}`;
  if (range.from) return `from ${fmtDate(range.from)}`;
  if (range.to) return `up to ${fmtDate(range.to)}`;
  return "all invoices";
}

export async function buildInvoiceSummaryXlsx(rows: InvoiceSummaryRow[], range: SummaryRange): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Invoice Summary");
  sheet.addRow([`Claim invoice summary - ${rangeLabel(range)}`]).font = { bold: true, size: 13 };
  sheet.addRow([]);
  const head = sheet.addRow([...HEADERS]);
  head.font = { bold: true };
  head.alignment = { vertical: "middle", wrapText: true };
  head.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
    cell.border = { bottom: { style: "thin" } };
  });

  for (const r of rows) {
    sheet.addRow([
      dateCell(r.deliveryDate),
      r.plate,
      r.fullName,
      r.icNumber,
      r.salesPrice,
      r.rebate,
      r.loanApproved,
      r.retention,
      r.carCompany,
      r.elkPanel,
      r.bookingFees,
    ]);
  }

  const first = 4;
  const last = 3 + rows.length;
  if (rows.length > 0) {
    const total = sheet.addRow([
      "TOTAL",
      "",
      "",
      "",
      { formula: `SUM(E${first}:E${last})`, result: rows.reduce((s, r) => s + r.salesPrice, 0) },
      { formula: `SUM(F${first}:F${last})`, result: rows.reduce((s, r) => s + r.rebate, 0) },
      { formula: `SUM(G${first}:G${last})`, result: rows.reduce((s, r) => s + r.loanApproved, 0) },
      { formula: `SUM(H${first}:H${last})`, result: rows.reduce((s, r) => s + (r.retention ?? 0), 0) },
      "",
      "",
      { formula: `SUM(K${first}:K${last})`, result: rows.reduce((s, r) => s + r.bookingFees, 0) },
    ]);
    total.font = { bold: true };
    total.eachCell((cell) => (cell.border = { top: { style: "thin" } }));
  }

  const widths = [14, 12, 34, 16, 16, 13, 18, 15, 16, 20, 22];
  widths.forEach((w, i) => (sheet.getColumn(i + 1).width = w));
  sheet.getColumn(1).numFmt = "dd/mm/yyyy";
  for (const col of [5, 6, 7, 8, 11]) sheet.getColumn(col).numFmt = "#,##0.00";
  sheet.getCell("A1").numFmt = "General";
  sheet.getRow(3).height = 32;
  sheet.views = [{ state: "frozen", ySplit: 3 }];
  sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const PAGE_W = 842; // A4 landscape @ 72dpi
const PAGE_H = 595;
const MARGIN = 28;

function clip(text: string, width: number, font: PDFFont, size: number): string {
  if (font.widthOfTextAtSize(text, size) <= width) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, size) > width) t = t.slice(0, -1);
  return `${t}...`;
}

export async function buildInvoiceSummaryPdf(rows: InvoiceSummaryRow[], range: SummaryRange): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // [header (may be two lines), width, right-aligned]
  const cols: [string[], number, boolean][] = [
    [["Delivery", "date"], 54, false],
    [["Car plate"], 56, false],
    [["Full name"], 150, false],
    [["IC number"], 80, false],
    [["Sales price", "(RM)"], 62, true],
    [["Rebate", "(RM)"], 50, true],
    [["Loan approved", "(RM)"], 64, true],
    [["Retention", "(RM)"], 56, true],
    [["Car"], 44, false],
    [["ELK panel"], 48, false],
    [["Booking fees", "online (RM)"], 66, true],
  ];
  const tableW = cols.reduce((s, c) => s + c[1], 0);
  const x0 = Math.max(MARGIN, (PAGE_W - tableW) / 2);
  const SIZE = 8;
  const ROW_H = 16;

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;
  const title = `Claim invoice summary - ${rangeLabel(range)}`;

  function header() {
    page.drawText(title, { x: x0, y: y - 12, size: 13, font: bold });
    y -= 30;
    const top = y;
    let x = x0;
    for (const [lines, w, right] of cols) {
      lines.forEach((l, i) => {
        const tx = right ? x + w - 3 - bold.widthOfTextAtSize(l, SIZE) : x + 3;
        page.drawText(l, { x: tx, y: top - 10 - i * 10, size: SIZE, font: bold });
      });
      x += w;
    }
    y = top - 26;
    page.drawLine({ start: { x: x0, y }, end: { x: x0 + tableW, y }, thickness: 1, color: rgb(0, 0, 0) });
    y -= 4;
  }
  header();

  function drawRow(cells: string[], f: PDFFont, shade: boolean) {
    if (y - ROW_H < MARGIN + 14) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
      header();
    }
    if (shade) page.drawRectangle({ x: x0, y: y - ROW_H + 3, width: tableW, height: ROW_H, color: rgb(0.96, 0.96, 0.96) });
    let x = x0;
    cols.forEach(([, w, right], i) => {
      const text = clip(cells[i] ?? "", w - 6, f, SIZE);
      const tx = right ? x + w - 3 - f.widthOfTextAtSize(text, SIZE) : x + 3;
      page.drawText(text, { x: tx, y: y - ROW_H + 7, size: SIZE, font: f });
      x += w;
    });
    y -= ROW_H;
  }

  if (rows.length === 0) {
    page.drawText("No invoices in this range.", { x: x0, y: y - 14, size: 10, font });
  }
  rows.forEach((r, i) =>
    drawRow(
      [
        fmtDate(r.deliveryDate),
        r.plate,
        r.fullName,
        r.icNumber,
        fmtMoney(r.salesPrice),
        fmtMoney(r.rebate),
        fmtMoney(r.loanApproved),
        r.retention === null ? "-" : fmtMoney(r.retention),
        r.carCompany || "-",
        r.elkPanel || "-",
        fmtMoney(r.bookingFees),
      ],
      font,
      i % 2 === 1
    )
  );

  if (rows.length > 0) {
    page.drawLine({ start: { x: x0, y: y + 2 }, end: { x: x0 + tableW, y: y + 2 }, thickness: 1, color: rgb(0, 0, 0) });
    drawRow(
      [
        "TOTAL",
        "",
        `${rows.length} invoice${rows.length === 1 ? "" : "s"}`,
        "",
        fmtMoney(rows.reduce((s, r) => s + r.salesPrice, 0)),
        fmtMoney(rows.reduce((s, r) => s + r.rebate, 0)),
        fmtMoney(rows.reduce((s, r) => s + r.loanApproved, 0)),
        fmtMoney(rows.reduce((s, r) => s + (r.retention ?? 0), 0)),
        "",
        "",
        fmtMoney(rows.reduce((s, r) => s + r.bookingFees, 0)),
      ],
      bold,
      false
    );
  }

  return Buffer.from(await pdf.save());
}
