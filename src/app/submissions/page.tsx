import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { TopNav } from "@/components/TopNav";
import { DownloadLink } from "@/components/DownloadLink";
import { DeleteSubmissionButton } from "@/components/DeleteSubmissionButton";
import { SubmitButton } from "@/components/SubmitButton";
import { UndoSubmitButton } from "@/components/UndoSubmitButton";
import { SubmissionsMonthPicker } from "@/components/SubmissionsMonthPicker";
import { MALAYSIA_TZ, malaysiaDateParts, malaysiaMonthStartIso } from "@/lib/timezone";

/**
 * This page renders server-side, where the host's system timezone (UTC on
 * Railway) isn't Malaysia's - format explicitly so "Created" always shows
 * Malaysia time regardless of where the server runs.
 */
function formatMalaysiaDateTime(iso: string): string {
  const date = new Date(iso);
  const datePart = date.toLocaleDateString("en-MY", { timeZone: MALAYSIA_TZ });
  const timePart = date.toLocaleTimeString("en-MY", {
    timeZone: MALAYSIA_TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${datePart} ${timePart}`;
}

export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { profile, supabase } = await requireStaff();
  const { month: monthParam } = await searchParams;

  // Computed in Malaysia time (not the server's own UTC) so "this month" matches
  // what staff actually mean, especially near a day/month boundary.
  const { year: currentYear, month: currentMonth } = malaysiaDateParts();

  // The dropdown only ever offers the last 12 months, but validate anyway in
  // case someone edits the URL by hand - anything unparseable or in the
  // future just falls back to the current month.
  let myYear = currentYear;
  let myMonth = currentMonth;
  const parsedMonth = monthParam?.match(/^(\d{4})-(\d{2})$/);
  if (parsedMonth) {
    const y = Number(parsedMonth[1]);
    const m = Number(parsedMonth[2]);
    if (y < currentYear || (y === currentYear && m <= currentMonth)) {
      myYear = y;
      myMonth = m;
    }
  }

  const monthStart = malaysiaMonthStartIso(myYear, myMonth);
  const monthEnd = malaysiaMonthStartIso(myYear, myMonth + 1);
  const monthLabel = new Date(Date.UTC(myYear, myMonth - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(currentYear, currentMonth - 1 - i, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    return {
      value: `${y}-${String(m).padStart(2, "0")}`,
      label: d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
    };
  });

  const { data: submissions } = await supabase
    .from("submissions")
    .select(
      "id, ticket_no, status, submitted_at, no_plate, model, created_at, created_by, profiles:created_by(full_name), persons(role, name), generated_documents(pdf_path, generated_at, kind)"
    )
    .gte("created_at", monthStart)
    .lt("created_at", monthEnd)
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-1 flex-col">
      <TopNav staffName={profile.full_name} role={profile.role} breadcrumb={["Submissions"]} />
      <main className="mx-auto w-full max-w-[1200px] flex-1 space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <h1 className="font-display text-xl text-fg">Submissions</h1>
          <div className="flex items-center gap-2.5">
            <SubmissionsMonthPicker options={monthOptions} value={`${myYear}-${String(myMonth).padStart(2, "0")}`} />
            <Link
              href="/submissions/new"
              className="rounded-[7px] bg-amber px-3 py-1.5 text-sm font-semibold text-amber-fg hover:brightness-110"
            >
              New Submission
            </Link>
          </div>
        </div>

        <div className="overflow-x-auto rounded-[10px] border border-line bg-panel">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">Ticket No</th>
                <th className="px-3 py-2">Hirer</th>
                <th className="px-3 py-2">Vehicle</th>
                <th className="px-3 py-2">Staff</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Submitted</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(submissions ?? []).map((s) => {
                const hirer = (s.persons as { role: string; name: string }[] | null)?.find(
                  (p) => p.role === "hirer"
                );
                const staff = (s.profiles as unknown as { full_name: string } | null)?.full_name;
                const latestDoc = (
                  s.generated_documents as
                    | { pdf_path: string; generated_at: string; kind: string }[]
                    | null
                )
                  ?.filter((d) => d.kind === "main")
                  .sort((a, b) => (a.generated_at < b.generated_at ? 1 : -1))[0];

                return (
                  <tr key={s.id}>
                    <td className="px-3 py-2 font-mono text-fg">{s.ticket_no ?? "-"}</td>
                    <td className="px-3 py-2">
                      <Link href={`/submissions/${s.id}/edit`} className="text-amber hover:underline">
                        {hirer?.name || "(unnamed)"}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-fg">
                      {s.no_plate} {s.model}
                    </td>
                    <td className="px-3 py-2 text-fg">{staff ?? "-"}</td>
                    <td className="px-3 py-2 capitalize text-fg">{s.status}</td>
                    <td className="px-3 py-2">
                      {s.submitted_at ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-success">
                            ✓ {formatMalaysiaDateTime(s.submitted_at)}
                          </span>
                          {profile.role === "admin" && (
                            <UndoSubmitButton
                              submissionId={s.id}
                              label={hirer?.name || "(unnamed)"}
                              ticketNo={s.ticket_no}
                            />
                          )}
                        </div>
                      ) : s.status === "generated" && profile.role === "admin" ? (
                        <SubmitButton submissionId={s.id} label={hirer?.name || "(unnamed)"} />
                      ) : (
                        <span className="text-xs text-muted">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-fg">
                      {formatMalaysiaDateTime(s.created_at)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-3">
                        {latestDoc && <DownloadLink path={latestDoc.pdf_path} />}
                        {s.status === "generated" && profile.role === "admin" && (
                          <Link
                            href={`/submissions/${s.id}/income`}
                            className="text-xs text-amber hover:underline"
                          >
                            Income Documents
                          </Link>
                        )}
                        <DeleteSubmissionButton
                          submissionId={s.id}
                          label={hirer?.name || "(unnamed)"}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {(!submissions || submissions.length === 0) && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-muted">
                    No submissions created in {monthLabel}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
