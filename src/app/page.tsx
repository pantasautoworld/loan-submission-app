import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { TopNav } from "@/components/TopNav";
import { initialsOf, avatarColor } from "@/lib/avatar";

interface LeaderboardEntry {
  name: string;
  count: number;
  photoUrl: string | null;
}

function Avatar({
  entry,
  className,
  shape = "circle",
}: {
  entry: LeaderboardEntry;
  className: string;
  shape?: "circle" | "square";
}) {
  const shapeClass = shape === "square" ? "rounded-2xl" : "rounded-full";
  if (entry.photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- small remote avatar thumbnails don't need next/image's optimization pipeline
      <img
        src={entry.photoUrl}
        alt={entry.name}
        className={`flex-shrink-0 object-cover ${shapeClass} ${className}`}
      />
    );
  }
  return (
    <div
      className={`flex flex-shrink-0 items-center justify-center font-bold ${shapeClass} ${avatarColor(entry.name)} ${className}`}
    >
      {initialsOf(entry.name)}
    </div>
  );
}

const PODIUM_RING = ["ring-amber-300", "ring-slate-200", "ring-orange-300"];

function PodiumSlot({ entry, rank }: { entry?: LeaderboardEntry; rank: 1 | 2 | 3 }) {
  if (!entry) return <div className="w-28 sm:w-32" />;

  const isFirst = rank === 1;
  const frameSize = isFirst ? "h-28 w-28 text-4xl" : "h-24 w-24 text-3xl";
  const ringColor = PODIUM_RING[rank - 1];

  return (
    <div className={`flex w-28 flex-col items-center sm:w-32 ${isFirst ? "" : "pb-2"}`}>
      {isFirst ? (
        <div className="relative mb-1 flex h-10 w-16 items-center justify-center">
          <span className="absolute h-9 w-9 animate-ping rounded-full bg-amber-300/50" />
          <svg viewBox="0 0 24 16" className="relative h-10 w-14 drop-shadow-[0_0_6px_rgba(251,191,36,0.8)]">
            <path
              d="M2 14 L2 6 L6 10 L12 3 L18 10 L22 6 L22 14 Z"
              fill="#fbbf24"
              stroke="#78350f"
              strokeWidth="1"
              strokeLinejoin="round"
            />
          </svg>
          <span className="absolute -left-1 top-0 h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
          <span className="absolute -right-1 top-1 h-1 w-1 animate-pulse rounded-full bg-white [animation-delay:300ms]" />
        </div>
      ) : (
        <span className="mb-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[11px] font-extrabold text-violet-700 shadow">
          {rank}
        </span>
      )}
      <div className="relative">
        {isFirst && (
          <span className="absolute inset-0 -z-10 animate-pulse rounded-2xl bg-amber-300/40 blur-xl" />
        )}
        <div
          className={`rounded-2xl bg-white/15 p-1.5 shadow-lg ${isFirst ? "scale-110 animate-[pulse_2.5s_ease-in-out_infinite]" : ""}`}
        >
          <Avatar entry={entry} shape="square" className={`${frameSize} ring-4 ${ringColor}`} />
        </div>
      </div>
      <p className="mt-2 w-full truncate text-center text-sm font-bold text-white">{entry.name}</p>
      <span className="mt-1 rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold text-white">
        {entry.count}
      </span>
    </div>
  );
}

