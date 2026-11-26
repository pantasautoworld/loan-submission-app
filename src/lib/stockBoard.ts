// SERVER ONLY. Read-write client for the "Stock Board" vehicle inventory - a Firebase Realtime
// Database, not Supabase. The loan app's Vehicle step looks a plate up here instead of keeping
// its own duplicate list, and flips a car from "available" to "prep" (the Stock Board's own
// status value, labelled "Loan Submission" in the UI) once a packet is actually generated.
//
// The database is locked down (rules deny all public reads/writes), so every request carries
// the server's credentials: FIREBASE_SERVICE_ACCOUNT (the service-account JSON from Firebase
// console > Project settings > Service accounts > Generate new private key, pasted as-is or
// base64-encoded) or, as a fallback, FIREBASE_DB_SECRET (a legacy database secret). Browser
// code must go through the server actions in src/app/stock-board/actions.ts instead.
//
// The data shape (board-data.stockList/activityLog, plus one photo:{id} key per car) matches
// the original standalone Stock Board tool's script, so records stay compatible.
import { createSign } from "node:crypto";
import { malaysiaTodayIso } from "@/lib/timezone";
import {
  findByPlate,
  type ActivityLogEntry,
  type StockBoardId,
  type SaveVehicleInput,
  type StockBoardVehicle,
} from "@/lib/stockBoardShared";

export {
  COMPANY_OPTIONS,
  SUPPLIER_OPTIONS,
  findById,
  findByPlate,
  splitVehicleYearAndModel,
} from "@/lib/stockBoardShared";
export type { ActivityLogEntry, SaveVehicleInput, StockBoardId, StockBoardVehicle } from "@/lib/stockBoardShared";

const FIREBASE_DB_URL =
  "https://pantas-stock-board-default-rtdb.asia-southeast1.firebasedatabase.app";
/** Each board lives under its own root in the same database: nothing is shared between them. */
const FB_ROOT: Record<StockBoardId, string> = { main: "stockboard", cash: "stockboard_cash" };
const stockListPath = (board: StockBoardId) => `${FB_ROOT[board]}/board-data/stockList`;
const activityLogPath = (board: StockBoardId) => `${FB_ROOT[board]}/board-data/activityLog`;

// ---------- Firebase credentials ----------

let tokenCache: { token: string; expiresAt: number } | null = null;

function readServiceAccount(): { client_email: string; private_key: string; token_uri?: string } | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!raw) return null;
  const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  const parsed = JSON.parse(json);
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is missing client_email or private_key.");
  }
  return { ...parsed, private_key: String(parsed.private_key).replace(/\\n/g, "\n") };
}

/** OAuth2 access token for the service account (JWT bearer grant), cached until shortly before it expires. */
async function serviceAccountToken(sa: { client_email: string; private_key: string; token_uri?: string }): Promise<string> {
  if (tokenCache && tokenCache.expiresAt - 5 * 60_000 > Date.now()) return tokenCache.token;

  const tokenUri = sa.token_uri || "https://oauth2.googleapis.com/token";
  const now = Math.floor(Date.now() / 1000);
  const b64url = (s: string) => Buffer.from(s).toString("base64url");
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email",
      aud: tokenUri,
      iat: now,
      exp: now + 3600,
    })
  )}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64url");

  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
  });
  if (!res.ok) throw new Error(`Stock Board sign-in failed: ${res.status}`);
  const data: { access_token: string; expires_in: number } = await res.json();
  tokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

/** Full REST URL for a database path, with the server's credentials attached. */
async function fbUrl(path: string): Promise<string> {
  const url = `${FIREBASE_DB_URL}/${path}.json`;
  const sa = readServiceAccount();
  if (sa) return `${url}?access_token=${encodeURIComponent(await serviceAccountToken(sa))}`;
  const secret = process.env.FIREBASE_DB_SECRET?.trim();
  if (secret) return `${url}?auth=${encodeURIComponent(secret)}`;
  return url; // no credentials configured: only works while the database rules are still open
}

// ---------- Reads ----------

const cache: Partial<Record<StockBoardId, { at: number; vehicles: StockBoardVehicle[] }>> = {};
const CACHE_MS = 60_000;

export async function fetchStockBoardVehicles(board: StockBoardId = "main"): Promise<StockBoardVehicle[]> {
  const cached = cache[board];
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.vehicles;

  const res = await fetch(await fbUrl(stockListPath(board)), { cache: "no-store" });
  if (!res.ok) throw new Error(`Stock Board fetch failed: ${res.status}`);
  const data: Record<string, Omit<StockBoardVehicle, "_key">> | null = await res.json();
  const vehicles = data
    ? Object.entries(data).map(([key, v]) => ({ ...v, _key: key }))
    : [];
  cache[board] = { at: Date.now(), vehicles };
  return vehicles;
}

