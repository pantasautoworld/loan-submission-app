import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ClaimInvoiceRow } from "@/lib/claimInvoices";

const PAGE_WIDTH = 595; // A4 @ 72dpi
const PAGE_HEIGHT = 842;
const MARGIN = 50;

function fmtMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

export async function buildClaimInvoicePdf(invoice: ClaimInvoiceRow): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function line(x1: number, yPos: number, x2: number) {
    page.drawLine({ start: { x: x1, y: yPos }, end: { x: x2, y: yPos }, thickness: 1, color: rgb(0, 0, 0) });
  }

  // Company header
  page.drawText("KIWI AUTOWORLD", { x: MARGIN, y, size: 13, font: bold });
  page.drawText(" (202503131310) (TR0321822-H)", {
    x: MARGIN + bold.widthOfTextAtSize("KIWI AUTOWORLD", 13),
    y,
    size: 10,
    font,
  });
  y -= 15;
  page.drawText("LOT 21936, LOT I-2, Lorong Cinta Alam A, 43000 Kajang, Selangor", { x: MARGIN, y, size: 10, font });
  y -= 13;
  page.drawText("Phone: 016-2209393", { x: MARGIN, y, size: 10, font });
  y -= 13;
  page.drawText("E-mail: kiwiautoworld@gmail.com", { x: MARGIN, y, size: 10, font });
  y -= 16;
  line(MARGIN, y, PAGE_WIDTH - MARGIN);
  y -= 22;

  // Bill-to (left) / invoice meta (right)
  const rightX = MARGIN + 300;
  const topOfBlock = y;
  const buyerLines = invoice.buyer_name
    ? [invoice.buyer_name, ...invoice.buyer_address.split(",").map((s) => s.trim()).filter(Boolean)]
    : ["-"];
  for (const l of buyerLines) {
    page.drawText(l, { x: MARGIN, y, size: 10, font });
    y -= 13;
  }

  let ry = topOfBlock;
  const metaRows: [string, string][] = [
    ["SALES INVOICE", invoice.invoice_no],
    ["Date", fmtDate(invoice.invoice_date)],
    ["Agent", invoice.agent_name || "-"],
    ["Financier", invoice.financier || "-"],
    ["Term", invoice.term],
  ];
  for (const [label, value] of metaRows) {
    page.drawText(label, { x: rightX, y: ry, size: 10, font: label === "SALES INVOICE" ? bold : font });
    page.drawText(":", { x: rightX + 90, y: ry, size: 10, font });
    page.drawText(value, { x: rightX + 100, y: ry, size: 10, font: label === "SALES INVOICE" ? bold : font });
    ry -= 15;
  }

  y = Math.min(y, ry) - 20;
  line(MARGIN, y, PAGE_WIDTH - MARGIN);
  y -= 6;

  // Line-item table
  page.drawText("No", { x: MARGIN, y: y - 14, size: 10, font: bold });
  page.drawText("Description", { x: MARGIN + 35, y: y - 14, size: 10, font: bold });
  page.drawText("Amount", { x: PAGE_WIDTH - MARGIN - 60, y: y - 14, size: 10, font: bold });
  y -= 20;
  line(MARGIN, y, PAGE_WIDTH - MARGIN);
  y -= 18;

  const rows: [string, number][] = [["SELLING PRICE", invoice.selling_price]];
  if (invoice.term === "Loan") {
    rows.push([`HP LOAN - ${invoice.financier || "FINANCIER"}`, invoice.loan_amount]);
  }
  if (invoice.deposit_amount > 0) {
    rows.push(["DEPOSIT AMOUNT", invoice.deposit_amount]);
  }
  let rowNo = 1;
  for (const [desc, amount] of rows) {
    page.drawText(String(rowNo), { x: MARGIN, y, size: 10, font });
    page.drawText(desc, { x: MARGIN + 35, y, size: 10, font });
    const amountText = fmtMoney(amount);
    page.drawText(amountText, {
      x: PAGE_WIDTH - MARGIN - font.widthOfTextAtSize(amountText, 10),
      y,
      size: 10,
      font,
    });
    y -= 18;
    rowNo++;
  }
  y -= 20;

  // Vehicle details
  const vehicleRows: [string, string][] = [
    ["Vehicle No :", invoice.vehicle_no || "-"],
    ["Model :", invoice.model || "-"],
    ["Chassis No :", invoice.chassis_no || "-"],
    ["Engine No :", invoice.engine_no || "-"],
  ];
  for (const [label, value] of vehicleRows) {
    page.drawText(label, { x: MARGIN, y, size: 10, font });
    page.drawText(value, { x: MARGIN + 90, y, size: 10, font });
    y -= 15;
  }
  y -= 20;
  line(MARGIN, y, PAGE_WIDTH - MARGIN);
  y -= 22;

  // Notes
  page.drawText("Notes :", { x: MARGIN, y, size: 10, font });
  y -= 15;
  const notes = [
    "1. All cheques should be crossed and made payable to KIWI AUTOWORLD",
    "2. Bank Account : CIMB Bank Berhad",
    "   Account No. : 8606 151 922",
    "3. Goods sold are neither returnable nor refundable.",
  ];
  for (const n of notes) {
    page.drawText(n, { x: MARGIN, y, size: 9, font });
    y -= 13;
  }
  y -= 20;

  page.drawText("Issued By :", { x: MARGIN, y, size: 10, font });
  y -= 40;
  page.drawText("KIWI AUTOWORLD", { x: MARGIN, y, size: 11, font: bold });
  y -= 13;
  page.drawText("202503131310 (TR0321822-H)", { x: MARGIN, y, size: 8, font });

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
