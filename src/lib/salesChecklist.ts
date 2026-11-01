import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClaimInvoiceRow } from "@/lib/claimInvoices";
import { fetchCarDeposits } from "@/lib/depositPayments";
import { formatNric } from "@/lib/hpAutofill";
import { parseSigningNote } from "@/lib/signingNotes";
import { fetchStockBoardVehicles, findByPlate } from "@/lib/stockBoard";

/**
 * "Sales Checklist Form" - the staff Excel (A. Sales checklist, B. Invoice checklist) filled
 * from a claim invoice, its Stock Board car and its approved deposit payments. Everything the
 * app doesn't know (trade-in, fees, discount, approvals...) is left for staff to type.
 */
const TEMPLATE_PATH = "templates/sales-checklist.xlsx";
const SHEET_NAME = "Sales Checklist";

// Section B (Invoice checklist) layout in the template: 5 payment rows, then the totals block.
const PAYMENT_FIRST_ROW = 43;
const PAYMENT_TEMPLATE_ROWS = 5;
const TAIL_FIRST_ROW = 48; // "Total Received"
const TAIL_LAST_ROW = 51; // "A/c name"
const LAST_COL = 11;
const PRINT_ROWS_BELOW_TAIL = 13;

const PAYMENT_METHOD_LIST = '"Cash,Transfer,DuitNow,Credit Card"';

/** The Stock Board price runs this much above the website price, before the car's deposit is added back. */
const WEBSITE_PRICE_LESS = 3000;

export interface ChecklistPayment {
  /** YYYY-MM-DD */
  date: string;
  amount: number;
  /** Deposit Payment page method: Bank transfer / Cash / QR Scan / E-Wallet */
  method: string;
}

export interface SalesChecklistInput {
  staffPic: string;
  plate: string;
  vehicleName: string;
  /** "KIWI" / "PANTAS" as on the Stock Board, or "" */
  company: string;
  term: "Loan" | "Cash";
  customerName: string;
  /** Hirer's IC / NRIC from the loan submission, e.g. 961122-04-5489 */
  nric: string;
  phone: string;
  loanApproved: number;
  /** From the Stock Board loan note, null when not found */
  retention: number | null;
  /** Total of the approved deposit payments */
  deposit: number;
  /** The car's Deposit Required on the Stock Board, null when not set. Paid above this is the staff's mark-up. */
  depositRequired: number | null;
  /** Selling price on the claim invoice - the customer-side car price */
  sellingPrice: number;
  /** Original Price (Website): Stock Board Price - RM3,000 + the car's Deposit Required; null when the car has no price */
  originalPrice: number | null;
  /** Invoice date, YYYY-MM-DD */
  signingDate: string;
  payments: ChecklistPayment[];
}

/** The checklist's Payment Method dropdown only has Cash / Transfer / DuitNow / Credit Card. */
export function checklistPaymentMethod(method: string): string {
  switch (method) {
    case "Cash":
      return "Cash";
    case "Bank transfer":
      return "Transfer";
    case "QR Scan":
    case "E-Wallet":
      return "DuitNow";
    default:
      return "";
  }
}

export function checklistCompany(company: string): string {
  const c = company.trim().toUpperCase();
  if (c === "KIWI") return "Kiwi";
  if (c === "PANTAS") return "Pantas";
  return "";
}

export function checklistPaymentBy(term: "Loan" | "Cash"): string {
  return term === "Cash" ? "Cash" : "Loan Credit";
}

