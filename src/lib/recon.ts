import type { SupabaseClient } from "@supabase/supabase-js";

export const CONDITION_TYPES = [
  "Car Paint",
  "Interior Touch Up",
  "Engine Service",
  "Number Plate",
  "Missing Accessories",
  "Car Wash",
  "Windscreen",
  "Sandblasting",
  "Car Photo",
  "Original Geran",
] as const;
export type ConditionType = (typeof CONDITION_TYPES)[number];

export const RECON_LOCATIONS = [
  "Painter",
  "VH Workshop",
  "Seng Mah Workshop",
  "J1 Gearbox Workshop",
  "Infinity",
] as const;
export type ReconLocation = (typeof RECON_LOCATIONS)[number];

export type TaskKind = "condition" | "transport_to" | "transport_from";
export type TaskStatus = "pending" | "done";

export interface CarLocationRow {
  stock_board_vehicle_id: string;
  no_plate: string;
  vehicle: string;
  location: string;
  updated_by_name: string;
  updated_at: string;
}

export interface ReconTaskRow {
  id: string;
  stock_board_vehicle_id: string;
  no_plate: string;
  vehicle: string;
  task_kind: TaskKind;
  condition_type: string | null;
  location: string | null;
  status: TaskStatus;
  remark: string;
  runner_id: string | null;
  runner_name: string;
  due_date: string | null;
  sort_order: number;
  created_by_name: string;
  created_at: string;
  completed_by_name: string | null;
  completed_at: string | null;
}

export interface RunnerTimeLogRow {
  id: string;
  runner_id: string;
  runner_name: string;
  recon_task_id: string | null;
  label: string;
  log_date: string;
  start_time: string;
  end_time: string | null;
  created_at: string;
}

/** A photo or video a runner attached to a checklist item as evidence when something's wrong. */
export interface ReconMediaRow {
  id: string;
  recon_task_id: string;
  file_path: string;
  media_type: "photo" | "video";
  uploaded_by: string | null;
  uploaded_by_name: string;
  created_at: string;
}

export async function fetchConditionMedia(supabase: SupabaseClient): Promise<ReconMediaRow[]> {
  const { data, error } = await supabase
    .from("recon_task_media")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ReconMediaRow[];
}

export async function fetchCarLocations(supabase: SupabaseClient): Promise<CarLocationRow[]> {
  const { data, error } = await supabase.from("car_locations").select("*");
  if (error) throw new Error(error.message);
  return (data ?? []) as CarLocationRow[];
}

export async function fetchReconTasks(supabase: SupabaseClient): Promise<ReconTaskRow[]> {
  const { data, error } = await supabase
    .from("recon_tasks")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ReconTaskRow[];
}

export async function fetchReconTasksForRunner(
  supabase: SupabaseClient,
  runnerId: string
): Promise<ReconTaskRow[]> {
  const { data, error } = await supabase
    .from("recon_tasks")
    .select("*")
    .eq("runner_id", runnerId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ReconTaskRow[];
}

/** Every car's condition-checklist rows (any runner) - the checklist is shared per car, so a runner needs to see items others already marked. */
export async function fetchConditionItems(supabase: SupabaseClient): Promise<ReconTaskRow[]> {
  const { data, error } = await supabase.from("recon_tasks").select("*").eq("task_kind", "condition");
  if (error) throw new Error(error.message);
  return (data ?? []) as ReconTaskRow[];
}

export async function fetchRunnerTimeLogs(
  supabase: SupabaseClient,
  runnerId?: string
): Promise<RunnerTimeLogRow[]> {
  let query = supabase.from("runner_time_logs").select("*").order("start_time", { ascending: true });
  if (runnerId) query = query.eq("runner_id", runnerId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as RunnerTimeLogRow[];
}

/** Count of pending recon tasks per Stock Board vehicle id - used for the Stock Board badge. */
export async function fetchPendingTaskCountsByVehicle(
  supabase: SupabaseClient
): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("recon_tasks")
    .select("stock_board_vehicle_id")
    .eq("status", "pending");
  if (error) throw new Error(error.message);
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const id = row.stock_board_vehicle_id as string;
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

export async function fetchRunnerProfiles(
  supabase: SupabaseClient
): Promise<{ id: string; full_name: string }[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("role", "runner")
    .eq("is_active", true)
    .order("full_name");
  if (error) throw new Error(error.message);
  return data ?? [];
}
