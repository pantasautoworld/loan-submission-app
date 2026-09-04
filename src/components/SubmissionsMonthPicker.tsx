"use client";

import { useRouter } from "next/navigation";

interface Props {
  options: { value: string; label: string }[];
  value: string;
}

export function SubmissionsMonthPicker({ options, value }: Props) {
  const router = useRouter();

  return (
    <select
      value={value}
      onChange={(e) => router.push(`/submissions?month=${e.target.value}`)}
      className="rounded-[7px] border border-line bg-panel-raised px-2 py-1.5 text-sm text-fg outline-none focus:border-amber"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
