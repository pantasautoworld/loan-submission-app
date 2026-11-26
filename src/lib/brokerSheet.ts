// SERVER ONLY. Builds the stock list that outside brokers see, and checks their personal links.
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchStockBoardVehicles } from "@/lib/stockBoard";
import {
  BROKER_FIELDS,
  STOCK_STATUSES,
  type BrokerRow,
  type BrokerSheetColumn,
  type BrokerSheetData,
  type BrokerSheetSettings,
} from "@/lib/brokerSheetShared";

const STATUS_ORDER: Record<string, number> = { available: 0, prep: 1, reserved: 2, sold: 3 };

export async function loadBrokerSheetConfig(
  supabase: SupabaseClient
): Promise<{ settings: BrokerSheetSettings; columns: BrokerSheetColumn[] }> {
  const [settingsRes, columnsRes] = await Promise.all([
    supabase.from("broker_sheet_settings").select("title, statuses").eq("id", 1).maybeSingle(),
    supabase
      .from("broker_sheet_columns")
      .select("id, label, kind, field, position, visible, format")
      .order("position")
      .order("created_at"),
  ]);
  if (columnsRes.error) throw new Error(`Broker sheet columns: ${columnsRes.error.message}`);
  return {
    settings: settingsRes.data ?? { title: "Stock List", statuses: ["available", "prep", "reserved"] },
    columns: (columnsRes.data ?? []) as BrokerSheetColumn[],
  };
}

/** The broker view: cars in the chosen statuses, with only the visible columns, in order. */
export async function buildBrokerSheet(supabase: SupabaseClient): Promise<BrokerSheetData> {
  const { settings, columns } = await loadBrokerSheetConfig(supabase);
  const shown = columns.filter((c) => c.visible && (c.kind === "custom" || (c.field && BROKER_FIELDS[c.field])));
  const customIds = shown.filter((c) => c.kind === "custom").map((c) => c.id);

  const [vehicles, valuesRes] = await Promise.all([
    fetchStockBoardVehicles(),
    customIds.length
      ? supabase.from("broker_sheet_values").select("column_id, vehicle_id, value").in("column_id", customIds)
      : Promise.resolve({ data: [] as { column_id: string; vehicle_id: string; value: string }[], error: null }),
  ]);
  if (valuesRes.error) throw new Error(`Broker sheet values: ${valuesRes.error.message}`);
  const values = new Map((valuesRes.data ?? []).map((r) => [`${r.column_id}|${r.vehicle_id}`, r.value]));

  const statuses = new Set(settings.statuses.filter((s) => (STOCK_STATUSES as readonly string[]).includes(s)));
  const rows = vehicles
    .filter((v) => v && statuses.has(v.status) && (v.vin || v.vehicle))
    .sort(
      (a, b) =>
        (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) ||
        (a.vehicle ?? "").localeCompare(b.vehicle ?? "")
    )
    .map((v) =>
      shown.map((c) =>
        c.kind === "custom" ? values.get(`${c.id}|${v.id}`) ?? "" : BROKER_FIELDS[c.field!].get(v)
      )
    );

  return {
    title: settings.title || "Stock List",
    columns: shown.map((c) => ({
      label: c.label,
      numeric: c.kind === "field" ? !!BROKER_FIELDS[c.field!]?.numeric : c.format === "money",
      link: c.kind === "custom" && c.format === "link",
    })),
    rows,
    generatedAt: new Date().toISOString(),
  };
}

const LAST_SEEN_EVERY_MS = 5 * 60_000;

/** The active broker that owns this link key, or null (unknown or blocked). Also stamps last_seen_at. */
export async function findActiveBroker(admin: SupabaseClient, key: string): Promise<BrokerRow | null> {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(key)) return null;
  const { data } = await admin.from("brokers").select("*").eq("access_key", key).maybeSingle();
  const broker = data as BrokerRow | null;
  if (!broker || !broker.is_active) return null;

  const seen = broker.last_seen_at ? Date.parse(broker.last_seen_at) : 0;
  if (Date.now() - seen > LAST_SEEN_EVERY_MS) {
    await admin.from("brokers").update({ last_seen_at: new Date().toISOString() }).eq("id", broker.id);
  }
  return broker;
}

export function brokerSheetCsv(sheet: BrokerSheetData): string {
  const cell = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return [sheet.columns.map((c) => c.label), ...sheet.rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
