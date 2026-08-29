// Read-write client for the existing "Stock Board" tool (ryansum.com/stock-board.html),
// which is the real, actively-maintained vehicle inventory - Firebase Realtime Database,
// not Supabase. This avoids staff double-entering cars in two systems: the loan app's
// Vehicle step looks a plate up here instead of maintaining its own duplicate list, and
// flips a car from "available" to "prep" (the Stock Board's own status value, which its
// UI already labels "Loan Submission" - see STATUS_LABEL in its script) once a packet is
// actually generated. Deliberately reusing their existing status rather than inventing a
// new one: a value containing a space would break their `class="tag ${status}"` render.
//
// The /stock-board page in this app is a second front end onto the exact same Firebase
// data (board-data.stockList/activityLog, plus one photo:{id} key per car) - every read
// and write here uses the same paths and record shape as the standalone tool's own script,
// so cars added/edited from either place show up identically in both.
import { malaysiaTodayIso } from "@/lib/timezone";

const FIREBASE_DB_URL =
  "https://pantas-stock-board-default-rtdb.asia-southeast1.firebasedatabase.app";
const FB_ROOT = "stockboard";
const STOCK_LIST_PATH = `${FB_ROOT}/board-data/stockList`;
const ACTIVITY_LOG_PATH = `${FB_ROOT}/board-data/activityLog`;

export interface StockBoardVehicle {
  id: string;
  vin: string; // actually holds the plate number, e.g. "WWT7595"
  vehicle: string; // e.g. "2012 PERODUA ALZA 1.5 EZI AUTO"
  price: string; // finance loan amount
  tahun: string; // tenure in years, e.g. "7"
  status: "available" | "reserved" | "sold" | "prep" | string;
  notes: string;
  cost: string;
  deposit: string;
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
  submittedBy?: string;
  submissionDate?: string;
  approvalDate?: string;
  soldDate?: string;
}

let cache: { at: number; vehicles: StockBoardVehicle[] } | null = null;
const CACHE_MS = 60_000;

export async function fetchStockBoardVehicles(): Promise<StockBoardVehicle[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.vehicles;

  const res = await fetch(`${FIREBASE_DB_URL}/${STOCK_LIST_PATH}.json`);
  if (!res.ok) throw new Error(`Stock Board fetch failed: ${res.status}`);
  const data: Record<string, Omit<StockBoardVehicle, "_key">> | null = await res.json();
  const vehicles = data
    ? Object.entries(data).map(([key, v]) => ({ ...v, _key: key }))
    : [];
  cache = { at: Date.now(), vehicles };
  return vehicles;
}

/** Bypasses the 60s cache - for the /stock-board page's own initial load and 8s poll, where staleness matters. */
export async function refreshStockBoardVehicles(): Promise<StockBoardVehicle[]> {
  cache = null;
  return fetchStockBoardVehicles();
}

export async function fetchActivityLog(): Promise<ActivityLogEntry[]> {
  const res = await fetch(`${FIREBASE_DB_URL}/${ACTIVITY_LOG_PATH}.json`);
  if (!res.ok) throw new Error(`Stock Board activity log fetch failed: ${res.status}`);
  const data: ActivityLogEntry[] | null = await res.json();
  return data ?? [];
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

/**
 * Flips a car's status on the Stock Board once a loan packet is actually
 * generated for it. Re-checks the live status first (rather than trusting a
 * cached read) so two staff generating around the same time get a clear
 * warning instead of silently clobbering each other.
 */
export async function markLoanSubmitted(
  vehicleKey: string,
  updatedBy: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const statusRes = await fetch(`${FIREBASE_DB_URL}/${STOCK_LIST_PATH}/${vehicleKey}/status.json`);
  if (!statusRes.ok) return { ok: false, reason: "Could not reach the Stock Board" };
  const liveStatus = await statusRes.json();

  if (liveStatus !== "available") {
    return { ok: false, reason: `Car is already marked "${liveStatus}" on the Stock Board` };
  }

  const patchRes = await fetch(`${FIREBASE_DB_URL}/${STOCK_LIST_PATH}/${vehicleKey}.json`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status: "prep",
      updatedAt: new Date().toISOString(),
      updatedBy: updatedBy || "Loan Submission App",
    }),
  });
  if (!patchRes.ok) return { ok: false, reason: "Could not update the Stock Board" };

  cache = null; // invalidate so the next lookup reflects the new status
  return { ok: true };
}

const STATUSES_WITH_SUBMISSION = new Set(["prep", "reserved", "sold"]);

