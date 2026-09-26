"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { setCarLocation, reassignReconTask, deleteReconTask, updateReconTaskStatus } from "@/app/recon/actions";
import { RECON_LOCATIONS, type CarLocationRow, type ReconTaskRow, type RunnerTimeLogRow } from "@/lib/recon";
import type { SigningBookingRow } from "@/lib/signingBookings";
import type { PuspakomBookingRow } from "@/lib/puspakomBookings";
import type { StockBoardVehicle } from "@/lib/stockBoard";
import { AddReconTaskModal } from "./AddReconTaskModal";

interface Props {
  vehicles: StockBoardVehicle[];
  carLocations: CarLocationRow[];
  reconTasks: ReconTaskRow[];
  timeLogs: RunnerTimeLogRow[];
  signingBookings: SigningBookingRow[];
  puspakomBookings: PuspakomBookingRow[];
  runners: { id: string; full_name: string }[];
}

function taskLabel(t: ReconTaskRow): string {
  if (t.task_kind === "condition") return t.condition_type ?? "Condition work";
  if (t.task_kind === "transport_to") return `Send to ${t.location}`;
  return `Return from ${t.location}`;
}

const UNASSIGNED = "unassigned";

export function ReconApp({
  vehicles,
  carLocations,
  reconTasks,
  timeLogs,
  signingBookings,
  puspakomBookings,
  runners,
}: Props) {
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [tasks, setTasks] = useState(reconTasks);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busyLocationId, setBusyLocationId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const locationByPlate = useMemo(() => {
    const map = new Map<string, CarLocationRow>();
    for (const l of carLocations) map.set(l.stock_board_vehicle_id, l);
    return map;
  }, [carLocations]);

  const q = search.trim().toLowerCase();
  const filteredVehicles = q ? vehicles.filter((v) => v.vin.toLowerCase().includes(q)) : vehicles;

  const columns = useMemo(
    () => [{ id: UNASSIGNED, name: "Unassigned" }, ...runners.map((r) => ({ id: r.id, name: r.full_name }))],
    [runners]
  );

  const pendingByColumn = useMemo(() => {
    const map: Record<string, ReconTaskRow[]> = {};
    for (const col of columns) map[col.id] = [];
    for (const t of tasks) {
      if (t.status !== "pending") continue;
      const key = t.runner_id ?? UNASSIGNED;
      if (!map[key]) map[key] = [];
      map[key].push(t);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.sort_order - b.sort_order);
    }
    return map;
  }, [tasks, columns]);

  const today = new Date().toISOString().slice(0, 10);
  const todaySigning = signingBookings.filter((b) => b.status === "scheduled" && b.appointment_date === today);
  const todayPuspakom = puspakomBookings.filter((b) => b.status === "scheduled" && b.appointment_date === today);

  async function handleLocationChange(v: StockBoardVehicle, location: string) {
    setBusyLocationId(v.id);
    try {
      await setCarLocation(v.id, v.vin, v.vehicle, location);
    } finally {
      setBusyLocationId(null);
    }
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const activeTask = tasks.find((t) => t.id === active.id);
    if (!activeTask) return;

    const overIsColumn = columns.some((c) => c.id === over.id);
    const overTask = tasks.find((t) => t.id === over.id);
    const destColumnId = overIsColumn ? String(over.id) : overTask ? (overTask.runner_id ?? UNASSIGNED) : null;
    if (!destColumnId) return;

    const destTasks = pendingByColumn[destColumnId] ?? [];
    const overIndex = overTask ? destTasks.findIndex((t) => t.id === overTask.id) : destTasks.length;
    const newSortOrder = overIndex >= 0 ? overIndex : destTasks.length;

    const runner = runners.find((r) => r.id === destColumnId);
    const newRunnerId = destColumnId === UNASSIGNED ? null : destColumnId;
    const newRunnerName = runner?.full_name ?? "";

    setTasks((prev) =>
      prev.map((t) =>
        t.id === activeTask.id ? { ...t, runner_id: newRunnerId, runner_name: newRunnerName, sort_order: newSortOrder } : t
      )
    );
    try {
      await reassignReconTask(activeTask.id, {
        runnerId: newRunnerId,
        runnerName: newRunnerName,
        dueDate: activeTask.due_date,
        sortOrder: newSortOrder,
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not move task - try again.");
    }
  }

  async function handleDelete(taskId: string) {
    if (!confirm("Delete this task?")) return;
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    try {
      await deleteReconTask(taskId);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not delete - try again.");
    }
  }

  async function handleDone(taskId: string) {
    try {
      await updateReconTaskStatus(taskId, "done");
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: "done" } : t)));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not update - try again.");
    }
  }

  const activeTask = tasks.find((t) => t.id === activeId) ?? null;

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <h2 className="font-display text-lg font-semibold text-fg">Car Condition & Location</h2>
          <p className="text-sm text-muted">Set each car&apos;s location, then drag tasks between runners below.</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="rounded-[7px] bg-amber px-4 py-2 text-sm font-semibold text-amber-fg hover:brightness-110"
        >
          + Add task
        </button>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search number plate…"
        className="mb-3 max-w-[240px] rounded-[7px] border border-line bg-panel-raised px-2 py-1.5 text-sm text-fg outline-none focus:border-amber"
      />

      <div className="mb-8 max-h-[280px] divide-y divide-line overflow-y-auto rounded-[10px] border border-line bg-panel">
        {filteredVehicles.map((v) => {
          const loc = locationByPlate.get(v.id);
          return (
            <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 p-2.5">
              <div className="flex items-center gap-3">
                <div className="inline-flex items-center rounded-md border-2 border-[#1a1d21] bg-[#f2f1ec] px-2 py-0.5 font-mono text-xs font-bold tracking-wide text-[#14171a]">
                  {v.vin}
                </div>
                <span className="text-sm text-fg">{v.vehicle}</span>
              </div>
              <select
                value={loc?.location ?? ""}
                disabled={busyLocationId === v.id}
                onChange={(e) => handleLocationChange(v, e.target.value)}
                className="rounded-[7px] border border-line bg-panel-raised px-2 py-1 text-xs text-fg outline-none focus:border-amber disabled:opacity-50"
              >
                <option value="">No location set</option>
                {RECON_LOCATIONS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      {(todaySigning.length > 0 || todayPuspakom.length > 0) && (
        <div className="mb-8">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-danger">
            Today&apos;s Fixed Appointments
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {todaySigning.map((b) => (
              <div key={b.id} className="rounded-[10px] border-2 border-danger bg-panel p-3 text-sm">
                <span className="rounded-full bg-danger px-2 py-0.5 text-[10px] font-bold text-[#0d0f12]">
                  SIGNING
                </span>{" "}
                <span className="font-mono font-semibold text-fg">{b.no_plate}</span> · {b.appointment_time ?? ""} ·{" "}
                {b.runner_name || "unassigned"}
              </div>
            ))}
            {todayPuspakom.map((b) => (
              <div key={b.id} className="rounded-[10px] border-2 border-danger bg-panel p-3 text-sm">
                <span className="rounded-full bg-danger px-2 py-0.5 text-[10px] font-bold text-[#0d0f12]">
                  PUSPAKOM
                </span>{" "}
                <span className="font-mono font-semibold text-fg">{b.no_plate}</span> · {b.appointment_time ?? ""} ·{" "}
                {b.runner_name || "unassigned"}
              </div>
            ))}
          </div>
        </div>
      )}

      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
        Flexible Tasks - drag to assign/reorder
      </h3>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(220px, 1fr))` }}>
          {columns.map((col) => (
            <RunnerColumn
              key={col.id}
              id={col.id}
              name={col.name}
              tasks={pendingByColumn[col.id] ?? []}
              timeLogs={timeLogs.filter((l) => l.runner_id === col.id && l.log_date === today)}
              onDelete={handleDelete}
              onDone={handleDone}
            />
          ))}
        </div>
        <DragOverlay>
          {activeTask && (
            <div className="rounded-[8px] border border-amber bg-panel p-2.5 text-sm shadow-lg">
              <span className="font-mono font-semibold text-fg">{activeTask.no_plate}</span>
              <div className="text-xs text-muted">{taskLabel(activeTask)}</div>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {showAdd && (
        <AddReconTaskModal
          vehicles={vehicles}
          runners={runners}
          onClose={() => setShowAdd(false)}
          onSaved={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}

function RunnerColumn({
  id,
  name,
  tasks,
  timeLogs,
  onDelete,
  onDone,
}: {
  id: string;
  name: string;
  tasks: ReconTaskRow[];
  timeLogs: RunnerTimeLogRow[];
  onDelete: (taskId: string) => void;
  onDone: (taskId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[140px] flex-col rounded-[10px] border p-2.5 ${
        isOver ? "border-amber bg-amber-dim/10" : "border-line bg-panel-raised/40"
      }`}
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{name}</p>
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {tasks.map((t) => (
            <TaskCard key={t.id} task={t} onDelete={() => onDelete(t.id)} onDone={() => onDone(t.id)} />
          ))}
        </div>
      </SortableContext>
      {timeLogs.length > 0 && (
        <div className="mt-3 border-t border-line pt-2 text-[11px] text-muted">
          {timeLogs.map((l) => (
            <div key={l.id}>
              {l.label}: {new Date(l.start_time).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
              {" - "}
              {l.end_time
                ? new Date(l.end_time).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
                : "now"}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TaskCard({ task, onDelete, onDone }: { task: ReconTaskRow; onDelete: () => void; onDone: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="rounded-[8px] border border-line bg-panel p-2.5 text-sm">
      <div {...attributes} {...listeners} className="cursor-grab">
        <span className="font-mono font-semibold text-fg">{task.no_plate}</span>
        <div className="text-xs text-muted">{taskLabel(task)}</div>
        {task.due_date && <div className="text-[10px] text-muted">Due {task.due_date}</div>}
      </div>
      <div className="mt-1.5 flex justify-end gap-2">
        <button onClick={onDone} className="text-[11px] text-success hover:underline">
          Done
        </button>
        <button onClick={onDelete} className="text-[11px] text-muted hover:text-danger hover:underline">
          Delete
        </button>
      </div>
    </div>
  );
}
