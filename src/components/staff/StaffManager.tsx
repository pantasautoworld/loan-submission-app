"use client";

import { useRef, useState, useTransition } from "react";
import {
  createStaff,
  deleteStaff,
  resetStaffPassword,
  updateStaffPhoto,
  updateStaffRole,
} from "@/app/staff/actions";
import { uploadStaffPhoto } from "@/lib/storage";
import { initialsOf, avatarColor } from "@/lib/avatar";

interface StaffRow {
  id: string;
  full_name: string;
  username: string | null;
  role: "admin" | "sales" | string;
  photoUrl: string | null;
}

const FIELD =
  "w-full rounded-[7px] border border-line bg-panel-raised px-2 py-1.5 text-sm text-fg outline-none focus:border-amber";
const LABEL = "mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted";

function RowAvatar({
  name,
  photoUrl,
  className,
}: {
  name: string;
  photoUrl: string | null;
  className: string;
}) {
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- small remote avatar thumbnail
    return <img src={photoUrl} alt={name} className={`rounded-full object-cover ${className}`} />;
  }
  return (
    <div
      className={`flex items-center justify-center rounded-full font-semibold ${avatarColor(name)} ${className}`}
    >
      {initialsOf(name)}
    </div>
  );
}

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
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handlePhotoSelect(file: File | undefined) {
    setPhotoFile(file ?? null);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        let avatar_path: string | undefined;
        if (photoFile) {
          avatar_path = await uploadStaffPhoto(`pending-${crypto.randomUUID()}`, photoFile);
        }
        await createStaff({ full_name: fullName, username, password, role, avatar_path });
        setFullName("");
        setUsername("");
        setPassword("");
        setRole("sales");
        handlePhotoSelect(undefined);
        if (fileInputRef.current) fileInputRef.current.value = "";
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
      <div className="flex items-center gap-3">
        {photoPreview ? (
          // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
          <img
            src={photoPreview}
            alt="Preview"
            className="h-14 w-14 flex-shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-panel-raised text-xs text-muted">
            No photo
          </div>
        )}
        <div>
          <label className={LABEL}>Photo (optional)</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => handlePhotoSelect(e.target.files?.[0])}
            className="text-xs text-muted file:mr-2 file:rounded-[6px] file:border file:border-line file:bg-panel-raised file:px-2 file:py-1 file:text-xs file:text-fg"
          />
        </div>
      </div>
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

  function handlePhotoChange(file: File | undefined) {
    if (!file) return;
    setError(null);
    startTransition(async () => {
      try {
        const path = await uploadStaffPhoto(staff.id, file);
        await updateStaffPhoto(staff.id, path);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not update photo.");
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
        <div className="flex items-center gap-3">
          <RowAvatar name={staff.full_name} photoUrl={staff.photoUrl} className="h-10 w-10 text-sm" />
          <div>
            <p className="font-medium text-fg">
              {staff.full_name} {isSelf && <span className="text-xs text-muted">(you)</span>}
            </p>
            <p className="text-xs text-muted">@{staff.username ?? "-"}</p>
          </div>
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
          <label className="cursor-pointer text-xs text-amber hover:underline">
            {staff.photoUrl ? "Change photo" : "Add photo"}
            <input
              type="file"
              accept="image/*"
              disabled={isPending}
              className="hidden"
              onChange={(e) => handlePhotoChange(e.target.files?.[0])}
            />
          </label>
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