function generateVehicleId(): string {
  return `car_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function stripKey(v: StockBoardVehicle): Omit<StockBoardVehicle, "_key"> {
  const rest: Partial<StockBoardVehicle> = { ...v };
  delete rest._key;
  return rest as Omit<StockBoardVehicle, "_key">;
}

/** Writes the full stockList back and appends one activity entry - same shape as the standalone tool's saveBoardData(). */
async function writeBoardData(
  stockList: Omit<StockBoardVehicle, "_key">[],
  activityAction: string,
  actorName: string
): Promise<void> {
  const currentLog = await fetchActivityLog();
  const activityLog = [
    { who: actorName, action: activityAction, at: new Date().toISOString() },
    ...currentLog,
  ].slice(0, 40);

  const res = await fetch(`${FIREBASE_DB_URL}/${FB_ROOT}/board-data.json`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stockList, activityLog }),
  });
  if (!res.ok) throw new Error(`Stock Board save failed: ${res.status}`);
}

/**
 * Adds or updates a car. Submission/approval/sold history is preserved once
 * recorded even if the status later moves on - only overwritten when the
 * newly-saved status still calls for that field - mirroring saveCar() in
 * the standalone tool exactly so both write the identical record shape.
 */
export async function saveVehicle(
  input: SaveVehicleInput,
  editingId: string | null,
  actorName: string
): Promise<string> {
  const vehicles = await refreshStockBoardVehicles();
  const now = new Date().toISOString();

  let savedId: string;
  let nextList: Omit<StockBoardVehicle, "_key">[];
  let activityAction: string;

  if (editingId) {
    const idx = vehicles.findIndex((v) => v.id === editingId);
    if (idx === -1) throw new Error("This car no longer exists on the Stock Board.");
    const merged: Omit<StockBoardVehicle, "_key"> = {
      ...stripKey(vehicles[idx]),
      ...input,
      updatedBy: actorName,
      updatedAt: now,
    };
    if (STATUSES_WITH_SUBMISSION.has(input.status)) {
      merged.submittedBy = input.submittedBy;
      merged.submissionDate = input.submissionDate;
    }
    if (input.status === "reserved") merged.approvalDate = input.approvalDate;
    if (input.status === "sold") merged.soldDate = input.soldDate;
    nextList = vehicles.map((v, i) => (i === idx ? merged : stripKey(v)));
    savedId = editingId;
    activityAction = `updated ${input.vehicle}`;
  } else {
    savedId = generateVehicleId();
    const created: Omit<StockBoardVehicle, "_key"> = {
      ...input,
      id: savedId,
      addedBy: actorName,
      addedAt: now,
    };
    if (STATUSES_WITH_SUBMISSION.has(input.status)) {
      created.submittedBy = input.submittedBy;
      created.submissionDate = input.submissionDate;
    }
    if (input.status === "reserved") created.approvalDate = input.approvalDate;
    if (input.status === "sold") created.soldDate = input.soldDate;
    nextList = [...vehicles.map(stripKey), created];
    activityAction = `added ${input.vehicle}`;
  }

  await writeBoardData(nextList, activityAction, actorName);
  cache = null;
  return savedId;
}

export async function deleteVehicle(id: string, actorName: string): Promise<void> {
  const vehicles = await refreshStockBoardVehicles();
  const target = vehicles.find((v) => v.id === id);
  const nextList = vehicles.filter((v) => v.id !== id).map(stripKey);
  await writeBoardData(nextList, `deleted ${target?.vehicle ?? "a car"}`, actorName);
  await deletePhoto(id).catch(() => {});
  cache = null;
}

/**
 * Flips a car straight to "reserved" (Loan Approved) and stamps its notes
 * with the approval message - the Telegram webhook's counterpart to a staff
 * member doing the same edit by hand in the Stock Board UI. Refuses to touch
 * a car already marked "sold". submittedBy/submissionDate are carried over
 * unchanged (same "preserve history" rule saveVehicle already follows).
 */
export async function markLoanApproved(
  plateRaw: string,
  noteText: string,
  actorName: string
): Promise<{ ok: true; vehicle: StockBoardVehicle } | { ok: false; reason: string }> {
  const vehicles = await refreshStockBoardVehicles();
  const match = findByPlate(plateRaw, vehicles);
  if (!match) {
    return { ok: false, reason: `No car on the Stock Board matches plate "${plateRaw}".` };
  }
  if (match.status === "sold") {
    return { ok: false, reason: `${match.vehicle} (${match.vin}) is already marked Sold.` };
  }

  const now = new Date().toISOString();
  const merged: Omit<StockBoardVehicle, "_key"> = {
    ...stripKey(match),
    status: "reserved",
    notes: noteText,
    approvalDate: malaysiaTodayIso(),
    updatedBy: actorName,
    updatedAt: now,
  };
  const nextList = vehicles.map((v) => (v.id === match.id ? merged : stripKey(v)));
  await writeBoardData(nextList, `approved ${match.vehicle} via Telegram`, actorName);
  cache = null;
  return { ok: true, vehicle: { ...merged, _key: match._key } };
}

function photoUrl(id: string): string {
  return `${FIREBASE_DB_URL}/${FB_ROOT}/${encodeURIComponent("photo:" + id)}.json`;
}

export async function fetchPhoto(id: string): Promise<string | null> {
  const res = await fetch(photoUrl(id));
  if (!res.ok) throw new Error(`Stock Board photo fetch failed: ${res.status}`);
  return await res.json();
}

export async function setPhoto(id: string, dataUrl: string): Promise<void> {
  const res = await fetch(photoUrl(id), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dataUrl),
  });
  if (!res.ok) throw new Error(`Stock Board photo save failed: ${res.status}`);
}

export async function deletePhoto(id: string): Promise<void> {
  const res = await fetch(photoUrl(id), { method: "DELETE" });
  if (!res.ok) throw new Error(`Stock Board photo delete failed: ${res.status}`);
}
