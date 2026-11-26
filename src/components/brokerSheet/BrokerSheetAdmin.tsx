"use client";

import { useMemo, useState, useTransition } from "react";
import {
  addBrokerAction,
  addColumnAction,
  deleteBrokerAction,
  deleteColumnAction,
  regenerateBrokerKeyAction,
  reorderColumnsAction,
  saveSheetSettingsAction,
  setBrokerActiveAction,
  setCustomValuesAction,
  updateBrokerAction,
  updateColumnAction,
  type CellInput,
  type CellResult,
} from "@/app/broker-sheet/actions";
import {
  BROKER_FIELDS,
  CUSTOM_FORMAT_LABEL,
  STOCK_STATUSES,
  STOCK_STATUS_LABEL,
  safeLink,
  type BrokerRow,
  type BrokerSheetColumn,
  type BrokerSheetSettings,
  type CustomColumnFormat,
} from "@/lib/brokerSheetShared";

export interface AdminCar {
  id: string;
  plate: string;
  vehicle: string;
  status: string;
  /** Stock Board figures, shown for reference next to your own columns. */
  loan: string;
  deposit: string;
}

const fmtRef = (v: string) => {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return v && Number.isFinite(n) ? n.toLocaleString("en-MY") : "—";
};

interface Props {
  brokers: BrokerRow[];
  settings: BrokerSheetSettings;
  columns: BrokerSheetColumn[];
  values: { column_id: string; vehicle_id: string; value: string }[];
  cars: AdminCar[];
  stockBoardError: boolean;
}

const CARD = "rounded-[10px] border border-line bg-panel p-5";
const INPUT =
  "rounded-[7px] border border-line bg-panel-raised px-2 py-1.5 text-sm text-fg outline-none focus:border-amber";
const BTN = "rounded-[7px] border border-line bg-panel-raised px-2.5 py-1 text-xs text-fg hover:border-amber disabled:opacity-40";
const H2 = "font-display mb-1 text-lg font-semibold text-fg";

function fmtSeen(iso: string | null): string {
  if (!iso) return "never opened";
  return `last opened ${new Date(iso).toLocaleString("en-MY", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kuala_Lumpur",
  })}`;
}

