import ExcelJS from "exceljs";
import { join } from "node:path";
import type { ClaimInvoiceRow } from "@/lib/claimInvoices";

const TEMPLATE_PATH = "templates/claim-invoice.xlsx";
const SHEET_NAME = "IV 2606 009 (2)";

function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

/**
 * Fills the real KIWI AUTOWORLD invoice workbook (logo + chop/signature are
 * already embedded as images in the template, so they carry over untouched -
 * only the text cells below are overwritten) and returns it as a Buffer,
 * ready for convertXlsxToPdf.
 */
export async function buildInvoiceWorkbookBuffer(invoice: ClaimInvoiceRow): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  // templates/ is copied into the deploy image explicitly (see Dockerfile),
  // so we don't need/want Next's file tracer to bundle it into .next/standalone.
  await workbook.xlsx.readFile(/* turbopackIgnore: true */ join(process.cwd(), TEMPLATE_PATH));

  const ws = workbook.getWorksheet(SHEET_NAME);
  if (!ws) throw new Error(`Invoice template is missing its "${SHEET_NAME}" sheet.`);

  const buyerLines = [invoice.buyer_name, ...invoice.buyer_address.split(",").map((s) => s.trim()).filter(Boolean)];
  ws.getCell("B7").value = buyerLines.join("\n");

  ws.getCell("K7").value = invoice.invoice_no;
  ws.getCell("K8").value = fmtDate(invoice.invoice_date);
  ws.getCell("K9").value = invoice.agent_name;
  ws.getCell("K10").value = invoice.financier;
  ws.getCell("K11").value = invoice.term;

  // K16 (Selling Price) is a formula in the template (=K17+K18) - replaced with a
  // plain number so the total is always correct regardless of whether the PDF
  // converter recalculates formulas on load.
  ws.getCell("K16").value = invoice.selling_price;

  if (invoice.term === "Cash") {
    ws.getCell("C17").value = "";
    ws.getCell("K17").value = "";
  } else {
    ws.getCell("K17").value = invoice.loan_amount;
  }
  ws.getCell("K18").value = invoice.deposit_amount;

  ws.getCell("D21").value = invoice.vehicle_no;
  ws.getCell("D22").value = invoice.model;
  ws.getCell("D23").value = invoice.chassis_no;
  ws.getCell("D24").value = invoice.engine_no;

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
