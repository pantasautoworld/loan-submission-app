import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchStockBoardVehicles, findById, findByPlate, splitVehicleYearAndModel } from "@/lib/stockBoard";

/**
 * "HP Application - Autofill Link Generator" - the staff Excel that builds a pre-filled
 * Google Form link for the HP (hire purchase) application. The template keeps the form's
 * entry IDs and the link formulas; this fills the yellow "Value" cells (column B) from a submission.
 */
const TEMPLATE_PATH = "templates/hp-application-autofill.xlsx";

/** Selling price on the form = the finance amount plus this. */
const SELLING_PRICE_MARKUP = 5000;

/** The form's tenure dropdown only offers these - anything else is left blank for staff to pick. */
const TENURE_MONTHS = [12, 18, 24, 30, 36, 42, 48, 54, 60, 66, 72, 78, 84];

export interface HpPerson {
  name: string;
  nric: string;
  oldIc: string;
}

export interface HpAutofillInput {
  plate: string;
  year: number | null;
  make: string;
  model: string;
  /** Stock Board finance amount - the HP loan amount. */
  loanAmount: number | null;
  tenureYears: number | null;
  hirer: HpPerson | null;
  guarantor1: HpPerson | null;
  guarantor2: HpPerson | null;
  /** Hirer's EPF/KWSP number, else guarantor 1's. */
  epfNo: string;
  tnbAccountNo: string;
}

/** "WC4351L" -> "WC 4351L" (the form's example is "ABC 1234"). */
export function formatPlate(raw: string): string {
  const plate = (raw ?? "").replace(/\s+/g, "").toUpperCase();
  const match = plate.match(/^([A-Z]+)(\d.*)$/);
  return match ? `${match[1]} ${match[2]}` : plate;
}

/** "2019 PROTON SAGA STANDARD 1.3 AUTO" -> year 2019, make PROTON, model "SAGA STANDARD 1.3 AUTO". */
export function splitVehicle(vehicle: string): { year: number | null; make: string; model: string } {
  let { yearMade: year, model: rest } = splitVehicleYearAndModel(vehicle);
  if (year === null) {
    // year isn't first - take the first plausible 4-digit year wherever it sits
    const tokens = rest.split(/\s+/).filter(Boolean);
    const at = tokens.findIndex((t) => /^(19[89]\d|20\d{2})$/.test(t));
    if (at !== -1) {
      year = Number(tokens[at]);
      rest = tokens.filter((_, i) => i !== at).join(" ");
    }
  }
  const words = rest.split(/\s+/).filter(Boolean);
  return { year, make: words[0] ?? "", model: words.slice(1).join(" ") };
}

/** The form splits applications by the car's year of make. Years before 2011 aren't offered, so leave blank. */
export function yearModelChoice(year: number | null): string {
  if (year === null) return "";
  if (year >= 2016) return "Year Model 2016 & above";
  if (year >= 2011) return "Year Model 2011 to 2015";
  return "";
}

export function tenureChoice(years: number | null): string {
  if (years === null || !Number.isFinite(years) || years <= 0) return "";
  const months = Math.round(years * 12);
  return TENURE_MONTHS.includes(months) ? `${months} Months` : "";
}

/** 12 bare digits -> "000000-00-0000"; anything already formatted (or not a full NRIC) is kept as typed. */
export function formatNric(nric: string): string {
  const value = (nric ?? "").trim();
  const digits = value.replace(/\D/g, "");
  if (/^\d{12}$/.test(value)) return `${digits.slice(0, 6)}-${digits.slice(6, 8)}-${digits.slice(8)}`;
  return value;
}

export type CellValues = Record<string, string | number | null>;

/** Maps a submission's details onto the template's yellow Value cells. null = leave that question blank. */
export function buildHpAutofillValues(input: HpAutofillInput): CellValues {
  const na = (v: string) => v.trim() || "N/A";
  const hasLoan = input.loanAmount !== null && Number.isFinite(input.loanAmount);

  const values: CellValues = {
    B18: "New Applicant",
    B19: yearModelChoice(input.year) || null,
    B21: "New Application Form",
    B23: formatPlate(input.plate) || null,
    B24: input.make.trim() || null,
    B25: input.model.trim() || null,
    B26: input.year,
    B27: hasLoan ? (input.loanAmount as number) + SELLING_PRICE_MARKUP : null,
    B28: hasLoan ? input.loanAmount : null,
    B29: tenureChoice(input.tenureYears) || null,

    B31: input.hirer?.name.trim() || null,
    B32: input.hirer ? formatNric(input.hirer.nric) || null : null,
    B33: input.hirer ? na(input.hirer.oldIc) : null,
    B34: "N/A",
    B35: na(input.epfNo),
    B36: input.tnbAccountNo.trim() || null,

    B38: input.guarantor1?.name.trim() || null,
    B39: input.guarantor1 ? formatNric(input.guarantor1.nric) || null : null,
    B40: input.guarantor1 ? na(input.guarantor1.oldIc) : null,
    B41: "N/A",

    // Section IV is only filled when there really is a 2nd guarantor.
    B43: input.guarantor2?.name.trim() || null,
    B44: input.guarantor2 ? formatNric(input.guarantor2.nric) || null : null,
    B45: input.guarantor2 ? na(input.guarantor2.oldIc) : null,
    B46: input.guarantor2 ? "N/A" : null,
  };
  return values;
}