function dateCell(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`);
}

const DATE_FORMAT = "dd/mm/yyyy";

/**
 * Makes room for payments beyond the template's 5 rows: moves the totals block ("Total Received",
 * refund, bank details) down and turns the freed rows into more payment rows styled like row 47.
 */
function addPaymentRows(sheet: ExcelJS.Worksheet, extra: number) {
  for (let r = TAIL_FIRST_ROW; r <= TAIL_LAST_ROW; r++) sheet.unMergeCells(`D${r}:E${r}`);

  for (let r = TAIL_LAST_ROW; r >= TAIL_FIRST_ROW; r--) {
    const from = sheet.getRow(r);
    const to = sheet.getRow(r + extra);
    to.height = from.height;
    for (let c = 1; c <= LAST_COL; c++) {
      const target = to.getCell(c);
      target.value = from.getCell(c).value;
      target.style = from.getCell(c).style;
    }
  }

  const lastPaymentRow = PAYMENT_FIRST_ROW + PAYMENT_TEMPLATE_ROWS - 1;
  const model = sheet.getRow(lastPaymentRow);
  for (let i = 0; i < extra; i++) {
    const rowNo = TAIL_FIRST_ROW + i;
    const row = sheet.getRow(rowNo);
    row.height = model.height;
    for (let c = 1; c <= LAST_COL; c++) {
      const cell = row.getCell(c);
      cell.value = null;
      cell.style = model.getCell(c).style;
    }
    row.getCell(1).value = `${PAYMENT_TEMPLATE_ROWS + 1 + i}.`;
    sheet.mergeCells(`B${rowNo}:C${rowNo}`);
    sheet.mergeCells(`D${rowNo}:E${rowNo}`);
    sheet.mergeCells(`G${rowNo}:H${rowNo}`);
    sheet.getCell(`G${rowNo}`).dataValidation = { type: "list", allowBlank: true, formulae: [PAYMENT_METHOD_LIST] };
  }

  for (let r = TAIL_FIRST_ROW + extra; r <= TAIL_LAST_ROW + extra; r++) sheet.mergeCells(`D${r}:E${r}`);
}

/**
 * Car / customer boxes keep the template's font size: long text (a long name, e-mail or car
 * description) wraps onto a second line and the row grows to fit, instead of shrinking the font.
 */
function wrapHeaderCells(sheet: ExcelJS.Worksheet) {
  const boxes: [address: string, fromCol: string, toCol: string][] = [
    ["D3", "D", "E"],
    ["D4", "D", "E"],
    ["D5", "D", "E"],
    ["J3", "J", "K"],
    ["J4", "J", "K"],
    ["J5", "J", "K"],
  ];
  const linesByRow = new Map<number, number>();
  for (const [address, fromCol, toCol] of boxes) {
    const cell = sheet.getCell(address);
    const text = String(cell.value ?? "");
    cell.alignment = { ...cell.alignment, wrapText: true };
    const units = (sheet.getColumn(fromCol).width ?? 8.43) + (sheet.getColumn(toCol).width ?? 8.43);
    const usablePx = units * 7 - 5; // about 7px per width unit, less the cell's indent
    const pxPerChar = text === text.toUpperCase() ? 7.4 : 6.0; // Arial 10: capitals are wider
    const lines = Math.max(1, Math.ceil((text.length * pxPerChar) / usablePx));
    const row = Number(address.slice(1));
    linesByRow.set(row, Math.max(linesByRow.get(row) ?? 1, lines));
  }
  for (const [row, lines] of linesByRow) {
    if (lines > 1) sheet.getRow(row).height = lines * 12.75 + 2.25;
  }
}

/** Fills the template and returns the .xlsx bytes. */
export async function buildSalesChecklistWorkbook(input: SalesChecklistInput): Promise<Buffer> {
  // templates/ is copied into the deploy image explicitly (see Dockerfile), so the file tracer
  // shouldn't try to bundle it.
  const templateBytes = await readFile(/* turbopackIgnore: true */ join(process.cwd(), TEMPLATE_PATH));
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(templateBytes as unknown as ArrayBuffer);
  const sheet = workbook.getWorksheet(SHEET_NAME);
  if (!sheet) throw new Error("The sales checklist template is missing its Sales Checklist sheet.");

  // The template's own "how to use" sheet isn't part of the form staff print.
  for (const other of [...workbook.worksheets]) {
    if (other.id !== sheet.id) workbook.removeWorksheet(other.id);
  }

  const extra = Math.max(0, input.payments.length - PAYMENT_TEMPLATE_ROWS);
  if (extra > 0) {
    addPaymentRows(sheet, extra);
    const lastRow = TAIL_LAST_ROW + extra + PRINT_ROWS_BELOW_TAIL;
    sheet.pageSetup.printArea = `A1:K${Math.max(64, lastRow)}`;
  }
  const refundRow = 49 + extra;
  const totalRow = TAIL_FIRST_ROW + extra;

  // The checklist's "Stock from" list names other companies; ours are Kiwi / Pantas.
  sheet.getCell("D5").dataValidation = { type: "list", allowBlank: true, formulae: ['"Kiwi,Pantas"'] };

  // --- Section A: header and car / customer details
  sheet.getCell("J1").value = input.staffPic || null;
  sheet.getCell("D3").value = input.plate || null;
  sheet.getCell("D4").value = input.vehicleName || null;
  sheet.getCell("D5").value = checklistCompany(input.company) || null;
  sheet.getCell("D6").value = checklistPaymentBy(input.term);
  sheet.getCell("J3").value = input.customerName || null;
  sheet.getCell("H4").value = "IC / NRIC"; // the template's e-mail box is used for the customer's IC instead
  sheet.getCell("J4").value = input.nric || null;
  sheet.getCell("J5").value = input.phone || null;
  wrapHeaderCells(sheet);

  // --- 8. Pricing details (internal)
  const retention = input.retention ?? 0;
  const finalPrice = input.loanApproved + input.deposit; // + trade-in (staff) - excess refund (staff)
  const actualPrice = finalPrice - retention;
  sheet.getCell("D9").value = input.loanApproved;
  sheet.getCell("D10").value = input.retention;
  sheet.getCell("D11").value = input.deposit;
  sheet.getCell("D14").value = { formula: `D9+D11+D12-D${refundRow}`, result: finalPrice };
  sheet.getCell("D16").value = { formula: "D10", result: retention };
  sheet.getCell("D21").value = { formula: "D14-SUM(D16:D19)", result: actualPrice };
  sheet.getCell("D22").value = input.originalPrice;
  sheet.getCell("D23").value = {
    formula: 'IF(D22="","",D21-D22)',
    result: input.originalPrice === null ? "" : actualPrice - input.originalPrice,
  };

  // Staff marked up: whatever the customer paid above the car's Deposit Required (e.g. required
  // 1,000, paid 1,300 -> 300), split 30% staff / 70% company. Left blank when no requirement is set.
  if (input.depositRequired !== null) {
    const markUp = Math.max(0, input.deposit - input.depositRequired);
    const cents = (n: number) => Math.round(n * 100) / 100;
    sheet.getCell("D24").value = markUp;
    sheet.getCell("D25").value = { formula: "D24*0.3", result: cents(markUp * 0.3) };
    sheet.getCell("D26").value = { formula: "D24*0.7", result: cents(markUp * 0.7) };
  }

  // --- 9. Pricing details (customer)
  sheet.getCell("J9").value = input.sellingPrice;
  sheet.getCell("J13").value = { formula: "SUM(J9:J12)", result: input.sellingPrice };
  sheet.getCell("J15").value = { formula: "J13-J14", result: input.sellingPrice };
  const signing = dateCell(input.signingDate);
  sheet.getCell("J18").value = signing;
  if (signing) sheet.getCell("J18").numFmt = DATE_FORMAT;

  // --- B. Invoice checklist: approved deposit payments
  let received = 0;
  input.payments.forEach((payment, i) => {
    const row = PAYMENT_FIRST_ROW + i;
    const paid = dateCell(payment.date);
    sheet.getCell(`B${row}`).value = paid;
    if (paid) sheet.getCell(`B${row}`).numFmt = DATE_FORMAT;
    sheet.getCell(`D${row}`).value = payment.amount;
    sheet.getCell(`G${row}`).value = checklistPaymentMethod(payment.method) || null;
    received += payment.amount;
  });
  const lastPayment = PAYMENT_FIRST_ROW + Math.max(PAYMENT_TEMPLATE_ROWS, input.payments.length) - 1;
  sheet.getCell(`D${totalRow}`).value = { formula: `SUM(D${PAYMENT_FIRST_ROW}:D${lastPayment})`, result: received };

  workbook.calcProperties.fullCalcOnLoad = true;
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// ---------------------------------------------------------------------------------------------
// Gathering the data

const normalizeName = (s: string) => s.replace(/\s+/g, " ").trim().toUpperCase();
const normalizePlate = (s: string) => s.replace(/\s+/g, "").toUpperCase();

interface HirerRow {
  name: string | null;
  phone: string | null;
  nric: string | null;
  created_at: string;
  submissions: { no_plate: string | null } | { no_plate: string | null }[] | null;
}

/**
 * The buyer's phone and IC / NRIC come from the loan submission whose hirer has the same name as
 * the invoice's buyer. A submission for the same plate wins; otherwise the newest one - and each
 * field falls back to an older submission when the best match left it empty.
 */
async function findHirerContact(
  supabase: SupabaseClient,
  buyerName: string,
  plate: string
): Promise<{ phone: string; nric: string }> {
  const wanted = normalizeName(buyerName);
  const firstWord = wanted.split(" ")[0];
  if (!firstWord) return { phone: "", nric: "" };

  const { data } = await supabase
    .from("persons")
    .select("name, phone, nric, created_at, submissions(no_plate)")
    .eq("role", "hirer")
    .ilike("name", `%${firstWord.replace(/[\\%_]/g, "\\$&")}%`)
    .limit(500);

  const wantedPlate = normalizePlate(plate);
  const matches = ((data ?? []) as unknown as HirerRow[])
    .filter((row) => normalizeName(row.name ?? "") === wanted)
    .map((row) => {
      const submission = Array.isArray(row.submissions) ? row.submissions[0] : row.submissions;
      return { row, samePlate: normalizePlate(submission?.no_plate ?? "") === wantedPlate };
    })
    .sort((a, b) => Number(b.samePlate) - Number(a.samePlate) || b.row.created_at.localeCompare(a.row.created_at));

  return {
    phone: matches.map((m) => (m.row.phone ?? "").trim()).find(Boolean) ?? "",
    nric: formatNric(matches.map((m) => (m.row.nric ?? "").trim()).find(Boolean) ?? ""),
  };
}

function asNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(String(raw).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Everything the checklist needs for one claim invoice. */
export async function fetchSalesChecklistInput(
  supabase: SupabaseClient,
  invoice: ClaimInvoiceRow
): Promise<SalesChecklistInput> {
  let car;
  try {
    car = findByPlate(invoice.vehicle_no, await fetchStockBoardVehicles());
  } catch {
    car = undefined; // Stock Board unreachable: fill what the invoice itself knows
  }

  const plate = normalizePlate(invoice.vehicle_no);
  const deposits = await fetchCarDeposits(supabase);
  const payments = deposits
    .filter((d) => (car ? d.stock_board_vehicle_id === car.id : false) || normalizePlate(d.no_plate) === plate)
    .flatMap((d) => d.payments)
    .filter((p) => p.status === "approved") // pending, rejected and forfeited payments are not received money
    .sort((a, b) => (a.payment_date ?? "").localeCompare(b.payment_date ?? "") || a.uploaded_at.localeCompare(b.uploaded_at))
    .map((p) => ({ date: p.payment_date ?? p.uploaded_at, amount: Number(p.amount), method: p.method }));

  const contact = await findHirerContact(supabase, invoice.buyer_name, invoice.vehicle_no);
  const retention = asNumber(parseSigningNote(car?.notes, invoice.vehicle_no).retention);
  const stockPrice = asNumber(car?.price);
  const originalPrice = stockPrice === null ? null : stockPrice - WEBSITE_PRICE_LESS + (asNumber(car?.deposit) ?? 0);

  return {
    staffPic: car?.submittedBy || invoice.created_by_name || invoice.agent_name,
    plate: invoice.vehicle_no,
    vehicleName: car?.vehicle || invoice.model,
    company: car?.company ?? "",
    term: invoice.term,
    customerName: invoice.buyer_name,
    nric: contact.nric,
    phone: contact.phone,
    loanApproved: Number(invoice.loan_amount) || 0,
    retention,
    deposit: payments.reduce((sum, p) => sum + p.amount, 0),
    depositRequired: asNumber(car?.deposit),
    sellingPrice: Number(invoice.selling_price) || 0,
    originalPrice,
    signingDate: invoice.invoice_date,
    payments,
  };
}
