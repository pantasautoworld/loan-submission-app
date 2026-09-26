import type { SupabaseClient } from "@supabase/supabase-js";

export interface SigningBookingRow {
  id: string;
  stock_board_vehicle_id: string;
  no_plate: string;
  vehicle: string;
  claim_invoice_id: string | null;
  buyer_name: string;
  financier: string;
  loan_amount: number | null;
  interest_rate: number | null;
  tenure_months: number | null;
  monthly_installment: number | null;
  retention_amount: number;
  appointment_date: string;
  appointment_time: string | null;
  runner_id: string | null;
  runner_name: string;
  status: "scheduled" | "completed";
  remark: string;
  photo_path: string | null;
  created_by_name: string;
  created_at: string;
  completed_by_name: string | null;
  completed_at: string | null;
}

export async function fetchSigningBookings(supabase: SupabaseClient): Promise<SigningBookingRow[]> {
  const { data, error } = await supabase
    .from("signing_bookings")
    .select("*")
    .order("appointment_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SigningBookingRow[];
}

export async function fetchSigningBookingsForRunner(
  supabase: SupabaseClient,
  runnerId: string
): Promise<SigningBookingRow[]> {
  const { data, error } = await supabase
    .from("signing_bookings")
    .select("*")
    .eq("runner_id", runnerId)
    .order("appointment_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SigningBookingRow[];
}

export interface ClaimInvoiceAutoFill {
  claimInvoiceId: string;
  buyerName: string;
  financier: string;
  loanAmount: number | null;
  vehicle: string;
}

/** Looks up the latest claim invoice for this plate, if any, to auto-fill a new signing booking. */
export async function findLatestClaimInvoiceByPlate(
  supabase: SupabaseClient,
  plate: string
): Promise<ClaimInvoiceAutoFill | null> {
  const normalized = plate.trim().toUpperCase().replace(/\s+/g, "");
  const { data, error } = await supabase
    .from("claim_invoices")
    .select("id, buyer_name, financier, loan_amount, model, vehicle_no")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const match = (data ?? []).find(
    (row) => (row.vehicle_no ?? "").toUpperCase().replace(/\s+/g, "") === normalized
  );
  if (!match) return null;
  return {
    claimInvoiceId: match.id,
    buyerName: match.buyer_name ?? "",
    financier: match.financier ?? "",
    loanAmount: match.loan_amount ?? null,
    vehicle: match.model ?? "",
  };
}
