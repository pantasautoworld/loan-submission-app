// Stock Board types, option lists and pure helpers that are safe to use in the browser.
// Anything that talks to Firebase lives in src/lib/stockBoard.ts (server only), since the
// database is locked down and only the server holds its credentials.

export interface StockBoardVehicle {
  id: string;
  vin: string; // actually holds the plate number, e.g. "WWT7595"
  vehicle: string; // e.g. "2012 PERODUA ALZA 1.5 EZI AUTO"
  price: string; // ELK loan amount
  tahun: string; // tenure in years, e.g. "7"
  status: "available" | "reserved" | "sold" | "prep" | string;
  notes: string;
  cost: string; // shown in the UI as "Monthly Installment"
  deposit: string;
  /** Which of our companies owns this car - one of COMPANY_OPTIONS (KIWI / PANTAS). Shown next to the status tag. */
  company?: string;
  /** Where the car was sourced from - normally one of SUPPLIER_OPTIONS (CARSOME, GMART, ...). */
  supplier?: string;
  addedBy?: string;
  addedAt?: string;
  updatedBy?: string;
  updatedAt?: string;
  submittedBy?: string;
  submissionDate?: string;
  approvalDate?: string;
  soldDate?: string;
  /** Firebase's array key for this record (e.g. "5") - needed to write back to it. */
  _key: string;
}

/** The two companies that own stock. */
export const COMPANY_OPTIONS = ["KIWI", "PANTAS"] as const;

/** Where stock is sourced from. A car can still carry another supplier name (e.g. one-off ones) - the form keeps it as typed. */
export const SUPPLIER_OPTIONS = ["CARSOME", "GMART", "SPANCO", "MYTUKAR"] as const;

export interface ActivityLogEntry {
  who: string;
  action: string;
  at: string;
}

/** Fields the Add/Edit Car form collects - mirrors the standalone tool's own saveCar(). */
export interface SaveVehicleInput {
  vehicle: string;
  vin: string;
  price: string;
  cost: string;
  deposit: string;
  tahun: string;
  status: StockBoardVehicle["status"];
  notes: string;
  company: string;
  supplier: string;
  submittedBy?: string;
  submissionDate?: string;
  approvalDate?: string;
  soldDate?: string;
}

export function findByPlate(
  plate: string,
  vehicles: StockBoardVehicle[]
): StockBoardVehicle | undefined {
  const normalized = plate.trim().toUpperCase().replace(/\s+/g, "");
  return vehicles.find((v) => (v.vin ?? "").toUpperCase().replace(/\s+/g, "") === normalized);
}

export function findById(
  id: string,
  vehicles: StockBoardVehicle[]
): StockBoardVehicle | undefined {
  return vehicles.find((v) => v.id === id);
}

/**
 * The Stock Board's `vehicle` field leads with the model year, e.g.
 * "2015 NISSAN ALMERA VL 1.5 AT" - split that into Year Made and the
 * remaining model description.
 */
export function splitVehicleYearAndModel(vehicle: string): {
  yearMade: number | null;
  model: string;
} {
  const match = (vehicle ?? "").trim().match(/^(\d{4})\s+(.*)$/);
  if (!match) return { yearMade: null, model: (vehicle ?? "").trim() };
  return { yearMade: Number(match[1]), model: match[2] };
}
