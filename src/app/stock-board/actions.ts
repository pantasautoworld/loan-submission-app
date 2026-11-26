"use server";

// The browser's only way to reach the Stock Board: Firebase is locked down and only the server
// holds its credentials, so every read/write from a page goes through these actions, which
// check the staff login first. Writes return { ok, error } so the real reason reaches the UI
// (thrown errors are masked in production). `board` picks the Stock Board ("main", the default)
// or Stock Board (Cash) ("cash"); anything else means the main board.
import { requireAdmin, requireSalesStaff, requireStaff } from "@/lib/auth";
import {
  deletePhoto,
  deleteVehicle,
  fetchPhoto,
  findById,
  markLoanSubmitted,
  refreshStockBoardVehicles,
  saveVehicle,
  setPhoto,
  type SaveVehicleInput,
  type StockBoardVehicle,
} from "@/lib/stockBoard";
import { asStockBoardId } from "@/lib/stockBoardShared";

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

function fail(err: unknown, fallback: string): { ok: false; error: string } {
  return { ok: false, error: err instanceof Error ? err.message : fallback };
}

export async function listStockBoardVehiclesAction(board?: string): Promise<StockBoardVehicle[]> {
  await requireStaff();
  return refreshStockBoardVehicles(asStockBoardId(board));
}

export async function fetchCarPhotoAction(id: string, board?: string): Promise<string | null> {
  await requireStaff();
  return fetchPhoto(id, asStockBoardId(board));
}

export async function saveCarAction(
  input: SaveVehicleInput,
  editingId: string | null,
  board?: string
): Promise<Result<string>> {
  const { profile } = await requireSalesStaff();
  try {
    return { ok: true, data: await saveVehicle(input, editingId, profile.full_name || "Staff", asStockBoardId(board)) };
  } catch (err) {
    return fail(err, "Could not save - try again.");
  }
}

export async function setCarPhotoAction(id: string, dataUrl: string, board?: string): Promise<Result> {
  await requireSalesStaff();
  if (!dataUrl.startsWith("data:image/")) return { ok: false, error: "That file is not an image." };
  try {
    await setPhoto(id, dataUrl, asStockBoardId(board));
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err, "Could not save the photo.");
  }
}

export async function deleteCarPhotoAction(id: string, board?: string): Promise<Result> {
  await requireSalesStaff();
  try {
    await deletePhoto(id, asStockBoardId(board));
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err, "Could not remove the photo.");
  }
}

export async function deleteCarAction(id: string, board?: string): Promise<Result> {
  const { profile } = await requireAdmin();
  try {
    await deleteVehicle(id, profile.full_name || "Admin", asStockBoardId(board));
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err, "Could not delete - try again.");
  }
}

/** Loan packet generated: flip the car from Available to Loan Submission (re-checks the live status first). */
export async function markCarLoanSubmittedAction(
  vehicleId: string,
  updatedBy: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  await requireSalesStaff();
  try {
    const vehicle = findById(vehicleId, await refreshStockBoardVehicles());
    if (!vehicle) return { ok: false, reason: "Car not found on the Stock Board" };
    return await markLoanSubmitted(vehicle._key, updatedBy);
  } catch {
    return { ok: false, reason: "Could not reach the Stock Board" };
  }
}