export function BrokerSheetAdmin({ brokers, settings, columns, values, cars, stockBoardError }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error);
    });
  }

  async function copy(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt("Copy this link:", text);
    }
    setCopiedKey(id);
    setTimeout(() => setCopiedKey((k) => (k === id ? null : k)), 2500);
  }

  /** Full link for a broker; built on click, since the site address is only known in the browser. */
  const fullLink = (path: string) => `${window.location.origin}${path}`;

  // ---------- Brokers ----------
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  // ---------- Settings ----------
  const [title, setTitle] = useState(settings.title);
  const [statuses, setStatuses] = useState<string[]>(settings.statuses);
  const settingsDirty =
    title !== settings.title || [...statuses].sort().join() !== [...settings.statuses].sort().join();

  // ---------- Columns ----------
  const [addChoice, setAddChoice] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [customFormat, setCustomFormat] = useState<CustomColumnFormat>("text");
  const usedFields = new Set(columns.map((c) => c.field).filter(Boolean));
  const unusedFields = Object.entries(BROKER_FIELDS).filter(([key]) => !usedFields.has(key));

  function move(index: number, delta: -1 | 1) {
    const ids = columns.map((c) => c.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    run(() => reorderColumnsAction(ids));
  }

  // ---------- Custom values ----------
  const customColumns = columns.filter((c) => c.kind === "custom");
  // What each cell shows (being typed) and what was last saved, keyed "columnId|vehicleId".
  const [cellValues, setCellValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(values.map((v) => [`${v.column_id}|${v.vehicle_id}`, v.value]))
  );
  const [savedValues, setSavedValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(values.map((v) => [`${v.column_id}|${v.vehicle_id}`, v.value]))
  );
  const [cellState, setCellState] = useState<Record<string, "saving" | "saved" | "error">>({});
  const [pasteNote, setPasteNote] = useState<string | null>(null);
  const [carSearch, setCarSearch] = useState("");
  const shownCars = useMemo(() => {
    const q = carSearch.trim().toLowerCase();
    return cars
      .filter((c) => settings.statuses.includes(c.status))
      .filter((c) => !q || c.plate.toLowerCase().includes(q) || c.vehicle.toLowerCase().includes(q));
  }, [cars, carSearch, settings.statuses]);

  /** Saves cells (one typed cell or a pasted block) and shows each one's result. */
  async function saveCells(cells: CellInput[]): Promise<CellResult[]> {
    if (cells.length === 0) return [];
    const keys = cells.map((c) => `${c.columnId}|${c.vehicleId}`);
    setCellState((s) => ({ ...s, ...Object.fromEntries(keys.map((k) => [k, "saving" as const])) }));
    let results: CellResult[];
    try {
      results = await setCustomValuesAction(cells);
    } catch {
      results = cells.map((c) => ({ ...c, ok: false, error: "Could not save - check your connection." }));
    }
    const nextState: Record<string, "saved" | "error"> = {};
    const saved: Record<string, string> = {};
    for (const r of results) {
      const k = `${r.columnId}|${r.vehicleId}`;
      nextState[k] = r.ok ? "saved" : "error";
      if (r.ok) saved[k] = r.value;
    }
    setCellState((s) => ({ ...s, ...nextState }));
    setSavedValues((m) => ({ ...m, ...saved }));
    setCellValues((m) => ({ ...m, ...saved })); // show the cleaned value, e.g. "RM 3,500" -> 3500
    const firstError = results.find((r) => !r.ok);
    if (firstError && !firstError.ok) setError(firstError.error);
    return results;
  }

  function saveCell(columnId: string, vehicleId: string, value: string) {
    const k = `${columnId}|${vehicleId}`;
    if (value.trim() === (savedValues[k] ?? "") && cellState[k] !== "error") return;
    void saveCells([{ columnId, vehicleId, value }]);
  }

  /** Paste from Excel: fills down (and right) from the cell you pasted into, one car per row. */
  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>, rowIndex: number, colIndex: number) {
    const text = e.clipboardData.getData("text/plain");
    if (!/[\t\r\n]/.test(text.replace(/[\r\n]+$/, ""))) return; // a single value: let the input paste it normally
    e.preventDefault();
    const lines = text.replace(/[\r\n]+$/, "").split(/\r?\n/);
    const cells: CellInput[] = [];
    lines.forEach((line, i) => {
      const car = shownCars[rowIndex + i];
      if (!car) return;
      line.split("\t").forEach((value, j) => {
        const column = customColumns[colIndex + j];
        if (column) cells.push({ columnId: column.id, vehicleId: car.id, value });
      });
    });
    setCellValues((m) => ({ ...m, ...Object.fromEntries(cells.map((c) => [`${c.columnId}|${c.vehicleId}`, c.value.trim()])) }));
    const skipped = Math.max(0, rowIndex + lines.length - shownCars.length);
    setPasteNote(null);
    void saveCells(cells).then((results) => {
      const bad = results.filter((r) => !r.ok).length;
      setPasteNote(
        `Pasted ${results.length - bad} cell${results.length - bad === 1 ? "" : "s"}` +
          (bad ? `, ${bad} not saved (marked red)` : "") +
          (skipped ? `; ${skipped} row${skipped === 1 ? "" : "s"} went past the last car and were ignored` : "") +
          "."
      );
    });
  }

  /** Enter moves down to the same column on the next car, like Excel. */
  function handleCellKey(e: React.KeyboardEvent<HTMLInputElement>, rowIndex: number, colIndex: number) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const next = document.querySelector<HTMLInputElement>(
      `[data-cell="${rowIndex + (e.shiftKey ? -1 : 1)}-${colIndex}"]`
    );
    if (next) next.focus();
    else e.currentTarget.blur();
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-fg">Broker Sheet</h1>
        <p className="text-sm text-muted">
          Outside brokers see a live, read-only stock list through their own link (phone page + Excel). They never get a
          login or see the Stock Board.
        </p>
      </div>

      {error && <p className="rounded-[7px] border border-danger px-3 py-2 text-sm text-danger">{error}</p>}
      {stockBoardError && <p className="text-sm text-danger">Could not reach the Stock Board - the car list below is empty.</p>}

      {/* ---------- Brokers ---------- */}
      <section className={CARD}>
        <h2 className={H2}>Brokers</h2>
        <p className="mb-4 text-xs text-muted">
          Each broker gets a personal link. <b>Block</b> stops it working at once; <b>New link</b> replaces it if it was
          shared.
        </p>

        <form
          className="mb-4 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const r = await addBrokerAction(newName, newPhone);
              if (r.ok) {
                setNewName("");
                setNewPhone("");
              }
              return r;
            });
          }}
        >
          <input className={`${INPUT} flex-1 min-w-[180px]`} placeholder="Broker name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <input className={`${INPUT} w-40`} placeholder="Phone (optional)" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
          <button
            type="submit"
            disabled={isPending || !newName.trim()}
            className="rounded-[7px] bg-amber px-4 py-1.5 text-sm font-semibold text-amber-fg hover:brightness-110 disabled:opacity-40"
          >
            + Add broker
          </button>
        </form>

        {brokers.length === 0 ? (
          <p className="text-sm text-muted">No brokers yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {brokers.map((b) => {
              const phonePath = `/broker/${b.access_key}`;
              return (
                <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                  <div className="min-w-[200px] flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold ${b.is_active ? "text-fg" : "text-muted line-through"}`}>{b.name}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                          b.is_active ? "bg-success text-[#0d0f12]" : "bg-danger text-white"
                        }`}
                      >
                        {b.is_active ? "Active" : "Blocked"}
                      </span>
                    </div>
                    <div className="text-xs text-muted">
                      {[b.phone, fmtSeen(b.last_seen_at)].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {b.is_active && (
                      <>
                        <button className={BTN} onClick={() => copy(fullLink(phonePath), `${b.id}-p`)}>
                          {copiedKey === `${b.id}-p` ? "Copied ✓" : "Copy phone link"}
                        </button>
                        <button className={BTN} onClick={() => copy(fullLink(`${phonePath}/excel`), `${b.id}-x`)}>
                          {copiedKey === `${b.id}-x` ? "Copied ✓" : "Copy Excel link"}
                        </button>
                        <a className={BTN} href={phonePath} target="_blank" rel="noreferrer">
                          Open
                        </a>
                      </>
                    )}
                    <button
                      className={BTN}
                      disabled={isPending}
                      onClick={() => {
                        const name = window.prompt("Broker name", b.name);
                        if (name === null) return;
                        const phone = window.prompt("Phone (optional)", b.phone) ?? b.phone;
                        run(() => updateBrokerAction(b.id, name, phone));
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className={BTN}
                      disabled={isPending}
                      onClick={() => run(() => setBrokerActiveAction(b.id, !b.is_active))}
                    >
                      {b.is_active ? "Block" : "Unblock"}
                    </button>
                    <button
                      className={BTN}
                      disabled={isPending}
                      onClick={() => {
                        if (confirm(`Give ${b.name} a new link? Their current link stops working immediately.`))
                          run(() => regenerateBrokerKeyAction(b.id));
                      }}
                    >
                      New link
                    </button>
                    <button
                      className={`${BTN} text-danger`}
                      disabled={isPending}
                      onClick={() => {
                        if (confirm(`Delete ${b.name}? Their link stops working. (Use Block if you may want them back.)`))
                          run(() => deleteBrokerAction(b.id));
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ---------- Sheet setup ---------- */}
      <section className={CARD}>
        <h2 className={H2}>What brokers see</h2>
        <p className="mb-4 text-xs text-muted">Changes reach every broker within a minute.</p>

        <div className="mb-5 flex flex-wrap items-end gap-4">
          <label className="text-xs text-muted">
            Sheet title
            <input className={`${INPUT} mt-1 block w-56`} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <fieldset className="text-xs text-muted">
            <legend className="mb-1">Cars to show</legend>
            <div className="flex flex-wrap gap-3">
              {STOCK_STATUSES.map((s) => (
                <label key={s} className="flex items-center gap-1.5 text-sm text-fg">
                  <input
                    type="checkbox"
                    checked={statuses.includes(s)}
                    onChange={(e) =>
                      setStatuses((cur) => (e.target.checked ? [...cur, s] : cur.filter((x) => x !== s)))
                    }
                  />
                  {STOCK_STATUS_LABEL[s]}
                </label>
              ))}
            </div>
          </fieldset>
          <button
            disabled={!settingsDirty || isPending}
            onClick={() => run(() => saveSheetSettingsAction(title, statuses))}
            className="rounded-[7px] bg-amber px-4 py-1.5 text-sm font-semibold text-amber-fg hover:brightness-110 disabled:opacity-40"
          >
            Save
          </button>
        </div>

        <h3 className="mb-2 text-sm font-semibold text-fg">Columns (left to right)</h3>
        <ul className="mb-4 divide-y divide-line rounded-[7px] border border-line">
          {columns.map((c, i) => {
            const def = c.field ? BROKER_FIELDS[c.field] : null;
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <div className="flex gap-1">
                  <button className={BTN} disabled={i === 0 || isPending} onClick={() => move(i, -1)} aria-label="Move left">
                    ↑
                  </button>
                  <button
                    className={BTN}
                    disabled={i === columns.length - 1 || isPending}
                    onClick={() => move(i, 1)}
                    aria-label="Move right"
                  >
                    ↓
                  </button>
                </div>
                <input
                  key={`${c.id}-${c.label}`}
                  className={`${INPUT} min-w-[180px] flex-1`}
                  defaultValue={c.label}
                  onBlur={(e) => {
                    if (e.target.value.trim() !== c.label) run(() => updateColumnAction(c.id, { label: e.target.value }));
                  }}
                />
                {c.kind === "custom" ? (
                  <label className="flex w-52 items-center gap-1.5 text-xs text-muted">
                    Your column:
                    <select
                      className={`${INPUT} py-1 text-xs`}
                      value={c.format}
                      disabled={isPending}
                      onChange={(e) => run(() => updateColumnAction(c.id, { format: e.target.value as CustomColumnFormat }))}
                    >
                      {Object.entries(CUSTOM_FORMAT_LABEL).map(([f, label]) => (
                        <option key={f} value={f}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <span className="w-52 text-xs text-muted">
                    Stock Board: {def?.label ?? c.field}
                    {def?.internal && <span className="ml-1 text-danger">internal</span>}
                  </span>
                )}
                <label className="flex items-center gap-1.5 text-sm text-fg">
                  <input
                    type="checkbox"
                    checked={c.visible}
                    disabled={isPending}
                    onChange={(e) => run(() => updateColumnAction(c.id, { visible: e.target.checked }))}
                  />
                  Show
                </label>
                <button
                  className={`${BTN} text-danger`}
                  disabled={isPending}
                  onClick={() => {
                    const warn = c.kind === "custom" ? " Everything typed in this column is deleted too." : "";
                    if (confirm(`Remove the "${c.label}" column?${warn}`)) run(() => deleteColumnAction(c.id));
                  }}
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap items-center gap-2">
          <select className={INPUT} value={addChoice} onChange={(e) => setAddChoice(e.target.value)}>
            <option value="">Add a column…</option>
            <option value="__custom">Your own column (e.g. Broker commission, Remarks)</option>
            {unusedFields.map(([key, def]) => (
              <option key={key} value={key}>
                Stock Board: {def.label}
                {def.internal ? " (internal - careful)" : ""}
              </option>
            ))}
          </select>
          {addChoice === "__custom" && (
            <>
              <input
                className={INPUT}
                placeholder="Column name"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
              />
              <select
                className={INPUT}
                value={customFormat}
                onChange={(e) => setCustomFormat(e.target.value as CustomColumnFormat)}
              >
                {Object.entries(CUSTOM_FORMAT_LABEL).map(([f, label]) => (
                  <option key={f} value={f}>
                    {label}
                  </option>
                ))}
              </select>
            </>
          )}
          <button
            className="rounded-[7px] bg-amber px-4 py-1.5 text-sm font-semibold text-amber-fg hover:brightness-110 disabled:opacity-40"
            disabled={isPending || !addChoice || (addChoice === "__custom" && !customLabel.trim())}
            onClick={() =>
              run(async () => {
                const r =
                  addChoice === "__custom"
                    ? await addColumnAction("custom", customLabel, customFormat)
                    : await addColumnAction("field", addChoice);
                if (r.ok) {
                  setAddChoice("");
                  setCustomLabel("");
                  setCustomFormat("text");
                }
                return r;
              })
            }
          >
            Add
          </button>
        </div>
      </section>

      {/* ---------- Custom values ---------- */}
      {customColumns.length > 0 && (
        <section className={CARD}>
          <h2 className={H2}>Your columns, per car</h2>
          <p className="mb-3 text-xs text-muted">
            Type a value and press Enter or click away to save (Enter moves down to the next car). To fill many at once, copy
            a column from Excel and paste it into the first car&apos;s cell. Showing cars in the statuses brokers see; sold
            cars drop off automatically. Stock Board loan and deposit are shown in grey for reference.
          </p>
          {pasteNote && <p className="mb-3 text-xs text-success">{pasteNote}</p>}
          <input
            type="search"
            className={`${INPUT} mb-3 w-full`}
            placeholder="Search plate or model…"
            value={carSearch}
            onChange={(e) => setCarSearch(e.target.value)}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Plate</th>
                  <th className="px-2 py-1.5 font-medium">Car</th>
                  <th className="px-2 py-1.5 font-medium">Status</th>
                  <th className="px-2 py-1.5 text-right font-medium">SB loan</th>
                  <th className="px-2 py-1.5 text-right font-medium">SB deposit</th>
                  {customColumns.map((c) => (
                    <th key={c.id} className={`px-2 py-1.5 font-medium ${c.format === "money" ? "text-right" : ""}`}>
                      {c.label}
                      {!c.visible && <span className="ml-1 normal-case text-danger">(hidden)</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shownCars.map((car, rowIndex) => (
                  <tr key={car.id} className="border-t border-line">
                    <td className="whitespace-nowrap px-2 py-1.5 font-mono font-semibold text-fg">{car.plate}</td>
                    <td className="px-2 py-1.5 text-fg">{car.vehicle}</td>
                    <td className="px-2 py-1.5 text-xs text-muted">{STOCK_STATUS_LABEL[car.status] ?? car.status}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-xs text-muted">{fmtRef(car.loan)}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-xs text-muted">{fmtRef(car.deposit)}</td>
                    {customColumns.map((c, colIndex) => {
                      const k = `${c.id}|${car.id}`;
                      const state = cellState[k];
                      const link = c.format === "link" ? safeLink(cellValues[k] ?? "") : null;
                      return (
                        <td key={c.id} className="px-2 py-1">
                          <div className="flex items-center gap-1">
                            <input
                              data-cell={`${rowIndex}-${colIndex}`}
                              inputMode={c.format === "money" ? "decimal" : undefined}
                              placeholder={c.format === "link" ? "https://…" : ""}
                              className={`${INPUT} w-full ${c.format === "money" ? "min-w-[100px] text-right font-mono" : "min-w-[140px]"} ${
                                state === "error" ? "border-danger" : state === "saved" ? "border-success" : ""
                              }`}
                              value={cellValues[k] ?? ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                setCellValues((m) => ({ ...m, [k]: val }));
                                setCellState((s) => {
                                  const next = { ...s };
                                  delete next[k];
                                  return next;
                                });
                              }}
                              onPaste={(e) => handlePaste(e, rowIndex, colIndex)}
                              onKeyDown={(e) => handleCellKey(e, rowIndex, colIndex)}
                              onBlur={(e) => saveCell(c.id, car.id, e.target.value)}
                            />
                            {link && (
                              <a href={link} target="_blank" rel="noopener noreferrer" className="text-xs text-amber hover:underline">
                                open
                              </a>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {shownCars.length === 0 && <p className="py-6 text-center text-sm text-muted">No cars match.</p>}
          </div>
        </section>
      )}

      {/* ---------- Setup help ---------- */}
      <section className={CARD}>
        <h2 className={H2}>How brokers use their link</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-fg">
          <li>
            <b>Phone:</b> send them the phone link. It opens as a searchable list that refreshes itself every minute.
          </li>
          <li>
            <b>Excel (computer):</b> Data → From Web → paste the Excel link → Load. Then Data → Queries &amp; Connections →
            right-click the query → Properties → tick <i>Refresh every 1 minutes</i> and <i>Refresh data when opening the file</i>.
          </li>
          <li>
            <b>Google Sheets:</b> <code className="font-mono">=IMPORTDATA(&quot;Excel link&quot;)</code> in cell A1 (Google refreshes it about once an hour).
          </li>
        </ul>
      </section>
    </main>
  );
}
