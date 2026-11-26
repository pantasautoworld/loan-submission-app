"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  BROKER_FIELDS,
  CUSTOM_FORMAT_LABEL,
  STOCK_STATUSES,
  normalizeCustomValue,
  type CustomColumnFormat,
} from "@/lib/brokerSheetShared";

type Result = { ok: true } | { ok: false; error: string };

const done = (error?: { message: string } | null): Result => {
  if (error) return { ok: false, error: error.message };
  revalidatePath("/broker-sheet");
  return { ok: true };
};

/** 32-character URL-safe secret for a broker's link. */
const newAccessKey = () => randomBytes(24).toString("base64url");

// ---------- Brokers ----------

export async function addBrokerAction(name: string, phone: string): Promise<Result> {
  const { supabase, profile } = await requireAdmin();
  if (!name.trim()) return { ok: false, error: "Enter the broker's name." };
  const { error } = await supabase.from("brokers").insert({
    name: name.trim(),
    phone: phone.trim(),
    access_key: newAccessKey(),
    created_by: profile.full_name ?? "",
  });
  return done(error);
}

export async function updateBrokerAction(id: string, name: string, phone: string): Promise<Result> {
  const { supabase } = await requireAdmin();
  if (!name.trim()) return { ok: false, error: "Name can't be empty." };
  const { error } = await supabase.from("brokers").update({ name: name.trim(), phone: phone.trim() }).eq("id", id);
  return done(error);
}

/** Block (link stops working at once) or unblock a broker. */
export async function setBrokerActiveAction(id: string, active: boolean): Promise<Result> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("brokers")
    .update({ is_active: active, blocked_at: active ? null : new Date().toISOString() })
    .eq("id", id);
  return done(error);
}

/** Issue a new link; the old one stops working at once (e.g. the broker shared it). */
export async function regenerateBrokerKeyAction(id: string): Promise<Result> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("brokers").update({ access_key: newAccessKey() }).eq("id", id);
  return done(error);
}

export async function deleteBrokerAction(id: string): Promise<Result> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("brokers").delete().eq("id", id);
  return done(error);
}

// ---------- Sheet setup ----------

export async function saveSheetSettingsAction(title: string, statuses: string[]): Promise<Result> {
  const { supabase } = await requireAdmin();
  const clean = statuses.filter((s) => (STOCK_STATUSES as readonly string[]).includes(s));
  if (clean.length === 0) return { ok: false, error: "Pick at least one status to show." };
  const { error } = await supabase
    .from("broker_sheet_settings")
    .update({ title: title.trim() || "Stock List", statuses: clean, updated_at: new Date().toISOString() })
    .eq("id", 1);
  return done(error);
}

export async function addColumnAction(
  kind: "field" | "custom",
  fieldOrLabel: string,
  format: CustomColumnFormat = "text"
): Promise<Result> {
  const { supabase } = await requireAdmin();
  const { data: last } = await supabase
    .from("broker_sheet_columns")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = (last?.position ?? 0) + 1;

  if (kind === "field") {
    const def = BROKER_FIELDS[fieldOrLabel];
    if (!def) return { ok: false, error: "Unknown Stock Board field." };
    const { error } = await supabase
      .from("broker_sheet_columns")
      .insert({ label: def.label, kind: "field", field: fieldOrLabel, position, visible: true });
    return done(error?.code === "23505" ? { message: "That field is already a column." } : error);
  }
  if (!fieldOrLabel.trim()) return { ok: false, error: "Enter a name for the new column." };
  if (!(format in CUSTOM_FORMAT_LABEL)) return { ok: false, error: "Unknown column type." };
  const { error } = await supabase
    .from("broker_sheet_columns")
    .insert({ label: fieldOrLabel.trim(), kind: "custom", field: null, position, visible: true, format });
  return done(error);
}

