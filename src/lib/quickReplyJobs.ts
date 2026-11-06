import type { SupabaseClient } from "@supabase/supabase-js";
import type { StockBoardVehicle } from "@/lib/stockBoard";

export type QuickReplyJobStatus = "queued" | "running" | "done" | "failed";

export interface QuickReplyJobRow {
  id: string;
  plate: string;
  shortcut: string;
  message: string;
  file_path: string;
  status: QuickReplyJobStatus;
  error: string | null;
  attempts: number;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

function numberOnly(raw: string): string {
  return (raw ?? "").replace(/[^0-9.]/g, "");
}

function money(raw: string): string {
  const n = numberOnly(raw);
  if (!n) return "";
  const value = Number(n);
  return Number.isFinite(value) ? value.toFixed(2) : n;
}

/**
 * The LuluChat quick reply for a car: shortcut "<year make model> - <plate>", and the finance
 * summary customers get. The Stock Board has no installment field of its own - its Cost column
 * holds the monthly installment on these cars.
 */
export function buildQuickReplyDraft(vehicle: StockBoardVehicle): { shortcut: string; message: string } {
  const plate = (vehicle.vin ?? "").trim().toUpperCase();
  const name = (vehicle.vehicle ?? "").trim();
  const deposit = numberOnly(vehicle.deposit);
  const tahun = numberOnly(vehicle.tahun);

  return {
    shortcut: [name, plate].filter(Boolean).join(" - "),
    message: [
      `Muka : RM${deposit} OTR`,
      `Bulanan : ${money(vehicle.cost)}`,
      `Tempoh : ${tahun} Tahun`,
    ].join("\n"),
  };
}

export async function fetchQuickReplyJobs(supabase: SupabaseClient, limit = 10): Promise<QuickReplyJobRow[]> {
  const { data, error } = await supabase
    .from("luluchat_quick_reply_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as QuickReplyJobRow[];
}
