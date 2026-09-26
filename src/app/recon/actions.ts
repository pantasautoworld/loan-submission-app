"use server";

import { revalidatePath } from "next/cache";
import { requireSalesStaff, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { TaskKind } from "@/lib/recon";

export async function setCarLocation(
  stockBoardVehicleId: string,
  noPlate: string,
  vehicle: string,
  location: string
) {
  const { profile, supabase } = await requireSalesStaff();
  const { error } = await supabase.from("car_locations").upsert(
    {
      stock_board_vehicle_id: stockBoardVehicleId,
      no_plate: noPlate,
      vehicle,
      location,
      updated_by_name: profile.full_name || "Staff",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stock_board_vehicle_id" }
  );
  if (error) throw new Error(error.message);
  revalidatePath("/recon");
  revalidatePath("/stock-board");
}

export async function createReconTask(formData: FormData) {
  const { profile, supabase } = await requireStaff();

  const stockBoardVehicleId = String(formData.get("stockBoardVehicleId") ?? "").trim();
  const noPlate = String(formData.get("noPlate") ?? "").trim();
  const vehicle = String(formData.get("vehicle") ?? "").trim();
  const taskKind = String(formData.get("taskKind") ?? "") as TaskKind;
  const conditionType = String(formData.get("conditionType") ?? "").trim() || null;
  const location = String(formData.get("location") ?? "").trim() || null;
  const dueDate = String(formData.get("dueDate") ?? "").trim() || null;
  const remark = String(formData.get("remark") ?? "").trim();

  if (!stockBoardVehicleId || !noPlate) throw new Error("Pick a car.");
  if (!["condition", "transport_to", "transport_from"].includes(taskKind)) {
    throw new Error("Pick a task type.");
  }
  if (taskKind === "condition" && !conditionType) throw new Error("Pick a condition type.");
  if (taskKind !== "condition" && !location) throw new Error("Pick a location.");

  let runnerId: string | null;
  let runnerName: string;
  if (profile.role === "runner") {
    runnerId = profile.id;
    runnerName = profile.full_name || "Runner";
  } else {
    runnerId = String(formData.get("runnerId") ?? "").trim() || null;
    runnerName = String(formData.get("runnerName") ?? "").trim();
  }

  const { error } = await supabase.from("recon_tasks").insert({
    stock_board_vehicle_id: stockBoardVehicleId,
    no_plate: noPlate,
    vehicle,
    task_kind: taskKind,
    condition_type: conditionType,
    location,
    remark,
    runner_id: runnerId,
    runner_name: runnerName,
    due_date: dueDate,
    created_by_name: profile.full_name || "Staff",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/recon");
  revalidatePath("/stock-board");
}

async function assertOwnsTask(
  supabase: Awaited<ReturnType<typeof createClient>>,
  taskId: string,
  profile: { id: string; role: string }
) {
  if (profile.role !== "runner") return;
  const { data } = await supabase
    .from("recon_tasks")
    .select("runner_id")
    .eq("id", taskId)
    .maybeSingle();
  if (!data || data.runner_id !== profile.id) {
    throw new Error("You can only update your own tasks.");
  }
}

export async function updateReconTaskStatus(taskId: string, status: "pending" | "done") {
  const { profile, supabase } = await requireStaff();
  await assertOwnsTask(supabase, taskId, profile);

  const { error } = await supabase
    .from("recon_tasks")
    .update(
      status === "done"
        ? { status, completed_by_name: profile.full_name || "Staff", completed_at: new Date().toISOString() }
        : { status, completed_by_name: null, completed_at: null }
    )
    .eq("id", taskId);
  if (error) throw new Error(error.message);
  revalidatePath("/recon");
  revalidatePath("/stock-board");
}

export async function updateReconTaskRemark(taskId: string, remark: string) {
  const { profile, supabase } = await requireStaff();
  await assertOwnsTask(supabase, taskId, profile);

  const { error } = await supabase.from("recon_tasks").update({ remark }).eq("id", taskId);
  if (error) throw new Error(error.message);
  revalidatePath("/recon");
}

/** The drag-and-drop endpoint - admin/sales can move a task to any runner/day; a runner can only reschedule their own task within their own list (runnerId/runnerName are ignored for them). */
export async function reassignReconTask(
  taskId: string,
  fields: { runnerId: string | null; runnerName: string; dueDate: string | null; sortOrder: number }
) {
  const { profile, supabase } = await requireStaff();

  if (profile.role === "runner") {
    await assertOwnsTask(supabase, taskId, profile);
    const { error } = await supabase
      .from("recon_tasks")
      .update({ due_date: fields.dueDate, sort_order: fields.sortOrder })
      .eq("id", taskId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("recon_tasks")
      .update({
        runner_id: fields.runnerId,
        runner_name: fields.runnerName,
        due_date: fields.dueDate,
        sort_order: fields.sortOrder,
      })
      .eq("id", taskId);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/recon");
}

export async function deleteReconTask(taskId: string) {
  const { supabase } = await requireSalesStaff();
  const { error } = await supabase.from("recon_tasks").delete().eq("id", taskId);
  if (error) throw new Error(error.message);
  revalidatePath("/recon");
  revalidatePath("/stock-board");
}

/** Starts a time-log entry for the current runner, auto-stopping any still-open entry first so blocks never overlap. Pass reconTaskId=null and a label (e.g. "Break") for a non-task entry. */
export async function startTimeLog(reconTaskId: string | null, label: string) {
  const { profile, supabase } = await requireStaff();
  if (profile.role !== "runner") throw new Error("Only runners log time.");

  const now = new Date().toISOString();
  const { data: open } = await supabase
    .from("runner_time_logs")
    .select("id")
    .eq("runner_id", profile.id)
    .is("end_time", null);
  if (open && open.length > 0) {
    await supabase
      .from("runner_time_logs")
      .update({ end_time: now })
      .in(
        "id",
        open.map((r) => r.id)
      );
  }

  const { error } = await supabase.from("runner_time_logs").insert({
    runner_id: profile.id,
    runner_name: profile.full_name || "Runner",
    recon_task_id: reconTaskId,
    label,
    log_date: now.slice(0, 10),
    start_time: now,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/recon");
}

export async function stopTimeLog(logId: string) {
  const { profile, supabase } = await requireStaff();
  if (profile.role !== "runner") throw new Error("Only runners log time.");

  const { error } = await supabase
    .from("runner_time_logs")
    .update({ end_time: new Date().toISOString() })
    .eq("id", logId)
    .eq("runner_id", profile.id);
  if (error) throw new Error(error.message);
  revalidatePath("/recon");
}
