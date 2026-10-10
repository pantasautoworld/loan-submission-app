"use client";

import { useRouter } from "next/navigation";

interface Option {
  value: string;
  label: string;
}

interface Props {
  monthOptions: Option[];
  month: string;
  staffOptions: Option[];
  /** "" = all staff, otherwise the creator's profile id. */
  staff: string;
  /** "" = all, "submitted", or "pending" (not submitted yet). */
  status: string;
}

const SELECT =
  "rounded-[7px] border border-line bg-panel-raised px-2 py-1.5 text-sm text-fg outline-none focus:border-amber";

export function SubmissionsFilters({ monthOptions, month, staffOptions, staff, status }: Props) {
  const router = useRouter();

  function go(next: { month?: string; staff?: string; status?: string }) {
    const params = new URLSearchParams();
    params.set("month", next.month ?? month);
    const nextStaff = next.staff ?? staff;
    const nextStatus = next.status ?? status;
    if (nextStaff) params.set("staff", nextStaff);
    if (nextStatus) params.set("status", nextStatus);
    router.push(`/submissions?${params.toString()}`);
  }

  return (
    <>
      <select value={month} onChange={(e) => go({ month: e.target.value })} className={SELECT}>
        {monthOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select value={staff} onChange={(e) => go({ staff: e.target.value })} className={SELECT}>
        <option value="">All staff</option>
        {staffOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select value={status} onChange={(e) => go({ status: e.target.value })} className={SELECT}>
        <option value="">Submitted &amp; not submitted</option>
        <option value="submitted">Submitted</option>
        <option value="pending">Not submitted</option>
      </select>
    </>
  );
}
