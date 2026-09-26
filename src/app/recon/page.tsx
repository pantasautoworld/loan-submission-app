import { requireStaff } from "@/lib/auth";
import { TopNav } from "@/components/TopNav";
import { fetchStockBoardVehicles } from "@/lib/stockBoard";
import {
  fetchCarLocations,
  fetchConditionItems,
  fetchConditionMedia,
  fetchReconTasks,
  fetchReconTasksForRunner,
  fetchRunnerProfiles,
  fetchRunnerTimeLogs,
} from "@/lib/recon";
import { fetchSigningBookings, fetchSigningBookingsForRunner } from "@/lib/signingBookings";
import { fetchPuspakomBookings } from "@/lib/puspakomBookings";
import { ReconApp } from "@/components/recon/ReconApp";
import { RunnerTaskBoard } from "@/components/recon/RunnerTaskBoard";

export default async function ReconPage() {
  const { profile, supabase } = await requireStaff();

  if (profile.role === "runner") {
    const [allVehicles, checklistItems, checklistMedia, reconTasks, signingBookings, allPuspakom, timeLogs] = await Promise.all([
      fetchStockBoardVehicles(),
      fetchConditionItems(supabase),
      fetchConditionMedia(supabase),
      fetchReconTasksForRunner(supabase, profile.id),
      fetchSigningBookingsForRunner(supabase, profile.id),
      fetchPuspakomBookings(supabase),
      fetchRunnerTimeLogs(supabase, profile.id),
    ]);
    const vehicles = allVehicles.filter((v) => v.status !== "sold");
    const puspakomBookings = allPuspakom.filter((b) => b.runner_id === profile.id);

    return (
      <>
        <TopNav staffName={profile.full_name} role={profile.role} breadcrumb={["My Tasks"]} />
        <RunnerTaskBoard
          vehicles={vehicles}
          checklistItems={checklistItems}
          checklistMedia={checklistMedia}
          reconTasks={reconTasks}
          signingBookings={signingBookings}
          puspakomBookings={puspakomBookings}
          timeLogs={timeLogs}
        />
      </>
    );
  }

  const [allVehicles, carLocations, reconTasks, conditionMedia, timeLogs, signingBookings, puspakomBookings, runners] =
    await Promise.all([
      fetchStockBoardVehicles(),
      fetchCarLocations(supabase),
      fetchReconTasks(supabase),
      fetchConditionMedia(supabase),
      fetchRunnerTimeLogs(supabase),
      fetchSigningBookings(supabase),
      fetchPuspakomBookings(supabase),
      fetchRunnerProfiles(supabase),
    ]);
  const vehicles = allVehicles.filter((v) => v.status !== "sold");

  return (
    <>
      <TopNav staffName={profile.full_name} role={profile.role} breadcrumb={["Car Condition & Location"]} />
      <ReconApp
        vehicles={vehicles}
        carLocations={carLocations}
        reconTasks={reconTasks}
        conditionMedia={conditionMedia}
        timeLogs={timeLogs}
        signingBookings={signingBookings}
        puspakomBookings={puspakomBookings}
        runners={runners}
      />
    </>
  );
}
