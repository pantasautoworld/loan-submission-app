"use client";

import { useRouter } from "next/navigation";

interface Props {
  options: { value: string; label: string }[];
  value: string;
}

export function LeaderboardMonthPicker({ options, value }: Props) {
  const router = useRouter();

  return (
    <select
      value={value}
      onChange={(e) => router.push(`/?month=${e.target.value}`)}
      className="rounded-full border-0 bg-white/90 px-3 py-1 text-xs font-semibold text-violet-700 outline-none focus:ring-2 focus:ring-white"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
