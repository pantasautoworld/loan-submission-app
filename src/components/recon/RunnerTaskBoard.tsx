"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  updateReconTaskStatus,
  updateReconTaskRemark,
  reassignReconTask,
  startTimeLog,
  stopTimeLog,
} from "@/app/recon/actions";
import { markSigningBookingComplete, saveSigningPhoto } from "@/app/signing/actions";
import { completePuspakomBooking } from "@/app/puspakom/actions";
import { uploadSigningPhotoFile } from "@/lib/storage";
import { AddReconTaskModal } from "./AddReconTaskModal";
import { CarChecklistModal } from "./CarChecklistModal";
import type { ReconTaskRow, RunnerTimeLogRow } from "@/lib/recon";
import type { SigningBookingRow } from "@/lib/signingBookings";
import type { PuspakomBookingRow } from "@/lib/puspakomBookings";
import type { StockBoardVehicle } from "@/lib/stockBoard";

interface Props {
  vehicles: StockBoardVehicle[];
  /** Every car's condition-checklist rows (any runner) - what the "Check a car" checklist reads. */
  checklistItems: ReconTaskRow[];
  reconTasks: ReconTaskRow[];
  signingBookings: SigningBookingRow[];
  puspakomBookings: PuspakomBookingRow[];
  timeLogs: RunnerTimeLogRow[];
}

