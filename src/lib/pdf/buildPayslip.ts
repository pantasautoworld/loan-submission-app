import ExcelJS from "exceljs";

export interface PayslipFillData {
  name: string;
  nric: string;
  companyName: string;
  companyRegistration: string;
  companyAddress: string;
}

const SEARCH_ROWS = 30;
const SEARCH_COLS = 15;

/** Finds the first cell in the sheet whose trimmed text exactly matches one of the given tokens. */
function findPlaceholderCell(
  ws: ExcelJS.Worksheet,
  tokens: string[]
): { row: number; col: number } | null {
  for (let r = 1; r <= SEARCH_ROWS; r++) {
    for (let c = 1; c <= SEARCH_COLS; c++) {
      const cell = ws.getRow(r).getCell(c);
      const text = (cell.value ? String(cell.value) : "").trim();
      if (tokens.includes(text)) return { row: r, col: c };
    }
  }
  return null;
}

/**
 * Sets a cell's value, redirecting to its merge's master cell if needed - ExcelJS
 * silently ignores writes to a non-master cell of a merged range rather than
 * erroring, which would otherwise make a write look like it worked but do nothing.
 */
function setCellValue(ws: ExcelJS.Worksheet, row: number, col: number, value: unknown): void {
  const cell = ws.getCell(row, col);
  const target = cell.isMerged ? (cell.master as ExcelJS.Cell) : cell;
  target.value = value as ExcelJS.CellValue;
}

/** Placeholder token -> the field it should be replaced with, per the standard staff template. */
const PLACEHOLDERS: { token: string; value: (d: PayslipFillData) => string }[] = [
  { token: "1A", value: (d) => d.companyName },
  { token: "2A", value: (d) => d.companyRegistration },
  { token: "3A", value: (d) => d.companyAddress },
  { token: "4A", value: (d) => d.name },
  { token: "5A", value: (d) => d.nric },
];

/**
 * Fills a staff-provided payslip template (one sheet per month, in tab order) with
 * the employee's name/NRIC and the employer's company details, keeping the
 * template's own earnings/deductions figures, month/year, and formatting untouched.
 *
 * Templates follow a fixed staff format: each sheet has literal placeholder tokens
 * ("1A" = company name, "2A" = company registration, "3A" = company address,
 * "4A" = hirer/guarantor name, "5A" = hirer/guarantor NRIC) sitting in otherwise
 * plain/merged cells, which this locates and overwrites with the real values. Month
 * and year are filled in by the admin per sheet when they prepare the template, so
 * this never touches them. Writes always resolve to the actual merge master cell
 * (setCellValue), so this still works regardless of how a template's ranges are
 * merged.
 */
export async function buildPayslipBuffer(
  templateBuffer: Buffer,
  data: PayslipFillData
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(templateBuffer as unknown as ArrayBuffer);

  for (const ws of workbook.worksheets) {
    for (const { token, value } of PLACEHOLDERS) {
      const cell = findPlaceholderCell(ws, [token]);
      if (cell) setCellValue(ws, cell.row, cell.col, value(data));
    }
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
