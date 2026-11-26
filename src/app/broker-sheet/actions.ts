"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { BROKER_FIELDS, STOCK_STATUSES } from "@/lib/brokerSheetShared";

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

export async function addColumnAction(kind: "field" | "custom", fieldOrLabel: string): Promise<Result> {
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
  const { error } = await supabase
    .from("broker_sheet_columns")
    .insert({ label: fieldOrLabel.trim(), kind: "custom", field: null, position, visible: true });
  return done(error);
}

export async function updateColumnAction(id: string, patch: { label?: string; visible?: boolean }): Promise<Result> {
  const { supabase } = await requireAdmin();
  const update: { label?: string; visible?: boolean } = {};
  if (patch.label !== undefined) {
    if (!patch.label.trim()) return { ok: false, error: "Column name can't be empty." };
    update.label = patch.label.trim();
  }
  if (patch.visible !== undefined) update.visible = patch.visible;
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

/** One cell of a custom column for one car; empty clears it. */
export async function setCustomValueAction(columnId: string, vehicleId: string, value: string): Promise<Result> {
  const { supabase, profile } = await requireAdmin();
  const v = value.trim();
  const { error } = v
    ? await supabase.from("broker_sheet_values").upsert({
        column_id: columnId,
        vehicle_id: vehicleId,
        value: v,
        updated_at: new Date().toISOString(),
        updated_by: profile.full_name ?? "",
      })
    : await supabase.from("broker_sheet_values").delete().eq("column_id", columnId).eq("vehicle_id", vehicleId);
  if (error) return { ok: false, error: error.message };
  return { ok: true }; // no revalidate: the input already shows the new value
}
