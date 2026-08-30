import type { SupabaseClient } from "@supabase/supabase-js";

export interface LeaderboardEntry {
  name: string;
  count: number;
  photoUrl: string | null;
}

export interface LeaderboardSubmissionDetail {
  ticketNo: string | null;
  hirerName: string;
  plate: string;
  model: string;
  staffName: string;
  submittedAt: string;
}

export interface LeaderboardData {
  /** Top 10 staff by cases submitted that month - what the homepage podium/list shows. */
  leaderboard: LeaderboardEntry[];
  /** Every submitted case that month, one row each - for the downloadable PDF, not capped to top 10. */
  details: LeaderboardSubmissionDetail[];
}

/**
 * Shared by the homepage leaderboard and its downloadable PDF (see
 * /api/leaderboard/summary-pdf) so the ranking shown on screen and the one
 * in the report can't drift apart. Counts submissions the admin has
 * actually marked "Submitted" (to the credit company) in [monthStart,
 * monthEnd) - not just generated - credited to the staff who created them.
 */
export async function fetchLeaderboardData(
  supabase: SupabaseClient,
  monthStart: string,
  monthEnd: string
): Promise<LeaderboardData> {
  const { data: subs } = await supabase
    .from("submissions")
    .select(
      "created_by, no_plate, model, ticket_no, submitted_at, profiles:created_by(full_name, avatar_path), persons(name, role)"
    )
    .not("submitted_at", "is", null)
    .gte("submitted_at", monthStart)
    .lt("submitted_at", monthEnd);

  const counts = new Map<string, LeaderboardEntry>();
  const details: LeaderboardSubmissionDetail[] = [];

  for (const s of subs ?? []) {
    const profileRow = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
    const profile = profileRow as { full_name: string; avatar_path: string | null } | null;
    const staffName = profile?.full_name || "Unknown";

    if (s.created_by) {
      const photoUrl = profile?.avatar_path
        ? supabase.storage.from("staff-photos").getPublicUrl(profile.avatar_path).data.publicUrl
        : null;
      const entry = counts.get(s.created_by) ?? { name: staffName, count: 0, photoUrl };
      entry.count += 1;
      counts.set(s.created_by, entry);
    }

    const persons = (Array.isArray(s.persons) ? s.persons : []) as { name: string; role: string }[];
    const hirer = persons.find((p) => p.role === "hirer");

    details.push({
      ticketNo: (s.ticket_no as string | null) ?? null,
      hirerName: hirer?.name || "-",
      plate: (s.no_plate as string) || "-",
      model: (s.model as string) || "-",
      staffName,
      submittedAt: s.submitted_at as string,
    });
  }

  const leaderboard = [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 10);
  details.sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || ""));

  return { leaderboard, details };
}