function taskLabel(t: ReconTaskRow): string {
  if (t.task_kind === "condition") return t.condition_type ?? "Condition work";
  if (t.task_kind === "transport_to") return `Send to ${t.location}`;
  return `Return from ${t.location}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function RunnerTaskBoard({
  vehicles,
  checklistItems,
  reconTasks,
  signingBookings,
  puspakomBookings,
  timeLogs,
}: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);
  const [remarkDrafts, setRemarkDrafts] = useState<Record<string, string>>({});
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const today = todayIso();
  const openLog = timeLogs.find((l) => l.end_time === null) ?? null;

  const fixedAppointments = useMemo(() => {
    const signing = signingBookings
      .filter((b) => b.status === "scheduled" && b.appointment_date <= today)
      .map((b) => ({ type: "signing" as const, date: b.appointment_date, time: b.appointment_time, item: b }));
    const puspakom = puspakomBookings
      .filter((b) => b.status === "scheduled" && b.appointment_date <= today)
      .map((b) => ({ type: "puspakom" as const, date: b.appointment_date, time: b.appointment_time, item: b }));
    return [...signing, ...puspakom].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.time ?? "99:99").localeCompare(b.time ?? "99:99");
    });
  }, [signingBookings, puspakomBookings, today]);

  const flexibleTasks = useMemo(
    () =>
      [...reconTasks]
        .filter((t) => t.status === "pending")
        .sort((a, b) => {
          if (!!a.due_date !== !!b.due_date) return a.due_date ? -1 : 1;
          if (a.due_date && b.due_date && a.due_date !== b.due_date) return a.due_date.localeCompare(b.due_date);
          return a.sort_order - b.sort_order;
        }),
    [reconTasks]
  );
  const [orderedIds, setOrderedIds] = useState<string[]>(flexibleTasks.map((t) => t.id));
  const displayTasks = orderedIds
    .map((id) => flexibleTasks.find((t) => t.id === id))
    .filter((t): t is ReconTaskRow => !!t);
  // include any newly-arrived tasks not yet in orderedIds (e.g. after revalidate)
  const missing = flexibleTasks.filter((t) => !orderedIds.includes(t.id));
  const allDisplayTasks = [...displayTasks, ...missing];

  const doneTasks = reconTasks.filter((t) => t.status === "done");

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = allDisplayTasks.findIndex((t) => t.id === active.id);
    const newIndex = allDisplayTasks.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(allDisplayTasks, oldIndex, newIndex);
    setOrderedIds(reordered.map((t) => t.id));
    try {
      await Promise.all(
        reordered.map((t, i) =>
          reassignReconTask(t.id, { runnerId: null, runnerName: "", dueDate: t.due_date, sortOrder: i })
        )
      );
    } catch {
      // best-effort - a failed reorder just leaves the DB order slightly stale until next load
    }
  }

  async function handleStart(taskId: string, label: string) {
    setBusyId(taskId);
    try {
      await startTimeLog(taskId, label);
    } finally {
      setBusyId(null);
    }
  }

  async function handleStop(logId: string) {
    setBusyId(logId);
    try {
      await stopTimeLog(logId);
    } finally {
      setBusyId(null);
    }
  }

  async function handleBreak() {
    setBusyId("break");
    try {
      await startTimeLog(null, "Break");
    } finally {
      setBusyId(null);
    }
  }

  async function handleTaskDone(taskId: string, status: "pending" | "done") {
    setBusyId(taskId);
    try {
      await updateReconTaskStatus(taskId, status);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not update - try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemarkBlur(taskId: string) {
    const value = remarkDrafts[taskId];
    if (value === undefined) return;
    try {
      await updateReconTaskRemark(taskId, value);
    } catch {
      // best-effort
    }
  }

  async function handlePuspakomComplete(bookingId: string) {
    setBusyId(bookingId);
    try {
      await completePuspakomBooking(bookingId);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not complete - try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleSigningPhoto(booking: SigningBookingRow, file: File) {
    setBusyId(booking.id);
    try {
      const path = await uploadSigningPhotoFile(booking.id, file);
      await saveSigningPhoto(booking.id, path);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not upload - try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleSigningComplete(booking: SigningBookingRow) {
    setBusyId(booking.id);
    try {
      await markSigningBookingComplete(booking.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not complete - try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-[700px] px-6 py-5">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold text-fg">My Tasks</h2>
          <p className="text-sm text-muted">Today&apos;s fixed appointments come first - do those regardless.</p>
        </div>
        <button
          onClick={handleBreak}
          disabled={busyId === "break"}
          className="rounded-[7px] border border-line bg-panel-raised px-3 py-1.5 text-xs text-fg hover:border-amber disabled:opacity-50"
        >
          {openLog?.label === "Break" ? "…on break" : "+ Log break"}
        </button>
      </div>

      {openLog && (
        <div className="mb-4 rounded-[10px] border border-amber bg-amber-dim/20 px-4 py-2.5 text-sm text-amber">
          Currently: <strong>{openLog.label}</strong> since {fmtTime(openLog.start_time)}
          <button
            onClick={() => handleStop(openLog.id)}
            disabled={busyId === openLog.id}
            className="ml-3 rounded-full border border-amber px-2.5 py-0.5 text-xs font-semibold hover:bg-amber/10 disabled:opacity-50"
          >
            Stop
          </button>
        </div>
      )}

      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-danger">
        Today&apos;s Fixed Appointments
      </h3>
      {fixedAppointments.length === 0 ? (
        <p className="mb-6 text-sm text-muted">Nothing fixed for today.</p>
      ) : (
        <div className="mb-6 divide-y divide-line rounded-[10px] border-2 border-danger bg-panel">
          {fixedAppointments.map(({ type, item }) =>
            type === "signing" ? (
              <div key={`s-${item.id}`} className="p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="rounded-full bg-danger px-2 py-0.5 text-[10px] font-bold text-[#0d0f12]">
                      SIGNING
                    </span>
                    <span className="ml-2 font-mono text-sm font-semibold text-fg">{item.no_plate}</span>
                    <div className="mt-1 text-sm text-fg">{item.vehicle}</div>
                    <div className="text-xs text-muted">
                      {item.buyer_name} · {item.appointment_time ?? ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="cursor-pointer rounded-[7px] border border-line bg-panel-raised px-2.5 py-1 text-xs text-fg hover:border-amber">
                      {item.photo_path ? "Photo ✓" : "Attach photo"}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleSigningPhoto(item, file);
                        }}
                      />
                    </label>
                    <button
                      onClick={() => handleSigningComplete(item)}
                      disabled={!item.photo_path || busyId === item.id}
                      className="rounded-[7px] bg-success px-3 py-1 text-xs font-semibold text-[#0d0f12] disabled:opacity-40"
                    >
                      Mark Done
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div key={`p-${item.id}`} className="p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="rounded-full bg-danger px-2 py-0.5 text-[10px] font-bold text-[#0d0f12]">
                      PUSPAKOM
                    </span>
                    <span className="ml-2 font-mono text-sm font-semibold text-fg">{item.no_plate}</span>
                    <div className="mt-1 text-sm text-fg">{item.vehicle}</div>
                    <div className="text-xs text-muted">{item.branch || item.company}</div>
                  </div>
                  <button
                    onClick={() => handlePuspakomComplete(item.id)}
                    disabled={busyId === item.id}
                    className="rounded-[7px] bg-success px-3 py-1 text-xs font-semibold text-[#0d0f12] disabled:opacity-50"
                  >
                    Mark Done
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      )}

      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">Flexible Tasks</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowChecklist(true)}
            className="rounded-[7px] bg-amber px-3 py-1 text-xs font-semibold text-amber-fg hover:brightness-110"
          >
            Check a car
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="rounded-[7px] border border-line bg-panel-raised px-3 py-1 text-xs text-fg hover:border-amber"
          >
            + Add task
          </button>
        </div>
      </div>
      {allDisplayTasks.length === 0 ? (
        <p className="mb-6 text-sm text-muted">Nothing pending - nice.</p>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <SortableContext items={allDisplayTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            <div className="mb-6 space-y-2">
              {allDisplayTasks.map((task) => (
                <FlexibleTaskCard
                  key={task.id}
                  task={task}
                  isActive={openLog?.recon_task_id === task.id}
                  busy={busyId === task.id}
                  remark={remarkDrafts[task.id] ?? task.remark}
                  onRemarkChange={(v) => setRemarkDrafts((d) => ({ ...d, [task.id]: v }))}
                  onRemarkBlur={() => handleRemarkBlur(task.id)}
                  onStart={() => handleStart(task.id, taskLabel(task))}
                  onStop={() => openLog && handleStop(openLog.id)}
                  onDone={() => handleTaskDone(task.id, "done")}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {doneTasks.length > 0 && (
        <details className="mb-6">
          <summary className="cursor-pointer text-xs text-muted">
            {doneTasks.length} completed task{doneTasks.length === 1 ? "" : "s"}
          </summary>
          <div className="mt-2 divide-y divide-line rounded-[10px] border border-line bg-panel-raised/40">
            {doneTasks.map((t) => (
              <div key={t.id} className="flex items-center justify-between p-2.5 text-sm">
                <span className="text-muted">
                  {t.no_plate} - {taskLabel(t)}
                </span>
                <button
                  onClick={() => handleTaskDone(t.id, "pending")}
                  className="text-xs text-amber hover:underline"
                >
                  Reopen
                </button>
              </div>
            ))}
          </div>
        </details>
      )}

      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Today&apos;s Timesheet</h3>
      {timeLogs.filter((l) => l.log_date === today).length === 0 ? (
        <p className="text-sm text-muted">Nothing logged yet today.</p>
      ) : (
        <div className="divide-y divide-line rounded-[10px] border border-line bg-panel">
          {timeLogs
            .filter((l) => l.log_date === today)
            .map((l) => (
              <div key={l.id} className="flex items-center justify-between p-2.5 text-sm">
                <span className="text-fg">{l.label}</span>
                <span className="font-mono text-xs text-muted">
                  {fmtTime(l.start_time)} - {l.end_time ? fmtTime(l.end_time) : "now"}
                </span>
              </div>
            ))}
        </div>
      )}

      {showAdd && (
        <AddReconTaskModal vehicles={vehicles} onClose={() => setShowAdd(false)} onSaved={() => setShowAdd(false)} />
      )}
      {showChecklist && (
        <CarChecklistModal vehicles={vehicles} items={checklistItems} onClose={() => setShowChecklist(false)} />
      )}
    </div>
  );
}

function FlexibleTaskCard({
  task,
  isActive,
  busy,
  remark,
  onRemarkChange,
  onRemarkBlur,
  onStart,
  onStop,
  onDone,
}: {
  task: ReconTaskRow;
  isActive: boolean;
  busy: boolean;
  remark: string;
  onRemarkChange: (v: string) => void;
  onRemarkBlur: () => void;
  onStart: () => void;
  onStop: () => void;
  onDone: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-[10px] border border-line bg-panel p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div {...attributes} {...listeners} className="min-w-0 flex-1 cursor-grab">
          <span className="font-mono text-sm font-semibold text-fg">{task.no_plate}</span>
          <span className="ml-2 text-sm text-fg">{task.vehicle}</span>
          <div className="mt-0.5 text-xs text-muted">
            {taskLabel(task)}
            {task.due_date ? ` · Due ${task.due_date}` : ""}
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {isActive ? (
            <button
              onClick={onStop}
              disabled={busy}
              className="rounded-[7px] border border-amber px-2.5 py-1 text-xs font-semibold text-amber disabled:opacity-50"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={onStart}
              disabled={busy}
              className="rounded-[7px] border border-line px-2.5 py-1 text-xs text-fg hover:border-amber disabled:opacity-50"
            >
              Start
            </button>
          )}
          <button
            onClick={onDone}
            disabled={busy}
            className="rounded-[7px] bg-success px-2.5 py-1 text-xs font-semibold text-[#0d0f12] disabled:opacity-50"
          >
            Done
          </button>
        </div>
      </div>
      <input
        className="mt-2 w-full rounded-[7px] border border-line bg-panel-raised px-2 py-1 text-xs text-fg outline-none focus:border-amber"
        value={remark}
        onChange={(e) => onRemarkChange(e.target.value)}
        onBlur={onRemarkBlur}
        placeholder="Remark"
      />
    </div>
  );
}
