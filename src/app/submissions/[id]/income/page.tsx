import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { TopNav } from "@/components/TopNav";
import { IncomeSubmissionView } from "@/components/income/IncomeSubmissionView";
import type { PersonRow, DocumentRow } from "@/lib/types";

export default async function IncomeDocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profile, supabase } = await requireAdmin();

  const [{ data: submission }, { data: persons }, { data: documents }] = await Promise.all([
    supabase.from("submissions").select("*").eq("id", id).single(),
    supabase.from("persons").select("*").eq("submission_id", id),
    supabase.from("documents").select("*").eq("submission_id", id),
  ]);

  if (!submission) notFound();

  const hasGuarantor2 = (persons ?? []).some((p) => p.role === "guarantor2");

  return (
    <div className="flex flex-1 flex-col">
      <TopNav
        staffName={profile.full_name}
        role={profile.role}
        breadcrumb={["Submissions", "Income Documents"]}
      />
      <main className="mx-auto w-full max-w-5xl flex-1 p-6">
        {submission.status !== "generated" ? (
          <div className="space-y-3 rounded-[10px] border border-line bg-panel p-6">
            <h1 className="font-display text-xl text-fg">Income Documents</h1>
            <p className="text-sm text-muted">
              This becomes available once the main application packet has been generated.
            </p>
            <Link
              href={`/submissions/${id}/edit`}
              className="inline-block rounded-[7px] bg-amber px-4 py-2 text-sm font-semibold text-amber-fg hover:brightness-110"
            >
              Go to application
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <h1 className="font-display text-xl text-fg">Income Documents</h1>
            <IncomeSubmissionView
              submissionId={id}
              persons={(persons ?? []) as PersonRow[]}
              documents={(documents ?? []) as DocumentRow[]}
              hasGuarantor2Initially={hasGuarantor2}
            />
          </div>
        )}
      </main>
    </div>
  );
}
