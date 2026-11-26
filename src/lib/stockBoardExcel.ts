import ExcelJS from "exceljs";
import { STOCK_BOARDS, type StockBoardId, type StockBoardVehicle } from "@/lib/stockBoardShared";

const STATUS_LABEL: Record<StockBoardId, Record<string, string>> = {
  main: { prep: "Loan Submission", available: "Available", reserved: "Loan Approved", sold: "Sold" },
  cash: { prep: "Loan Submission", available: "Available", reserved: "Booking Paid", sold: "Sold" },
};
/** Sheet order: unsold cars first, the way the board is worked. */
const STATUS_ORDER: Record<string, number> = { available: 0, prep: 1, reserved: 2, sold: 3 };

type Cell = string | number | Date | null;
interface Column {
  header: string;
  width: number;
  value: (v: StockBoardVehicle) => Cell;
  kind?: "money" | "date";
}

function money(raw: string | undefined): number | null {
  const n = Number((raw ?? "").replace(/[^0-9.]/g, ""));
  return (raw ?? "").trim() && Number.isFinite(n) ? n : null;
}

/** "2026-07-06" or a full ISO timestamp -> a Malaysia-time calendar date for Excel. */
function date(raw: string | undefined): Date | null {
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(`${raw}T00:00:00Z`);
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return null;
  const myt = new Date(t + 8 * 3600_000);
  return new Date(Date.UTC(myt.getUTCFullYear(), myt.getUTCMonth(), myt.getUTCDate()));
}

function columns(board: StockBoardId): Column[] {
  const status = STATUS_LABEL[board];
  const head: Column[] = [
    { header: "Plate", width: 13, value: (v) => (v.vin ?? "").trim().toUpperCase() },
    { header: "Car", width: 42, value: (v) => v.vehicle ?? "" },
    { header: "Company", width: 12, value: (v) => v.company ?? "" },
    { header: "Supplier", width: 13, value: (v) => v.supplier ?? "" },
    { header: "Status", width: 15, value: (v) => status[v.status] ?? v.status ?? "" },
  ];
  const tail: Column[] = [
    { header: "Sold date", width: 13, value: (v) => date(v.soldDate), kind: "date" },
    { header: "Notes", width: 36, value: (v) => v.notes ?? "" },
    { header: "Added by", width: 14, value: (v) => v.addedBy ?? "" },
    { header: "Added on", width: 13, value: (v) => date(v.addedAt), kind: "date" },
  ];
  if (board === "cash") {
    return [
      ...head,
      { header: "Cash Price (RM)", width: 16, value: (v) => money(v.price), kind: "money" },
      { header: "Booking paid date", width: 15, value: (v) => date(v.approvalDate), kind: "date" },
      ...tail,
    ];
  }
  return [
    ...head,
    { header: "ELK Loan (RM)", width: 15, value: (v) => money(v.price), kind: "money" },
    { header: "Monthly Installment (RM)", width: 15, value: (v) => money(v.cost), kind: "money" },
    { header: "Deposit (RM)", width: 13, value: (v) => money(v.deposit), kind: "money" },
    { header: "Tahun", width: 8, value: (v) => money(v.tahun) },
    { header: "Submitted by", width: 14, value: (v) => v.submittedBy ?? "" },
    { header: "Submission date", width: 14, value: (v) => date(v.submissionDate), kind: "date" },
    { header: "Loan approved date", width: 14, value: (v) => date(v.approvalDate), kind: "date" },
    ...tail,
  ];
}

function colLetter(n: number): string {
  let s = "";
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Every car on one stock board as an .xlsx: a header with counts, one row per car, money totals. */
export async function buildStockBoardXlsx(vehicles: StockBoardVehicle[], board: StockBoardId): Promise<Buffer> {
  const cols = columns(board);
  const cars = [...vehicles].sort(
    (a, b) =>
      (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) ||
      (a.company ?? "").localeCompare(b.company ?? "") ||
      (a.vehicle ?? "").localeCompare(b.vehicle ?? ""),
  );

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(board === "cash" ? "Stock (Cash)" : "Stock");
  const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10).split("-").reverse().join("/");
  sheet.addRow([`${STOCK_BOARDS[board].title} - ${today}`]).font = { bold: true, size: 13 };
  const counts = Object.entries(STATUS_LABEL[board])
    .filter(([key]) => board === "main" || key !== "prep")
    .map(([key, label]) => `${label}: ${cars.filter((v) => v.status === key).length}`);
  sheet.addRow([`${cars.length} cars  |  ${counts.join("  |  ")}`]).font = { color: { argb: "FF555555" } };

  const headRow = 3;
  const head = sheet.addRow(["No", ...cols.map((c) => c.header)]);
  head.font = { bold: true };
  head.alignment = { vertical: "middle", wrapText: true };
  head.height = 32;
  head.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
    cell.border = { bottom: { style: "thin" } };
  });

  cars.forEach((v, i) => sheet.addRow([i + 1, ...cols.map((c) => c.value(v))]));

  const first = headRow + 1;
  const last = headRow + cars.length;
  if (cars.length > 0) {
    const total = sheet.addRow(
      ["TOTAL", ...cols.map((c, i) => {
        if (c.kind !== "money") return "";
        const L = colLetter(i + 2);
        return { formula: `SUM(${L}${first}:${L}${last})`, result: cars.reduce((s, v) => s + ((c.value(v) as number | null) ?? 0), 0) };
      })],
    );
    total.font = { bold: true };
    total.eachCell((cell) => (cell.border = { top: { style: "thin" } }));
  }

  sheet.getColumn(1).width = 5;
  cols.forEach((c, i) => {
    const col = sheet.getColumn(i + 2);
    col.width = c.width;
    if (c.kind === "money") col.numFmt = "#,##0.00";
    if (c.kind === "date") col.numFmt = "dd/mm/yyyy";
  });
  sheet.views = [{ state: "frozen", ySplit: headRow }];
  sheet.autoFilter = { from: { row: headRow, column: 1 }, to: { row: headRow, column: cols.length + 1 } };
  sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
