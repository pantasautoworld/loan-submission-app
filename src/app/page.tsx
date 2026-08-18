import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { TopNav } from "@/components/TopNav";
import { initialsOf, avatarColor } from "@/lib/avatar";

const MEDAL_RING = ["ring-amber", "ring-fg/40", "ring-[#cd7f32]"];

interface LeaderboardEntry {
  name: string;
  count: number;
  photoUrl: string | null;
}

function Avatar({ entry, className }: { entry: LeaderboardEntry; className: string }) {
  if (entry.photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- small remote avatar thumbnails don't need next/image's optimization pipeline
      <img
        src={entry.photoUrl}
        alt={entry.name}
        className={`flex-shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }
  return (
    <div
      className={`flex flex-shrink-0 items-center justify-center rounded-full font-semibold ${avatarColor(entry.name)} ${className}`}
    >
      {initialsOf(entry.name)}
    </div>
  );
}

function PodiumSlot({ entry, rank }: { entry?: LeaderboardEntry; rank: 1 | 2 | 3 }) {
  if (!entry) return <div className="w-20 sm:w-24" />;

  const isFirst = rank === 1;
  const avatarSize = isFirst ? "h-20 w-20 text-xl" : "h-16 w-16 text-base";
  const ringColor = MEDAL_RING[rank - 1];
  const platformHeight = isFirst ? "h-14" : rank === 2 ? "h-10" : "h-8";
  const platformColor = isFirst ? "bg-amber/25" : rank === 2 ? "bg-fg/10" : "bg-[#cd7f32]/20";

  return (
    <div className="flex w-20 flex-col items-center sm:w-24">
      {isFirst && (
        <svg viewBox="0 0 24 16" className="mb-1 h-4 w-6">
          <path
            d="M2 14 L2 6 L6 10 L12 3 L18 10 L22 6 L22 14 Z"
            fill="#f5a623"
            stroke="#0f1115"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </svg>
      )}
      <Avatar entry={entry} className={`${avatarSize} ring-2 ${ringColor}`} />
      <p className="mt-2 w-full truncate text-center text-sm font-medium text-fg">{entry.name}</p>
      <span className="mt-1 rounded-full bg-amber/15 px-2.5 py-0.5 text-xs font-semibold text-amber">
        {entry.count}
      </span>
      <div className={`mt-3 w-full rounded-t-[6px] ${platformHeight} ${platformColor}`} />
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

        <div className="rounded-[10px] border border-line bg-panel p-5">
          <h2 className="font-medium text-fg">Leaderboard</h2>
          <p className="mt-0.5 text-sm text-muted">Most cases generated in {monthLabel}.</p>

          {leaderboard.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No cases generated yet this month.</p>
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
                      className="flex items-center justify-between rounded-[8px] border border-line bg-panel-raised/40 px-3 py-2"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-panel-raised text-xs font-semibold text-muted">
                          {i + 4}
                        </span>
                        <Avatar entry={entry} className="h-8 w-8 text-xs" />
                        <span className="text-sm font-medium text-fg">{entry.name}</span>
                      </div>
                      <span className="text-sm font-semibold text-amber">
                        {entry.count} {entry.count === 1 ? "case" : "cases"}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
