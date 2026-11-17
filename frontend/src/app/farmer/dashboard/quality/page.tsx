"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";

type Lot = {
  id: string;
  crop_id: string;
  crop_name: string;
  unit: string;
  farm_name: string;
  available_quantity: string;
};

type Observation = {
  _id?: string;
  lot_id: string;
  crop_name: string;
  inspection_date: string;
  assessed_grade: string;
  inspector?: string;
  measurements: Record<string, string | number>;
};

type MeasurementRow = {
  name: string;
  value: string;
};

type ObservationEdit = {
  inspectionDate: string;
  assessedGrade: string;
  measurements: MeasurementRow[];
};

const today = new Date().toISOString().slice(0, 10);
const emptyMeasurement = (): MeasurementRow => ({ name: "", value: "" });

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function parseMeasurementValue(value: string): string | number {
  const trimmed = value.trim();
  if (trimmed !== "" && Number.isFinite(Number(trimmed))) return Number(trimmed);
  return value;
}

function inputDate(value: string) {
  return value.slice(0, 10);
}

export default function FarmerQualityPage() {
  const [lots, setLots] = useState<Lot[]>([]);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [lotId, setLotId] = useState("");
  const [inspectionDate, setInspectionDate] = useState(today);
  const [assessedGrade, setAssessedGrade] = useState("A");
  const [measurements, setMeasurements] = useState<MeasurementRow[]>([emptyMeasurement()]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ObservationEdit | null>(null);
  const [savingObservation, setSavingObservation] = useState(false);

  const selectedLot = useMemo(
    () => lots.find((lot) => lot.id === lotId),
    [lotId, lots],
  );

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [lotsResponse, observationsResponse] = await Promise.all([
        fetch("/api/farmer/lots"),
        fetch("/api/quality-observations"),
      ]);
      const [lotsData, observationsData] = await Promise.all([
        lotsResponse.json(),
        observationsResponse.json(),
      ]);
      if (!lotsResponse.ok) throw new Error(lotsData.message || "Could not load produce lots");
      if (!observationsResponse.ok) {
        throw new Error(observationsData.message || "Could not load quality observations");
      }

      const nextLots = lotsData.lots || [];
      setLots(nextLots);
      setObservations(observationsData.observations || []);
      setLotId((current) =>
        nextLots.some((lot: Lot) => lot.id === current) ? current : nextLots[0]?.id || "",
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load quality data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function loadInitialData() {
      setLoading(true);
      setError("");
      try {
        const [lotsResponse, observationsResponse] = await Promise.all([
          fetch("/api/farmer/lots"),
          fetch("/api/quality-observations"),
        ]);
        const [lotsData, observationsData] = await Promise.all([
          lotsResponse.json(),
          observationsResponse.json(),
        ]);
        if (!lotsResponse.ok) throw new Error(lotsData.message || "Could not load produce lots");
        if (!observationsResponse.ok) {
          throw new Error(observationsData.message || "Could not load quality observations");
        }

        if (!active) return;
        const nextLots = lotsData.lots || [];
        setLots(nextLots);
        setObservations(observationsData.observations || []);
        setLotId((current) =>
          nextLots.some((lot: Lot) => lot.id === current) ? current : nextLots[0]?.id || "",
        );
      } catch (reason) {
        if (active) {
          setError(reason instanceof Error ? reason.message : "Could not load quality data");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadInitialData();
    return () => {
      active = false;
    };
  }, []);

  function updateMeasurement(index: number, field: keyof MeasurementRow, value: string) {
    setMeasurements((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row,
      ),
    );
  }

  function buildMeasurementRecord() {
    const record: Record<string, string | number> = {};
    for (const row of measurements) {
      const name = row.name.trim();
      if (!name && !row.value.trim()) continue;
      if (!/^[A-Za-z][A-Za-z0-9_-]{0,49}$/.test(name)) {
        throw new Error("Attribute names must start with a letter and use only letters, numbers, _ or -.");
      }
      if (!row.value.trim() || row.value.length > 200) {
        throw new Error(`Enter a value of 200 characters or fewer for ${name}.`);
      }
      if (Object.prototype.hasOwnProperty.call(record, name)) {
        throw new Error(`The attribute ${name} is repeated.`);
      }
      record[name] = parseMeasurementValue(row.value);
    }
    if (Object.keys(record).length === 0) {
      throw new Error("Add at least one quality attribute.");
    }
    return record;
  }

  async function saveObservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!selectedLot) {
      setError("Select a produce lot before saving an observation.");
      return;
    }

    let measurementRecord: Record<string, string | number>;
    try {
      measurementRecord = buildMeasurementRecord();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Enter valid quality attributes.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/quality-observations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lot_id: selectedLot.id,
          crop_id: selectedLot.crop_id,
          inspection_date: inspectionDate,
          assessed_grade: assessedGrade,
          measurements: measurementRecord,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not save quality observation");

      setMessage(data.message || "Quality observation saved.");
      setMeasurements([emptyMeasurement()]);
      await loadData();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save quality observation");
    } finally {
      setSaving(false);
    }
  }

  function beginEdit(observation: Observation) {
    if (!observation._id) return;
    setEditingId(observation._id);
    setEditForm({
      inspectionDate: inputDate(observation.inspection_date),
      assessedGrade: observation.assessed_grade,
      measurements: Object.entries(observation.measurements).map(([name, value]) => ({ name, value: String(value) })),
    });
    setError(""); setMessage("");
  }

  function buildEditMeasurements(rows: MeasurementRow[]) {
    const record: Record<string, string | number> = {};
    for (const row of rows) {
      const name = row.name.trim();
      if (!name && !row.value.trim()) continue;
      if (!/^[A-Za-z][A-Za-z0-9_-]{0,49}$/.test(name) || !row.value.trim() || row.value.length > 200) {
        throw new Error("Enter valid measurement names and values (up to 200 characters). ");
      }
      if (Object.prototype.hasOwnProperty.call(record, name)) throw new Error(`The attribute ${name} is repeated.`);
      record[name] = parseMeasurementValue(row.value);
    }
    if (!Object.keys(record).length || Object.keys(record).length > 32) {
      throw new Error("Add between 1 and 32 quality attributes.");
    }
    return record;
  }

  async function updateObservation(observationId: string) {
    if (!editForm) return;
    setError(""); setMessage(""); setSavingObservation(true);
    try {
      const response = await fetch(`/api/quality-observations/${encodeURIComponent(observationId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inspection_date: editForm.inspectionDate,
          assessed_grade: editForm.assessedGrade,
          measurements: buildEditMeasurements(editForm.measurements),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not update quality observation");
      setMessage(data.message || "Quality observation updated.");
      setEditingId(null); setEditForm(null);
      await loadData();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update quality observation");
    } finally { setSavingObservation(false); }
  }

  async function deleteObservation(observation: Observation) {
    if (!observation._id || !window.confirm("Delete this quality observation? This cannot be undone.")) return;
    setError(""); setMessage(""); setSavingObservation(true);
    try {
      const response = await fetch(`/api/quality-observations/${encodeURIComponent(observation._id)}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not delete quality observation");
      setMessage(data.message || "Quality observation deleted.");
      if (editingId === observation._id) { setEditingId(null); setEditForm(null); }
      await loadData();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not delete quality observation");
    } finally { setSavingObservation(false); }
  }

  const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";

  return (
    <main className="min-h-screen bg-green-50 px-5 py-10 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap gap-4 text-sm font-medium text-green-700">
          <Link href="/farmer/dashboard" className="hover:underline">Back to Dashboard</Link>
          <Link href="/farmer/dashboard/sales" className="hover:underline">Sales &amp; Allocation</Link>
        </div>
        <p className="mt-6 text-sm font-semibold text-green-700">SMART MANDI</p>
        <h1 className="mt-2 text-3xl font-bold">Quality Observations</h1>
        <p className="mt-2 text-slate-600">
          Record crop-specific quality measurements for your produce lots.
        </p>

        {error && <p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="mt-5 rounded-lg bg-green-100 p-3 text-sm text-green-800">{message}</p>}

        <section className="mt-7 rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">Add observation</h2>
          <p className="mt-1 text-sm text-slate-600">
            Use any attributes that describe the selected crop, such as firmness, moisture, or bruising.
          </p>
          <form onSubmit={saveObservation} className="mt-5 space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="text-sm font-medium">
                Produce lot
                <select
                  required
                  value={lotId}
                  onChange={(event) => setLotId(event.target.value)}
                  className={inputClass}
                  disabled={loading || saving}
                >
                  <option value="">Select a lot</option>
                  {lots.map((lot) => (
                    <option key={lot.id} value={lot.id}>
                      {lot.crop_name} - {lot.farm_name} (#{lot.id})
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium">
                Observation date
                <input
                  required
                  type="date"
                  value={inspectionDate}
                  onChange={(event) => setInspectionDate(event.target.value)}
                  className={inputClass}
                  disabled={saving}
                />
              </label>
              <label className="text-sm font-medium">
                Assessed grade
                <select
                  value={assessedGrade}
                  onChange={(event) => setAssessedGrade(event.target.value)}
                  className={inputClass}
                  disabled={saving}
                >
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                </select>
              </label>
            </div>

            {selectedLot && (
              <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                Selected crop: <strong>{selectedLot.crop_name}</strong> ({selectedLot.unit}).
                Available quantity: {selectedLot.available_quantity}.
              </p>
            )}

            <div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">Quality attributes</h3>
                  <p className="text-xs text-slate-500">Attribute names are flexible and case-sensitive.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setMeasurements((current) => [...current, emptyMeasurement()])}
                  disabled={saving || measurements.length >= 32}
                  className="rounded-lg border border-green-700 px-3 py-2 text-sm font-semibold text-green-700 disabled:opacity-50"
                >
                  + Add attribute
                </button>
              </div>
              <div className="mt-3 space-y-3">
                {measurements.map((row, index) => (
                  <div key={index} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                    <label className="text-sm font-medium">
                      Attribute name
                      <input
                        value={row.name}
                        onChange={(event) => updateMeasurement(index, "name", event.target.value)}
                        className={inputClass}
                        placeholder="e.g. firmness"
                        disabled={saving}
                      />
                    </label>
                    <label className="text-sm font-medium">
                      Value
                      <input
                        value={row.value}
                        onChange={(event) => updateMeasurement(index, "value", event.target.value)}
                        className={inputClass}
                        placeholder="e.g. 7.5 or firm"
                        disabled={saving}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setMeasurements((current) => current.filter((_, rowIndex) => rowIndex !== index))}
                      disabled={saving || measurements.length === 1}
                      className="self-end rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={saving || loading || lots.length === 0}
              className="rounded-lg bg-green-700 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save observation"}
            </button>
          </form>
          {!loading && lots.length === 0 && (
            <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              Create a produce lot before recording a quality observation.
            </p>
          )}
        </section>

        <section className="mt-7 rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">Previous observations</h2>
          {loading ? (
            <p className="mt-4 text-sm text-slate-600">Loading observations...</p>
          ) : observations.length === 0 ? (
            <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
              No quality observations have been recorded for your lots yet.
            </p>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {observations.map((observation) => (
                <article key={observation._id || `${observation.lot_id}-${observation.inspection_date}`} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{observation.crop_name}</h3>
                      <p className="text-xs text-slate-500">
                        Lot #{observation.lot_id} · {formatDate(observation.inspection_date)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-bold text-green-800">Grade {observation.assessed_grade}</span>
                      {observation._id && <button type="button" onClick={() => beginEdit(observation)} className="text-sm font-semibold text-green-700 hover:underline" disabled={savingObservation}>Edit</button>}
                      {observation._id && <button type="button" onClick={() => void deleteObservation(observation)} className="text-sm font-semibold text-red-700 hover:underline" disabled={savingObservation}>Delete</button>}
                    </div>
                  </div>
                  {editingId === observation._id && editForm && (
                    <div className="mt-4 space-y-3 rounded-lg bg-slate-50 p-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="text-sm font-medium">Observation date<input type="date" value={editForm.inspectionDate} onChange={(event) => setEditForm({ ...editForm, inspectionDate: event.target.value })} className={inputClass} disabled={savingObservation} /></label>
                        <label className="text-sm font-medium">Assessed grade<select value={editForm.assessedGrade} onChange={(event) => setEditForm({ ...editForm, assessedGrade: event.target.value })} className={inputClass} disabled={savingObservation}><option>A</option><option>B</option><option>C</option></select></label>
                      </div>
                      <div className="space-y-2">{editForm.measurements.map((row, index) => <div key={`${observation._id}-${index}`} className="grid gap-2 sm:grid-cols-2">
                        <input aria-label={`Measurement ${index + 1} name`} value={row.name} onChange={(event) => setEditForm({ ...editForm, measurements: editForm.measurements.map((item, rowIndex) => rowIndex === index ? { ...item, name: event.target.value } : item) })} className={inputClass} disabled={savingObservation} />
                        <input aria-label={`Measurement ${index + 1} value`} value={row.value} onChange={(event) => setEditForm({ ...editForm, measurements: editForm.measurements.map((item, rowIndex) => rowIndex === index ? { ...item, value: event.target.value } : item) })} className={inputClass} disabled={savingObservation} />
                      </div>)}</div>
                      <div className="flex gap-3">
                        <button type="button" onClick={() => setEditForm({ ...editForm, measurements: [...editForm.measurements, emptyMeasurement()] })} disabled={savingObservation || editForm.measurements.length >= 32} className="text-sm font-semibold text-green-700 hover:underline">+ Add attribute</button>
                        <button type="button" onClick={() => void updateObservation(observation._id!)} disabled={savingObservation} className="text-sm font-semibold text-green-700 hover:underline">{savingObservation ? "Saving..." : "Save changes"}</button>
                        <button type="button" onClick={() => { setEditingId(null); setEditForm(null); }} disabled={savingObservation} className="text-sm text-slate-600 hover:underline">Cancel</button>
                      </div>
                    </div>
                  )}
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    {Object.entries(observation.measurements).map(([name, value]) => (
                      <div key={name} className="rounded bg-slate-50 px-2 py-1">
                        <dt className="text-xs text-slate-500">{name}</dt>
                        <dd className="font-medium">{String(value)}</dd>
                      </div>
                    ))}
                  </dl>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
