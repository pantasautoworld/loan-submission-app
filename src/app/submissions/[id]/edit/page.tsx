import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { TopNav } from "@/components/TopNav";
import { SubmissionWizard } from "@/components/wizard/SubmissionWizard";
import type { PersonRow, SubmissionRow, DocumentRow } from "@/lib/types";

export default async function EditSubmissionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profile, supabase } = await requireStaff();

  const [{ data: submission }, { data: persons }, { data: documents }] = await Promise.all([
    supabase.from("submissions").select("*").eq("id", id).single(),
    supabase.from("persons").select("*").eq("submission_id", id),
    supabase.from("documents").select("*").eq("submission_id", id),
  ]);

  if (!submission) notFound();

  return (
    <div className="flex flex-1 flex-col">
      <TopNav staffName={profile.full_name} breadcrumb={["Submissions", "Create New Application"]} />
      <main className="mx-auto w-full max-w-5xl flex-1 p-6">
        <SubmissionWizard
          submission={submission as SubmissionRow}
          persons={(persons ?? []) as PersonRow[]}
          documents={(documents ?? []) as DocumentRow[]}
          dealer={{ name: profile.full_name, phone: profile.phone }}
          isAdmin={profile.role === "admin"}
        />
      </main>
    </div>
  );
}
