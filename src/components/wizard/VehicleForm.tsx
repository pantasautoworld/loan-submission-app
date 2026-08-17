"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { saveVehicle } from "@/app/submissions/[id]/edit/actions";
import {
  fetchStockBoardVehicles,
  findByPlate,
  splitVehicleYearAndModel,
  type StockBoardVehicle,
} from "@/lib/stockBoard";
import type { SubmissionRow } from "@/lib/types";

const FIELD =
  "w-full rounded-[7px] border border-line bg-panel-raised px-2 py-1.5 text-sm text-fg outline-none focus:border-amber";
const LABEL = "mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted";

interface Props {
  submissionId: string;
  submission: SubmissionRow;
  onVehicleFieldsChange?: (fields: {
    no_plate: string;
    stock_board_vehicle_id: string | null;
    model: string;
    year_made: number | null;
    finance_loan: number | null;
    tenure_year: number | null;
  }) => void;
  onSaved?: () => void;
}

export function VehicleForm({
  submissionId,
  submission,
  onVehicleFieldsChange,
  onSaved,
}: Props) {
  const [noPlate, setNoPlate] = useState(submission.no_plate ?? "");
  const [fields, setFields] = useState({
    stock_board_vehicle_id: submission.stock_board_vehicle_id,
    model: submission.model ?? "",
    year_made: submission.year_made,
    finance_loan: submission.finance_loan,
    tenure_year: submission.tenure_year,
  });
  const [isPending, startTransition] = useTransition();
  const [boardVehicles, setBoardVehicles] = useState<StockBoardVehicle[]>([]);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [boardLoading, setBoardLoading] = useState(true);

  useEffect(() => {
    fetchStockBoardVehicles()
      .then(setBoardVehicles)
      .catch((err) => setBoardError(err instanceof Error ? err.message : "Failed to load Stock Board"))
      .finally(() => setBoardLoading(false));
  }, []);

  const match = useMemo(() => findByPlate(noPlate, boardVehicles), [boardVehicles, noPlate]);

  function applyMatch() {
    if (!match) return;
    const { yearMade, model } = splitVehicleYearAndModel(match.vehicle);
    setFields((f) => ({
      ...f,
      stock_board_vehicle_id: match.id,
      model,
      year_made: yearMade ?? f.year_made,
      finance_loan: match.price ? Number(match.price) : f.finance_loan,
      tenure_year: match.tahun ? Number(match.tahun) : f.tenure_year,
    }));
  }

  function set<K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  function save() {
    startTransition(async () => {
      const finalFields = { ...fields, no_plate: noPlate.toUpperCase() };
      await saveVehicle(submissionId, finalFields);
      onVehicleFieldsChange?.(finalFields);
      onSaved?.();
    });
  }

  return (
    <div className="space-y-4">
      <h3 className="font-medium text-fg">Vehicle</h3>

      <div>
        <label className={LABEL}>No Plate</label>
        <div className="flex gap-2">
          <input
            className={FIELD}
            value={noPlate}
            onChange={(e) => setNoPlate(e.target.value)}
          />
          <button
            type="button"
            disabled={!match}
            onClick={applyMatch}
            className="whitespace-nowrap rounded-[7px] border border-line px-3 py-1.5 text-sm text-fg hover:border-amber disabled:opacity-40"
          >
            {match ? "Use Stock Board price" : boardLoading ? "Loading Stock Board…" : "No match"}
          </button>
        </div>
        {boardError && <p className="mt-1 text-xs text-danger">Stock Board: {boardError}</p>}
        {match && (
          <p className="mt-1 text-xs text-muted">
            Stock Board: {match.vehicle} · Finance RM{match.price} · {match.tahun}yr ·{" "}
            <span className="capitalize">{match.status}</span>
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL}>Car Model</label>
          <input className={FIELD} value={fields.model} onChange={(e) => set("model", e.target.value)} />
        </div>
        <div>
          <label className={LABEL}>Year Made</label>
          <input
            type="number"
            className={FIELD}
            value={fields.year_made ?? ""}
            onChange={(e) => set("year_made", e.target.value ? Number(e.target.value) : null)}
          />
        </div>

        <div>
          <label className={LABEL}>Finance Loan</label>
          <input
            type="number"
            className={FIELD}
            value={fields.finance_loan ?? ""}
            onChange={(e) => set("finance_loan", e.target.value ? Number(e.target.value) : null)}
          />
        </div>
        <div>
          <label className={LABEL}>Tenure (Year)</label>
          <input
            type="number"
            className={FIELD}
            value={fields.tenure_year ?? ""}
            onChange={(e) => set("tenure_year", e.target.value ? Number(e.target.value) : null)}
          />
        </div>
      </div>

      <button
        onClick={save}
        disabled={isPending}
        className="rounded-[7px] bg-amber px-4 py-2 text-sm font-semibold text-amber-fg hover:brightness-110 disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Save & Continue"}
      </button>
    </div>
  );
}
