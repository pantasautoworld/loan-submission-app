// Read-write client for the existing "Stock Board" tool (ryansum.com/stock-board.html),
// which is the real, actively-maintained vehicle inventory - Firebase Realtime Database,
// not Supabase. This avoids staff double-entering cars in two systems: the loan app's
// Vehicle step looks a plate up here instead of maintaining its own duplicate list, and
// flips a car from "available" to "prep" (the Stock Board's own status value, which its
// UI already labels "Loan Submission" - see STATUS_LABEL in its script) once a packet is
// actually generated. Deliberately reusing their existing status rather than inventing a
// new one: a value containing a space would break their `class="tag ${status}"` render.
const FIREBASE_DB_URL =
  "https://pantas-stock-board-default-rtdb.asia-southeast1.firebasedatabase.app";
const FB_PATH = "stockboard/board-data/stockList";

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
  /** Firebase's array key for this record (e.g. "5") - needed to write back to it. */
  _key: string;
}

let cache: { at: number; vehicles: StockBoardVehicle[] } | null = null;
const CACHE_MS = 60_000;

export async function fetchStockBoardVehicles(): Promise<StockBoardVehicle[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.vehicles;

  const res = await fetch(`${FIREBASE_DB_URL}/${FB_PATH}.json`);
  if (!res.ok) throw new Error(`Stock Board fetch failed: ${res.status}`);
  const data: Record<string, Omit<StockBoardVehicle, "_key">> | null = await res.json();
  const vehicles = data
    ? Object.entries(data).map(([key, v]) => ({ ...v, _key: key }))
    : [];
  cache = { at: Date.now(), vehicles };
  return vehicles;
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
  const statusRes = await fetch(`${FIREBASE_DB_URL}/${FB_PATH}/${vehicleKey}/status.json`);
  if (!statusRes.ok) return { ok: false, reason: "Could not reach the Stock Board" };
  const liveStatus = await statusRes.json();

  if (liveStatus !== "available") {
    return { ok: false, reason: `Car is already marked "${liveStatus}" on the Stock Board` };
  }

  const patchRes = await fetch(`${FIREBASE_DB_URL}/${FB_PATH}/${vehicleKey}.json`, {
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
