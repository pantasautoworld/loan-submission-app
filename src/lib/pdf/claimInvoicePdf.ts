import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ClaimCompany, ClaimInvoiceRow } from "@/lib/claimInvoices";

const PAGE_WIDTH = 595; // A4 @ 72dpi
const PAGE_HEIGHT = 842;
const MARGIN = 50;

interface CompanyProfile {
  logoPath: string;
  logoWidth: number;
  chopPath: string;
  chopWidth: number;
  /** A handwritten signature drawn over the chop's blank area (optional) */
  signaturePath?: string;
  name: string;
  registration: string;
  address: string;
  phone: string;
  email: string;
  payee: string;
  bankName: string;
  bankAccountNo: string;
}

const COMPANY_PROFILES: Record<ClaimCompany, CompanyProfile> = {
  KIWI: {
    logoPath: "templates/kiwi-logo.png",
    logoWidth: 62,
    chopPath: "templates/kiwi-chop.jpg",
    chopWidth: 150,
    name: "KIWI AUTOWORLD",
    registration: " (202503131310) (TR0321822-H)",
    address: "LOT 21936, LOT I-2, Lorong Cinta Alam A, 43000 Kajang, Selangor",
    phone: "016-2209393",
    email: "kiwiautoworld@gmail.com",
    payee: "KIWI AUTOWORLD",
    bankName: "CIMB Bank Berhad",
    bankAccountNo: "8606 151 922",
  },
  PANTAS: {
    logoPath: "templates/pantas-logo.png",
    logoWidth: 92,
    chopPath: "templates/pantas-chop.jpg",
    chopWidth: 230,
    signaturePath: "templates/pantas-signature.png",
    name: "PANTAS AUTOWORLD SDN BHD",
    registration: " (1653858H / 202501052451)",
    address: "C-06-03 Streetmall @ One South, Jalan OS, Seksyen 6, Taman Serdang Perdana, 43300 Seri Kembangan, Selangor",
    phone: "016-2231988",
    email: "pantasautoworld@gmail.com",
    payee: "Pantas Autoworld Sdn Bhd",
    bankName: "RHB Bank Berhad",
    bankAccountNo: "2640 7600 039602",
  },
};

function fmtMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** Greedily wraps text to fit maxWidth, splitting on whitespace - used for the buyer
 * address, which often has no commas to split on and would otherwise run into the
 * invoice-meta column drawn to its right. */
function wrapText(text: string, maxWidth: number, font: PDFFont, size: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
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
  const company = COMPANY_PROFILES[invoice.company] ?? COMPANY_PROFILES.KIWI;

  // templates/ is copied into the deploy image explicitly (see Dockerfile),
  // so we don't need/want Next's file tracer to bundle it into .next/standalone.
  const logoBytes = await readFile(/* turbopackIgnore: true */ join(process.cwd(), company.logoPath));
  const chopBytes = await readFile(/* turbopackIgnore: true */ join(process.cwd(), company.chopPath));
  const logoImage = await pdf.embedPng(logoBytes);
  const chopImage = await pdf.embedJpg(chopBytes);
  const signatureImage = company.signaturePath
    ? await pdf.embedPng(await readFile(/* turbopackIgnore: true */ join(process.cwd(), company.signaturePath)))
    : null;

  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function line(x1: number, yPos: number, x2: number) {
    page.drawLine({ start: { x: x1, y: yPos }, end: { x: x2, y: yPos }, thickness: 1, color: rgb(0, 0, 0) });
  }

  // Logo (top-left) + company header text beside it
  const logoWidth = company.logoWidth;
  const logoHeight = (logoImage.height / logoImage.width) * logoWidth;
  page.drawImage(logoImage, { x: MARGIN, y: y - logoHeight, width: logoWidth, height: logoHeight });

  const textX = MARGIN + logoWidth + 12;
  let headerY = y;
  page.drawText(company.name, { x: textX, y: headerY, size: 13, font: bold });
  page.drawText(company.registration, {
    x: textX + bold.widthOfTextAtSize(company.name, 13),
    y: headerY,
    size: 10,
    font,
  });
  headerY -= 15;
  for (const addressLine of wrapText(company.address, PAGE_WIDTH - MARGIN - textX, font, 10)) {
    page.drawText(addressLine, { x: textX, y: headerY, size: 10, font });
    headerY -= 13;
  }
  page.drawText(`Phone: ${company.phone}`, { x: textX, y: headerY, size: 10, font });
  headerY -= 13;
  page.drawText(`E-mail: ${company.email}`, { x: textX, y: headerY, size: 10, font });

  y = Math.min(y - logoHeight, headerY) - 16;
  line(MARGIN, y, PAGE_WIDTH - MARGIN);
  y -= 22;

  // Bill-to (left) / invoice meta (right)
  const rightX = MARGIN + 300;
  const buyerColWidth = rightX - MARGIN - 20; // leave a gap before the invoice-meta column
  const topOfBlock = y;
  const buyerLines = invoice.buyer_name
    ? [invoice.buyer_name, ...invoice.buyer_address.split(",").map((s) => s.trim()).filter(Boolean)]
    : ["-"];
  for (const l of buyerLines) {
    for (const wrapped of wrapText(l, buyerColWidth, font, 10)) {
      page.drawText(wrapped, { x: MARGIN, y, size: 10, font });
      y -= 13;
    }
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
    `1. All cheques should be crossed and made payable to ${company.payee}`,
    `2. Bank Account : ${company.bankName}`,
    `   Account No. : ${company.bankAccountNo}`,
    "3. Goods sold are neither returnable nor refundable.",
  ];
  for (const n of notes) {
    page.drawText(n, { x: MARGIN, y, size: 9, font });
    y -= 13;
  }
  y -= 20;

  page.drawText("Issued By :", { x: MARGIN, y, size: 10, font });
  y -= 8;

  // Chop + signature stamp, replacing the old plain-text company sign-off
  const chopWidth = company.chopWidth;
  const chopHeight = (chopImage.height / chopImage.width) * chopWidth;
  page.drawImage(chopImage, { x: MARGIN, y: y - chopHeight, width: chopWidth, height: chopHeight });
  if (signatureImage) {
    // the signature sits in the chop's blank middle, just above its dotted bottom line
    const sigHeight = chopHeight * 0.6;
    const sigWidth = (signatureImage.width / signatureImage.height) * sigHeight;
    page.drawImage(signatureImage, {
      x: MARGIN + chopWidth * 0.17,
      y: y - chopHeight + chopHeight * 0.04,
      width: sigWidth,
      height: sigHeight,
    });
  }

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