/** Same escaping as the template's own formulas: & -> %26, space -> %20, # -> %23. */
function escapeForLink(value: string): string {
  return value.replace(/&/g, "%26").replace(/ /g, "%20").replace(/#/g, "%23");
}

function plainText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "text" in value) return String(value.text ?? "");
  if (typeof value === "object") return "";
  return String(value);
}

/**
 * Fills the template and returns the .xlsx bytes. Excel recalculates the link formulas on open,
 * but the finished link is also stored as each formula's cached result so viewers that don't
 * recalculate (phone previews, Google Sheets imports) still show it.
 */
export async function buildHpAutofillWorkbook(values: CellValues): Promise<Buffer> {
  // templates/ is copied into the deploy image explicitly (see Dockerfile), so the file tracer
  // shouldn't try to bundle it.
  const templateBytes = await readFile(/* turbopackIgnore: true */ join(process.cwd(), TEMPLATE_PATH));
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(templateBytes as unknown as ArrayBuffer);
  const sheet = workbook.getWorksheet("Autofill");
  if (!sheet) throw new Error("The HP autofill template is missing its Autofill sheet.");

  for (const [address, value] of Object.entries(values)) {
    sheet.getCell(address).value = value;
  }

  // Each E-cell formula appends "&<key>=<escaped value>" for its row (or "" when blank).
  let link = plainText(sheet.getCell("B2").value);
  let allParts = "";
  for (let row = 11; row <= 46; row++) {
    const cell = sheet.getCell(`E${row}`);
    const raw = cell.value;
    if (!raw || typeof raw !== "object" || !("formula" in raw) || !raw.formula) continue;
    const formula = raw.formula;
    const key = formula.match(/"&([^"=]+)="/)?.[1];
    const answer = plainText(sheet.getCell(`B${row}`).value);
    const part = key && answer !== "" ? `&${key}=${escapeForLink(answer)}` : "";
    cell.value = { formula, result: part };
    allParts += part;
  }
  link = `${link}?usp=pp_url${allParts}`;

  const linkCell = sheet.getCell("B4");
  const linkRaw = linkCell.value;
  if (linkRaw && typeof linkRaw === "object" && "formula" in linkRaw && linkRaw.formula) {
    linkCell.value = { formula: linkRaw.formula, result: link };
  }

  workbook.calcProperties.fullCalcOnLoad = true;
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function asNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(String(raw).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

interface PersonRow {
  role: string;
  name: string | null;
  nric: string | null;
  old_ic: string | null;
  epf_no: string | null;
  tnb_account_no: string | null;
}

/**
 * Gathers everything the form needs for one submission. Car details, finance amount and tenure come
 * from the matching Stock Board car (as staff expect); if it can't be found or read, the values saved
 * on the submission itself are used instead.
 */
export async function fetchHpAutofillInput(
  supabase: SupabaseClient,
  submissionId: string
): Promise<HpAutofillInput | null> {
  const { data: submission } = await supabase
    .from("submissions")
    .select("no_plate, model, year_made, finance_loan, tenure_year, stock_board_vehicle_id")
    .eq("id", submissionId)
    .maybeSingle();
  if (!submission) return null;

  const { data: personRows } = await supabase
    .from("persons")
    .select("role, name, nric, old_ic, epf_no, tnb_account_no")
    .eq("submission_id", submissionId);
  const persons = (personRows ?? []) as PersonRow[];

  const toPerson = (row: PersonRow | undefined): HpPerson | null => {
    if (!row || (!(row.name ?? "").trim() && !(row.nric ?? "").trim())) return null;
    return { name: row.name ?? "", nric: row.nric ?? "", oldIc: row.old_ic ?? "" };
  };
  const hirerRow = persons.find((p) => p.role === "hirer");
  const guarantor1Row = persons.find((p) => p.role === "guarantor1");
  const guarantor2Row = persons.find((p) => p.role === "guarantor2");

  let stockCar;
  try {
    const cars = await fetchStockBoardVehicles();
    stockCar =
      (submission.stock_board_vehicle_id ? findById(submission.stock_board_vehicle_id, cars) : undefined) ??
      findByPlate(submission.no_plate ?? "", cars);
  } catch {
    stockCar = undefined;
  }

  const fromStock = stockCar ? splitVehicle(stockCar.vehicle) : null;
  const fromSubmission = splitVehicle(
    `${submission.year_made ?? ""} ${submission.model ?? ""}`.trim()
  );
  const car = fromStock && (fromStock.make || fromStock.model) ? fromStock : fromSubmission;

  return {
    plate: submission.no_plate ?? "",
    year: car.year ?? submission.year_made ?? null,
    make: car.make,
    model: car.model,
    loanAmount: asNumber(stockCar?.price) ?? asNumber(submission.finance_loan),
    tenureYears: asNumber(stockCar?.tahun) ?? asNumber(submission.tenure_year),
    hirer: toPerson(hirerRow),
    guarantor1: toPerson(guarantor1Row),
    guarantor2: toPerson(guarantor2Row),
    epfNo: (hirerRow?.epf_no ?? "").trim() || (guarantor1Row?.epf_no ?? "").trim(),
    tnbAccountNo: hirerRow?.tnb_account_no ?? "",
  };
}