/** Bypasses the 60s cache - for the /stock-board page's own initial load and 8s poll, where staleness matters. */
export async function refreshStockBoardVehicles(board: StockBoardId = "main"): Promise<StockBoardVehicle[]> {
  delete cache[board];
  return fetchStockBoardVehicles(board);
}

export async function fetchActivityLog(board: StockBoardId = "main"): Promise<ActivityLogEntry[]> {
  const res = await fetch(await fbUrl(activityLogPath(board)), { cache: "no-store" });
  if (!res.ok) throw new Error(`Stock Board activity log fetch failed: ${res.status}`);
  const data: ActivityLogEntry[] | null = await res.json();
  return data ?? [];
}

// ---------- Writes ----------

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
  const statusRes = await fetch(await fbUrl(`${stockListPath("main")}/${vehicleKey}/status`), { cache: "no-store" });
  if (!statusRes.ok) return { ok: false, reason: "Could not reach the Stock Board" };
  const liveStatus = await statusRes.json();

  if (liveStatus !== "available") {
    return { ok: false, reason: `Car is already marked "${liveStatus}" on the Stock Board` };
  }

  const patchRes = await fetch(await fbUrl(`${stockListPath("main")}/${vehicleKey}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status: "prep",
      updatedAt: new Date().toISOString(),
      updatedBy: updatedBy || "Loan Submission App",
    }),
  });
  if (!patchRes.ok) return { ok: false, reason: "Could not update the Stock Board" };

  delete cache.main; // invalidate so the next lookup reflects the new status
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
  board: StockBoardId,
  stockList: Omit<StockBoardVehicle, "_key">[],
  activityAction: string,
  actorName: string
): Promise<void> {
  const currentLog = await fetchActivityLog(board);
  const activityLog = [
    { who: actorName, action: activityAction, at: new Date().toISOString() },
    ...currentLog,
  ].slice(0, 40);

  const res = await fetch(await fbUrl(`${FB_ROOT[board]}/board-data`), {
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
  actorName: string,
  board: StockBoardId = "main"
): Promise<string> {
  const vehicles = await refreshStockBoardVehicles(board);
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
    } else {
      // Back to Available: the car is no longer in a loan, so clear who/when it was submitted
      // rather than letting the previous submission's details linger on the record.
      delete merged.submittedBy;
      delete merged.submissionDate;
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

  await writeBoardData(board, nextList, activityAction, actorName);
  delete cache[board];
  return savedId;
}

export async function deleteVehicle(id: string, actorName: string, board: StockBoardId = "main"): Promise<void> {
  const vehicles = await refreshStockBoardVehicles(board);
  const target = vehicles.find((v) => v.id === id);
  const nextList = vehicles.filter((v) => v.id !== id).map(stripKey);
  await writeBoardData(board, nextList, `deleted ${target?.vehicle ?? "a car"}`, actorName);
  await deletePhoto(id, board).catch(() => {});
  delete cache[board];
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
  await writeBoardData("main", nextList, `approved ${match.vehicle} via Telegram`, actorName);
  delete cache.main;
  return { ok: true, vehicle: { ...merged, _key: match._key } };
}

// ---------- Photos ----------

function photoPath(id: string, board: StockBoardId): string {
  return `${FB_ROOT[board]}/${encodeURIComponent("photo:" + id)}`;
}

export async function fetchPhoto(id: string, board: StockBoardId = "main"): Promise<string | null> {
  const res = await fetch(await fbUrl(photoPath(id, board)), { cache: "no-store" });
  if (!res.ok) throw new Error(`Stock Board photo fetch failed: ${res.status}`);
  return await res.json();
}

export async function setPhoto(id: string, dataUrl: string, board: StockBoardId = "main"): Promise<void> {
  const res = await fetch(await fbUrl(photoPath(id, board)), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dataUrl),
  });
  if (!res.ok) throw new Error(`Stock Board photo save failed: ${res.status}`);
}

export async function deletePhoto(id: string, board: StockBoardId = "main"): Promise<void> {
  const res = await fetch(await fbUrl(photoPath(id, board)), { method: "DELETE" });
  if (!res.ok) throw new Error(`Stock Board photo delete failed: ${res.status}`);
}