export default async function HomePage() {
  const { profile, supabase } = await requireStaff();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthLabel = now.toLocaleString("en-US", { month: "long", year: "numeric" });

  const { data: generatedSubs } = await supabase
    .from("submissions")
    .select("created_by, profiles:created_by(full_name, avatar_path)")
    .eq("status", "generated")
    .gte("created_at", monthStart);

  const counts = new Map<string, LeaderboardEntry>();
  for (const s of generatedSubs ?? []) {
    if (!s.created_by) continue;
    const profileRow = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
    const row = profileRow as { full_name: string; avatar_path: string | null } | null;
    const photoUrl = row?.avatar_path
      ? supabase.storage.from("staff-photos").getPublicUrl(row.avatar_path).data.publicUrl
      : null;
    const entry = counts.get(s.created_by) ?? {
      name: row?.full_name || "Unknown",
      count: 0,
      photoUrl,
    };
    entry.count += 1;
    counts.set(s.created_by, entry);
  }
  const leaderboard = [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 10);
  const [first, second, third] = leaderboard;
  const rest = leaderboard.slice(3);

  return (
    <div className="flex flex-1 flex-col">
      <TopNav staffName={profile.full_name} role={profile.role} />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-4 p-6">
        <h1 className="font-display text-xl text-fg">Welcome, {profile.full_name || "there"}</h1>
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/submissions/new"
            className="group rounded-[10px] border border-line bg-panel p-5 transition-colors hover:border-amber"
          >
            <div className="mb-3 flex h-24 w-24 items-center justify-center rounded-[9px] bg-amber/15 transition-colors group-hover:bg-amber/25">
              <svg viewBox="0 0 48 48" className="h-20 w-20">
                <path
                  d="M17 5h9l6 6v13a2 2 0 0 1-2 2H17a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
                  fill="#d6e6ff"
                  stroke="#0f1115"
                  strokeWidth="2.2"
                  strokeLinejoin="round"
                />
                <path
                  d="M26 5v5a1 1 0 0 0 1 1h5"
                  fill="none"
                  stroke="#0f1115"
                  strokeWidth="2.2"
                  strokeLinejoin="round"
                />
                <path
                  d="M21.5 22v-8m0 0-3 3m3-3 3 3"
                  fill="none"
                  stroke="#0f1115"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <rect
                  x="4"
                  y="29"
                  width="29"
                  height="12"
                  rx="4"
                  fill="#6EE7B7"
                  stroke="#0f1115"
                  strokeWidth="2.2"
                />
                <text
                  x="8.5"
                  y="38"
                  fontFamily="Arial, Helvetica, sans-serif"
                  fontWeight="700"
                  fontSize="8.5"
                  fill="#0f1115"
                >
                  SUBMIT
                </text>
                <path
                  d="M33 37.5 44 42l-4.5 1.8L37.5 48Z"
                  fill="#d6e6ff"
                  stroke="#0f1115"
                  strokeWidth="2.2"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h2 className="font-medium text-fg">New Submission</h2>
            <p className="mt-1 text-sm text-muted">
              Start a new hirer/guarantor loan submission.
            </p>
          </Link>
          <Link
            href="/submissions"
            className="group rounded-[10px] border border-line bg-panel p-5 transition-colors hover:border-amber"
          >
            <div className="mb-3 flex h-24 w-24 items-center justify-center rounded-[9px] bg-sync/15 transition-colors group-hover:bg-sync/25">
              <svg viewBox="0 0 48 48" className="h-20 w-20">
                <rect x="3" y="4" width="20" height="9" rx="3" fill="#6b70e6" stroke="#0f1115" strokeWidth="2.2" />
                <rect x="5.5" y="6.5" width="10" height="1.8" rx="0.9" fill="#9ea3f2" />
                <circle cx="17" cy="8.5" r="1" fill="#0f1115" />
                <circle cx="19.3" cy="8.5" r="1" fill="#0f1115" />
                <circle cx="21.6" cy="8.5" r="1" fill="#0f1115" />

                <rect x="3" y="14" width="20" height="9" rx="3" fill="#6b70e6" stroke="#0f1115" strokeWidth="2.2" />
                <rect x="5.5" y="16.5" width="10" height="1.8" rx="0.9" fill="#9ea3f2" />
                <circle cx="17" cy="18.5" r="1" fill="#0f1115" />
                <circle cx="19.3" cy="18.5" r="1" fill="#0f1115" />
                <circle cx="21.6" cy="18.5" r="1" fill="#0f1115" />

                <rect x="3" y="24" width="20" height="9" rx="3" fill="#6b70e6" stroke="#0f1115" strokeWidth="2.2" />
                <rect x="5.5" y="26.5" width="10" height="1.8" rx="0.9" fill="#9ea3f2" />
                <circle cx="17" cy="28.5" r="1" fill="#0f1115" />
                <circle cx="19.3" cy="28.5" r="1" fill="#0f1115" />
                <circle cx="21.6" cy="28.5" r="1" fill="#0f1115" />

                <path
                  d="M23 29h19a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H23z"
                  fill="#c7c2cf"
                  stroke="#0f1115"
                  strokeWidth="2.2"
                  strokeLinejoin="round"
                />

                <path
                  d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z"
                  transform="translate(20 -6) scale(1.3)"
                  fill="#bfe6fa"
                  stroke="#0f1115"
                  strokeWidth="1.7"
                  strokeLinejoin="round"
                />

                <path
                  d="M31 22 31 14 27 14 33 6 39 14 35 14 35 22 Z"
                  fill="#2ee6b0"
                  stroke="#0f1115"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h2 className="font-medium text-fg">Submissions</h2>
            <p className="mt-1 text-sm text-muted">
              View past submissions and download generated PDFs.
            </p>
          </Link>
        </div>

        <div className="relative overflow-hidden rounded-[16px] bg-gradient-to-br from-[#6b21a8] via-[#c026d3] to-[#f97316] p-5 shadow-xl">
          <div className="pointer-events-none absolute -left-10 -top-14 h-44 w-44 animate-pulse rounded-full bg-amber-300/25 blur-2xl" />
          <div className="pointer-events-none absolute -right-8 -top-4 h-36 w-36 animate-pulse rounded-full bg-cyan-300/25 blur-2xl [animation-delay:500ms]" />
          <div className="pointer-events-none absolute -bottom-10 left-1/3 h-32 w-32 animate-pulse rounded-full bg-pink-400/20 blur-2xl [animation-delay:1000ms]" />
          <div className="pointer-events-none absolute -bottom-6 right-6 h-24 w-24 animate-pulse rounded-full bg-yellow-300/20 blur-xl [animation-delay:1500ms]" />

          <div className="relative">
            <div className="flex justify-center">
              <div className="rounded-full bg-white px-6 py-1.5 shadow-[0_0_20px_rgba(251,191,36,0.6)]">
                <span className="text-sm font-extrabold uppercase tracking-widest text-violet-700">
                  Leaderboard
                </span>
              </div>
            </div>
            <p className="mt-2 text-center text-sm text-fuchsia-50">
              Most cases generated in {monthLabel}.
            </p>

            {leaderboard.length === 0 ? (
              <p className="mt-6 text-center text-sm text-fuchsia-50">
                No cases generated yet this month.
              </p>
            ) : (
              <>
                <div className="mt-6 flex items-end justify-center gap-4 sm:gap-8">
                  <PodiumSlot entry={second} rank={2} />
                  <PodiumSlot entry={first} rank={1} />
                  <PodiumSlot entry={third} rank={3} />
                </div>

                {rest.length > 0 && (
                  <ol className="mt-6 space-y-2">
                    {rest.map((entry, i) => (
                      <li
                        key={`${entry.name}-${i}`}
                        className="flex items-center justify-between gap-3 rounded-full bg-white/95 px-3 py-2.5 shadow-sm"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-violet-100 text-sm font-extrabold text-violet-700">
                            {i + 4}
                          </span>
                          <Avatar entry={entry} className="h-12 w-12 text-base" />
                          <span className="truncate text-sm font-semibold text-violet-950">
                            {entry.name}
                          </span>
                        </div>
                        <span className="flex-shrink-0 rounded-full bg-gradient-to-r from-fuchsia-600 to-orange-500 px-3 py-1 text-xs font-bold text-white shadow">
                          {entry.count} {entry.count === 1 ? "case" : "cases"}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
