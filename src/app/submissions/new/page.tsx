import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";

export default async function NewSubmissionPage({
  searchParams,
}: {
  searchParams: Promise<{ plate?: string }>;
}) {
  const { supabase, user } = await requireStaff();
  const { plate } = await searchParams;

  const { data, error } = await supabase
    .from("submissions")
    .insert({ created_by: user.id, no_plate: plate ? plate.toUpperCase() : "" })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to start a new submission");
  }

  redirect(`/submissions/${data.id}/edit`);
}
