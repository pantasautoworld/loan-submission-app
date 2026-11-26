// Broker Sheet definitions that are safe in the browser (the admin page uses them too).
import { splitVehicleYearAndModel, type StockBoardVehicle } from "@/lib/stockBoardShared";

export const STOCK_STATUS_LABEL: Record<string, string> = {
  available: "Available",
  prep: "Loan Submission",
  reserved: "Loan Approved",
  sold: "Sold",
};
export const STOCK_STATUSES = ["available", "prep", "reserved", "sold"] as const;

export interface BrokerFieldDef {
  label: string;
  numeric: boolean;
  /** Shown on the admin page so nobody exposes internal data by accident. */
  internal?: boolean;
  get: (v: StockBoardVehicle) => string;
}

/** Plain number (no thousands separators) so Excel reads it as a number; blank if not set. */
function num(value: string | undefined): string {
  const s = String(value ?? "").replace(/,/g, "").trim();
  const n = Number(s);
  return s !== "" && Number.isFinite(n) ? String(n) : "";
}

/** Stock Board fields an admin can show to brokers. Keys are stored in broker_sheet_columns.field. */
export const BROKER_FIELDS: Record<string, BrokerFieldDef> = {
  plate: { label: "Car plate", numeric: false, get: (v) => (v.vin ?? "").toUpperCase().replace(/\s+/g, "") },
  year: {
    label: "Year",
    numeric: false,
    get: (v) => String(splitVehicleYearAndModel(v.vehicle).yearMade ?? ""),
  },
  model: { label: "Model", numeric: false, get: (v) => splitVehicleYearAndModel(v.vehicle).model },
  vehicle: { label: "Car (year + model)", numeric: false, get: (v) => (v.vehicle ?? "").trim() },
  status: { label: "Status", numeric: false, get: (v) => STOCK_STATUS_LABEL[v.status] ?? v.status ?? "" },
  price: { label: "ELK Loan Amount (RM)", numeric: true, get: (v) => num(v.price) },
  installment: { label: "Monthly Installment (RM)", numeric: true, get: (v) => num(v.cost) },
  deposit: { label: "Deposit Required (RM)", numeric: true, get: (v) => num(v.deposit) },
  tenure: { label: "Tenure (years)", numeric: true, get: (v) => num(v.tahun) },
  company: { label: "Company", numeric: false, internal: true, get: (v) => v.company ?? "" },
  supplier: { label: "Supplier", numeric: false, internal: true, get: (v) => v.supplier ?? "" },
  notes: { label: "Notes", numeric: false, internal: true, get: (v) => v.notes ?? "" },
};

export interface BrokerSheetColumn {
  id: string;
  label: string;
  kind: "field" | "custom";
  field: string | null;
  position: number;
  visible: boolean;
}

export interface BrokerSheetSettings {
  title: string;
  statuses: string[];
}

export interface BrokerRow {
  id: string;
  name: string;
  phone: string;
  access_key: string;
  is_active: boolean;
  created_at: string;
  created_by: string;
  blocked_at: string | null;
  last_seen_at: string | null;
}

/** What a broker sees: already filtered, ordered and formatted. */
export interface BrokerSheetData {
  title: string;
  columns: { label: string; numeric: boolean }[];
  rows: string[][];
  generatedAt: string;
}
