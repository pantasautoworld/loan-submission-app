"use client";

import { useState, useTransition } from "react";
import {
  createStaff,
  deleteStaff,
  resetStaffPassword,
  updateStaffRole,
} from "@/app/staff/actions";

interface StaffRow {
  id: string;
  full_name: string;
  username: string | null;
  role: "admin" | "sales" | string;
}

const FIELD =
  "w-full rounded-[7px] border border-line bg-panel-raised px-2 py-1.5 text-sm text-fg outline-none focus:border-amber";
const LABEL = "mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted";

export function StaffManager({
  staff,
  currentProfileId,
}: {
  staff: StaffRow[];
  currentProfileId: string;
}) {
  return (
    <div className="space-y-6">
      <AddStaffForm />
      <div className="space-y-3">
        {staff.map((s) => (
          <StaffRowCard key={s.id} staff={s} isSelf={s.id === currentProfileId} />
        ))}
        {staff.length === 0 && <p className="text-sm text-muted">No staff accounts yet.</p>}
      </div>
    </div>
  );
}

function AddStaffForm() {
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "sales">("sales");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await createStaff({ full_name: fullName, username, password, role });
        setFullName("");
        setUsername("");
        setPassword("");
        setRole("sales");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not add staff.");
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-[10px] border border-line bg-panel-raised/40 p-4"
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Add Staff</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={LABEL}>Full Name</label>
          <input
            className={FIELD}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
        </div>
        <div>
          <label className={LABEL}>Username</label>
          <input
            className={FIELD}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div>
          <label className={LABEL}>Password</label>
          <input
            type="password"
            className={FIELD}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
        </div>
        <div>
          <label className={LABEL}>Role</label>
          <select
            className={FIELD}
            value={role}
            onChange={(e) => setRole(e.target.value as "admin" | "sales")}
          >
            <option value="sales">Sales</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="rounded-[7px] bg-amber px-4 py-1.5 text-sm font-medium text-amber-fg hover:bg-amber/90 disabled:opacity-50"
      >
        {isPending ? "Adding…" : "Add Staff"}
      </button>
    </form>
  );
}

function StaffRowCard({ staff, isSelf }: { staff: StaffRow; isSelf: boolean }) {
  const [showReset, setShowReset] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await resetStaffPassword(staff.id, newPassword);
        setNewPassword("");
        setShowReset(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not reset password.");
      }
    });
  }

  function handleRoleChange(role: "admin" | "sales") {
    setError(null);
    startTransition(async () => {
      try {
        await updateStaffRole(staff.id, role);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not update role.");
      }
    });
  }

  function handleDelete() {
    const ok = confirm(`Delete staff account "${staff.full_name}"? This cannot be undone.`);
    if (!ok) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteStaff(staff.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not delete account.");
      }
    });
  }

  return (
    <div className="rounded-[10px] border border-line bg-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium text-fg">
            {staff.full_name} {isSelf && <span className="text-xs text-muted">(you)</span>}
          </p>
          <p className="text-xs text-muted">@{staff.username ?? "-"}</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            className="rounded-[7px] border border-line bg-panel-raised px-2 py-1 text-xs text-fg"
            value={staff.role}
            disabled={isPending || isSelf}
            onChange={(e) => handleRoleChange(e.target.value as "admin" | "sales")}
          >
            <option value="sales">Sales</option>
            <option value="admin">Admin</option>
          </select>
          <button
            onClick={() => setShowReset((v) => !v)}
            className="text-xs text-amber hover:underline"
          >
            Reset password
          </button>
          {!isSelf && (
            <button
              onClick={handleDelete}
              disabled={isPending}
              className="text-xs text-muted hover:text-danger hover:underline disabled:opacity-50"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {showReset && (
        <form onSubmit={handleResetPassword} className="mt-3 flex items-center gap-2 border-t border-line pt-3">
          <input
            type="password"
            className={FIELD}
            placeholder="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={6}
            required
          />
          <button
            type="submit"
            disabled={isPending}
            className="whitespace-nowrap rounded-[7px] border border-line px-3 py-1.5 text-xs font-medium text-fg hover:border-amber disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Set Password"}
          </button>
        </form>
      )}

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