export async function updateColumnAction(
  id: string,
  patch: { label?: string; visible?: boolean; format?: CustomColumnFormat }
): Promise<Result> {
  const { supabase } = await requireAdmin();
  const update: { label?: string; visible?: boolean; format?: CustomColumnFormat } = {};
  if (patch.label !== undefined) {
    if (!patch.label.trim()) return { ok: false, error: "Column name can't be empty." };
    update.label = patch.label.trim();
  }
  if (patch.visible !== undefined) update.visible = patch.visible;
  if (patch.format !== undefined) {
    if (!(patch.format in CUSTOM_FORMAT_LABEL)) return { ok: false, error: "Unknown column type." };
    update.format = patch.format;
  }
  const { error } = await supabase.from("broker_sheet_columns").update(update).eq("id", id);
  return done(error);
}

/** Saves the column order: ids from left (first) to right. */
export async function reorderColumnsAction(ids: string[]): Promise<Result> {
  const { supabase } = await requireAdmin();
  const results = await Promise.all(
    ids.map((id, i) => supabase.from("broker_sheet_columns").update({ position: i + 1 }).eq("id", id))
  );
  return done(results.find((r) => r.error)?.error);
}

/** Removes a column (a custom column's values go with it). */
export async function deleteColumnAction(id: string): Promise<Result> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("broker_sheet_columns").delete().eq("id", id);
  return done(error);
}

export interface CellInput {
  columnId: string;
  vehicleId: string;
  value: string;
}

export type CellResult = CellInput & ({ ok: true } | { ok: false; error: string });

/**
 * Saves cells of your own columns (one typed cell, or a block pasted from Excel). Each value is
 * cleaned for its column type - "RM 3,500" becomes 3500, a link gets https:// - and an empty
 * value clears the cell. Returns every cell with its saved value or why it was rejected.
 */
export async function setCustomValuesAction(cells: CellInput[]): Promise<CellResult[]> {
  const { supabase, profile } = await requireAdmin();
  if (cells.length === 0) return [];
  if (cells.length > 2000) return cells.map((c) => ({ ...c, ok: false, error: "Too many cells at once." }));

  const { data: cols, error: colErr } = await supabase
    .from("broker_sheet_columns")
    .select("id, format")
    .eq("kind", "custom")
    .in("id", [...new Set(cells.map((c) => c.columnId))]);
  if (colErr) return cells.map((c) => ({ ...c, ok: false, error: colErr.message }));
  const formatOf = new Map((cols ?? []).map((c) => [c.id as string, c.format as CustomColumnFormat]));

  const results: CellResult[] = [];
  const upserts: { column_id: string; vehicle_id: string; value: string; updated_at: string; updated_by: string }[] = [];
  const clears: CellInput[] = [];
  const now = new Date().toISOString();
  for (const c of cells) {
    const format = formatOf.get(c.columnId);
    if (!format) {
      results.push({ ...c, ok: false, error: "That column no longer exists." });
      continue;
    }
    const cleaned = normalizeCustomValue(format, c.value);
    if (!cleaned.ok) {
      results.push({ ...c, ok: false, error: cleaned.error });
      continue;
    }
    const cell = { ...c, value: cleaned.value };
    if (cleaned.value) {
      upserts.push({ column_id: c.columnId, vehicle_id: c.vehicleId, value: cleaned.value, updated_at: now, updated_by: profile.full_name ?? "" });
    } else {
      clears.push(cell);
    }
    results.push({ ...cell, ok: true });
  }

  // cell key -> database error, for cells that passed checks but failed to save
  const dbErrors = new Map<string, string>();
  if (upserts.length) {
    const { error } = await supabase.from("broker_sheet_values").upsert(upserts);
    if (error) upserts.forEach((u) => dbErrors.set(`${u.column_id}|${u.vehicle_id}`, error.message));
  }
  for (const c of clears) {
    const { error } = await supabase
      .from("broker_sheet_values")
      .delete()
      .eq("column_id", c.columnId)
      .eq("vehicle_id", c.vehicleId);
    if (error) dbErrors.set(`${c.columnId}|${c.vehicleId}`, error.message);
  }
  // no revalidate: the inputs already show the new values
  return results.map((r) => {
    const err = dbErrors.get(`${r.columnId}|${r.vehicleId}`);
    return err ? { ...r, ok: false, error: err } : r;
  });
}
