"use client";

import { useState } from "react";
import { createInvoice } from "@/app/invoices/actions";

const FIELD =
  "w-full rounded-[7px] border border-line bg-panel-raised px-2 py-1.5 text-sm text-fg outline-none focus:border-amber mb-3";
const LABEL = "mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted";

interface Props {
  staffName: string;
}

export function NewInvoiceForm({ staffName }: Props) {
  const [grantFile, setGrantFile] = useState<File | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const [vehicleNo, setVehicleNo] = useState("");
  const [model, setModel] = useState("");
  const [chassisNo, setChassisNo] = useState("");
  const [engineNo, setEngineNo] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");

  const [agentName, setAgentName] = useState(staffName);
  const [financier, setFinancier] = useState("");
  const [term, setTerm] = useState<"Loan" | "Cash">("Loan");
  const [sellingPrice, setSellingPrice] = useState("");
  const [loanAmount, setLoanAmount] = useState("");
  const [depositAmount, setDepositAmount] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleScan() {
    if (!grantFile) {
      setScanError("Choose a grant photo/PDF first.");
      return;
    }
    setScanError(null);
    setScanning(true);
    try {
      const body = new FormData();
      body.append("file", grantFile);
      const res = await fetch("/api/extract/grant", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scan failed");
      if (data.vehicleNo) setVehicleNo(data.vehicleNo);
      if (data.model) setModel(data.model);
      if (data.chassisNo) setChassisNo(data.chassisNo);
      if (data.engineNo) setEngineNo(data.engineNo);
      if (data.ownerName) setBuyerName(data.ownerName);
      if (data.ownerAddress) setBuyerAddress(data.ownerAddress);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Could not scan that file - fill in the fields manually.");
    } finally {
      setScanning(false);
    }
  }

  async function handleSubmit() {
    if (!buyerName.trim()) {
      setError("Enter the buyer's name.");
      return;
    }
    if (!vehicleNo.trim()) {
      setError("Enter the vehicle number.");
      return;
    }
    const priceNum = Number(sellingPrice);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      setError("Enter a valid selling price.");
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      const formData = new FormData();
      formData.set("agentName", agentName.trim());
      formData.set("financier", financier.trim());
      formData.set("term", term);
      formData.set("buyerName", buyerName.trim());
      formData.set("buyerAddress", buyerAddress.trim());
      formData.set("vehicleNo", vehicleNo.trim());
      formData.set("model", model.trim());
      formData.set("chassisNo", chassisNo.trim());
      formData.set("engineNo", engineNo.trim());
      formData.set("sellingPrice", sellingPrice);
      formData.set("loanAmount", loanAmount || "0");
      formData.set("depositAmount", depositAmount || "0");
      if (grantFile) formData.set("grant", grantFile);
      await createInvoice(formData);
      // createInvoice redirects to /invoices on success - nothing else to do here.
    } catch (err) {
      // A successful redirect throws internally too, so only real failures land here.
      setError(err instanceof Error ? err.message : "Could not save - try again.");
      setIsSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-[640px] px-6 py-5">
      <div className="rounded-[10px] border border-line bg-panel p-6">
        <h2 className="font-display mb-1 text-lg font-semibold text-fg">1. Scan the vehicle grant</h2>
        <p className="mb-3 text-sm text-muted">
          Upload a photo or PDF of the Vehicle Ownership Certificate - vehicle, chassis, engine no. and the
          owner&apos;s name/address fill in below automatically.
        </p>
        <div className="mb-3 flex flex-wrap items-center gap-2.5">
          <input
            type="file"
            accept="image/*,.pdf"
            onChange={(e) => setGrantFile(e.target.files?.[0] ?? null)}
            className="text-sm text-fg"
          />
          <button
            type="button"
            onClick={handleScan}
            disabled={scanning || !grantFile}
            className="rounded-[7px] border border-line bg-panel-raised px-4 py-1.5 text-sm text-fg hover:border-amber disabled:opacity-50"
          >
            {scanning ? "Scanning…" : "Scan grant"}
          </button>
        </div>
        {scanError && <p className="mb-3 text-xs text-danger">{scanError}</p>}

        <h2 className="font-display mb-3 mt-5 text-lg font-semibold text-fg">2. Vehicle &amp; buyer</h2>

        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className={LABEL}>Vehicle No</label>
            <input className={FIELD} value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>Model</label>
            <input className={FIELD} value={model} onChange={(e) => setModel(e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>Chassis No</label>
            <input className={FIELD} value={chassisNo} onChange={(e) => setChassisNo(e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>Engine No</label>
            <input className={FIELD} value={engineNo} onChange={(e) => setEngineNo(e.target.value)} />
          </div>
        </div>

        <label className={LABEL}>Buyer name</label>
        <input className={FIELD} value={buyerName} onChange={(e) => setBuyerName(e.target.value)} />

        <label className={LABEL}>Buyer address</label>
        <textarea
          className={FIELD}
          rows={2}
          value={buyerAddress}
          onChange={(e) => setBuyerAddress(e.target.value)}
        />

        <h2 className="font-display mb-3 mt-5 text-lg font-semibold text-fg">3. Sale &amp; finance</h2>

        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className={LABEL}>Agent</label>
            <input className={FIELD} value={agentName} onChange={(e) => setAgentName(e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>Term</label>
            <select
              className={FIELD}
              value={term}
              onChange={(e) => setTerm(e.target.value === "Cash" ? "Cash" : "Loan")}
            >
              <option value="Loan">Loan</option>
              <option value="Cash">Cash</option>
            </select>
          </div>
        </div>

        {term === "Loan" && (
          <>
            <label className={LABEL}>Financier</label>
            <input
              className={FIELD}
              value={financier}
              onChange={(e) => setFinancier(e.target.value)}
              placeholder="e.g. ELK DESA CAPITAL SDN BHD"
            />
          </>
        )}

        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className={LABEL}>Selling Price (RM)</label>
            <input
              type="number"
              className={FIELD}
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL}>Deposit Amount (RM)</label>
            <input
              type="number"
              className={FIELD}
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
            />
          </div>
        </div>

        {term === "Loan" && (
          <div>
            <label className={LABEL}>Loan Amount (RM)</label>
            <input
              type="number"
              className={FIELD}
              value={loanAmount}
              onChange={(e) => setLoanAmount(e.target.value)}
            />
          </div>
        )}

        {error && <p className="mb-3 text-xs text-danger">{error}</p>}

        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSaving}
            className="rounded-[7px] bg-amber px-4 py-2 text-sm font-semibold text-amber-fg hover:brightness-110 disabled:opacity-50"
          >
            {isSaving ? "Generating…" : "Generate invoice"}
          </button>
        </div>
      </div>
    </div>
  );
}
