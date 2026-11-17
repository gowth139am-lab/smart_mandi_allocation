"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

type Lot = {
  id: string;
  farm_id: string;
  farm_name: string;
  crop_id: string;
  crop_name: string;
  unit: string;
  variety_name: string | null;
  harvest_date: string;
  initial_quantity: string;
  available_quantity: string;
  grade: string | null;
  status: string;
  expiry_date: string | null;
};

type Option = { id: string; farm_name?: string; crop_name?: string; unit?: string };

type DashboardData = {
  lots: Lot[];
  farms: Option[];
  crops: Option[];
};

async function fetchDashboardData(signal: AbortSignal): Promise<DashboardData> {
  const [lotsResponse, farmsResponse] = await Promise.all([
    fetch("/api/farmer/lots", { signal }),
    fetch("/api/farmer/farms", { signal }),
  ]);
  const [lotsData, farmsData] = await Promise.all([
    lotsResponse.json(),
    farmsResponse.json(),
  ]);
  if (!lotsResponse.ok) throw new Error(lotsData.message || "Could not load produce lots");
  if (!farmsResponse.ok) throw new Error(farmsData.message || "Could not load farms");

  return {
    lots: lotsData.lots || [],
    farms: farmsData.farms || [],
    crops: lotsData.crops || [],
  };
}

const emptyFarmForm = {
  farmName: "",
  location: "",
  areaAcres: "",
  soilType: "",
  irrigationType: "",
};

const emptyForm = {
  farmId: "",
  cropId: "",
  initialQuantity: "",
  harvestDate: new Date().toISOString().slice(0, 10),
  expiryDate: "",
  grade: "",
};

export default function FarmerDashboard() {
  const [lots, setLots] = useState<Lot[]>([]);
  const [farms, setFarms] = useState<Option[]>([]);
  const [crops, setCrops] = useState<Option[]>([]);
  const [farmForm, setFarmForm] = useState(emptyFarmForm);
  const [showFarmForm, setShowFarmForm] = useState(false);
  const [savingFarm, setSavingFarm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ grade: "", expiryDate: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const mountedRef = useRef(false);
  const loadControllerRef = useRef<AbortController | null>(null);

  const loadLots = useCallback(async () => {
    const controller = new AbortController();
    loadControllerRef.current?.abort();
    loadControllerRef.current = controller;
    try {
      const data = await fetchDashboardData(controller.signal);
      if (!mountedRef.current || controller.signal.aborted) return;
      setLots(data.lots);
      setFarms(data.farms);
      setCrops(data.crops);
      setShowFarmForm(data.farms.length === 0);
      setLoadError("");
      setHasLoaded(true);
      setForm((current) => ({
        ...current,
        farmId: data.farms.some((farm) => farm.id === current.farmId)
          ? current.farmId
          : data.farms[0]?.id || "",
      }));
    } catch (reason) {
      if (controller.signal.aborted || !mountedRef.current) return;
      setLoadError(reason instanceof Error ? reason.message : "Could not load dashboard data");
    } finally {
      if (mountedRef.current && loadControllerRef.current === controller) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    mountedRef.current = true;
    loadControllerRef.current = controller;

    async function loadInitialDashboard() {
      try {
        const data = await fetchDashboardData(controller.signal);
        if (!active || controller.signal.aborted) return;
        setLots(data.lots);
        setFarms(data.farms);
        setCrops(data.crops);
        setShowFarmForm(data.farms.length === 0);
        setLoadError("");
        setHasLoaded(true);
        setForm((current) => ({
          ...current,
          farmId: data.farms.some((farm) => farm.id === current.farmId)
            ? current.farmId
            : data.farms[0]?.id || "",
        }));
      } catch (reason) {
        if (!active || controller.signal.aborted) return;
        setLoadError(reason instanceof Error ? reason.message : "Could not load dashboard data");
      } finally {
        if (active && !controller.signal.aborted) setLoading(false);
      }
    }

    void loadInitialDashboard();
    return () => {
      active = false;
      mountedRef.current = false;
      loadControllerRef.current?.abort();
      loadControllerRef.current = null;
    };
  }, []);

  function retryDashboardLoad() {
    setLoading(true);
    setLoadError("");
    void loadLots();
  }

  async function createFarm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSavingFarm(true);

    const formData = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/farmer/farms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          farmName: formData.get("farmName"),
          location: formData.get("location"),
          areaAcres: formData.get("areaAcres"),
          soilType: formData.get("soilType"),
          irrigationType: formData.get("irrigationType"),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not create farm");

      setFarmForm(emptyFarmForm);
      setForm((current) => ({ ...current, farmId: data.farm.id }));
      setMessage(data.message);
      setShowFarmForm(false);
      setLoading(true);
      await loadLots();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create farm");
    } finally {
      setSavingFarm(false);
    }
  }

  async function createLot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const response = await fetch("/api/farmer/lots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.message || "Could not create produce lot");
      return;
    }
    setMessage(data.message);
    setForm({ ...emptyForm, farmId: form.farmId });
    setLoading(true);
    await loadLots();
  }

  async function updateLot(id: string) {
    setError("");
    setMessage("");
    const response = await fetch(`/api/farmer/lots/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.message || "Could not update produce lot");
      return;
    }
    setMessage(data.message);
    setEditingId(null);
    setLoading(true);
    await loadLots();
  }

  async function deleteLot(id: string) {
    if (!window.confirm("Delete this unsold produce lot?")) return;
    setError("");
    setMessage("");
    const response = await fetch(`/api/farmer/lots/${encodeURIComponent(id)}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) {
      setError(data.message || "Could not delete produce lot");
      return;
    }
    setMessage(data.message);
    setLoading(true);
    await loadLots();
  }

  const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";

  return (
    <main className="min-h-screen bg-green-50 px-5 py-10 text-slate-900">
      <div className="mx-auto max-w-7xl">
        <Link href="/" className="text-sm font-medium text-green-700 hover:underline">Back to home</Link>
        <Link href="/farmer/dashboard/sales" className="ml-5 text-sm font-medium text-green-700 hover:underline">Sales &amp; Allocation</Link>
        <Link href="/farmer/dashboard/quality" className="ml-5 text-sm font-medium text-green-700 hover:underline">Quality Observations</Link>
        <Link href="/farmer/dashboard/market-prices" className="ml-5 text-sm font-medium text-green-700 hover:underline">Market Prices</Link>
        <Link href="/logout" className="ml-5 text-sm font-medium text-green-700 hover:underline">Sign out</Link>
        <div className="mt-6">
          <p className="text-sm font-semibold text-green-700">SMART MANDI</p>
          <h1 className="mt-2 text-3xl font-bold">Farmer Dashboard</h1>
          <p className="mt-2 text-slate-600">Manage produce lots stored in PostgreSQL.</p>
        </div>

        <section className="mt-7 rounded-xl border bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">
                {!hasLoaded
                  ? "Farm data"
                  : farms.length === 0 ? "Set up your farm" : "Farm management"}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {!hasLoaded
                  ? "Farm setup will be available after your farm data loads."
                  : farms.length === 0
                  ? "Create a farm before adding produce lots."
                  : `${farms.length} farm${farms.length === 1 ? "" : "s"} available for your produce lots.`}
              </p>
            </div>
            {farms.length > 0 && !showFarmForm && (
              <button
                type="button"
                onClick={() => setShowFarmForm(true)}
                className="rounded-lg border border-green-700 px-4 py-2 text-sm font-semibold text-green-700"
              >
                + Add farm
              </button>
            )}
          </div>
          {hasLoaded && showFarmForm && (
            <form onSubmit={createFarm} className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-sm font-medium">Farm name
                <input
                  name="farmName"
                  required
                  maxLength={100}
                  value={farmForm.farmName}
                  onChange={(event) => setFarmForm({ ...farmForm, farmName: event.target.value })}
                  className={inputClass}
                />
              </label>
              <label className="text-sm font-medium">Location
                <input
                  name="location"
                  maxLength={200}
                  value={farmForm.location}
                  onChange={(event) => setFarmForm({ ...farmForm, location: event.target.value })}
                  className={inputClass}
                />
              </label>
              <label className="text-sm font-medium">Area (acres)
                <input
                  name="areaAcres"
                  type="number"
                  min="0.01"
                  max="99999999.99"
                  step="0.01"
                  value={farmForm.areaAcres}
                  onChange={(event) => setFarmForm({ ...farmForm, areaAcres: event.target.value })}
                  className={inputClass}
                />
              </label>
              <label className="text-sm font-medium">Soil type
                <input
                  name="soilType"
                  maxLength={100}
                  value={farmForm.soilType}
                  onChange={(event) => setFarmForm({ ...farmForm, soilType: event.target.value })}
                  className={inputClass}
                />
              </label>
              <label className="text-sm font-medium">Irrigation type
                <input
                  name="irrigationType"
                  maxLength={100}
                  value={farmForm.irrigationType}
                  onChange={(event) => setFarmForm({ ...farmForm, irrigationType: event.target.value })}
                  className={inputClass}
                />
              </label>
              <div className="flex items-end gap-3">
                <button
                  type="submit"
                  disabled={savingFarm}
                  className="rounded-lg bg-green-700 px-5 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50"
                >
                  {savingFarm ? "Saving farm..." : "Create farm"}
                </button>
                {farms.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowFarmForm(false)}
                    className="rounded-lg border px-4 py-2 text-sm font-semibold"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          )}
        </section>

        <section className="mt-7 rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">Add produce lot</h2>
          {!hasLoaded ? (
            <p className="mt-3 text-sm text-slate-600">Farm selection is unavailable until dashboard data loads.</p>
          ) : farms.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">Create your farm above to enable produce-lot entry.</p>
          ) : (
          <form onSubmit={createLot} className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm font-medium">Farm
              <select required value={form.farmId} onChange={(e) => setForm({ ...form, farmId: e.target.value })} className={inputClass}>
                <option value="">Select farm</option>
                {farms.map((farm) => <option key={farm.id} value={farm.id}>{farm.farm_name}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">Crop
              <select required value={form.cropId} onChange={(e) => setForm({ ...form, cropId: e.target.value })} className={inputClass}>
                <option value="">Select crop</option>
                {crops.map((crop) => <option key={crop.id} value={crop.id}>{crop.crop_name} ({crop.unit})</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">Initial quantity
              <input required type="number" min="0.001" step="0.001" value={form.initialQuantity} onChange={(e) => setForm({ ...form, initialQuantity: e.target.value })} className={inputClass} />
            </label>
            <label className="text-sm font-medium">Harvest date
              <input required type="date" value={form.harvestDate} onChange={(e) => setForm({ ...form, harvestDate: e.target.value })} className={inputClass} />
            </label>
            <label className="text-sm font-medium">Expiry date
              <input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} className={inputClass} />
            </label>
            <label className="text-sm font-medium">Grade
              <select value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} className={inputClass}>
                <option value="">Not specified</option><option value="A">Grade A</option><option value="B">Grade B</option><option value="C">Grade C</option>
              </select>
            </label>
            <button type="submit" className="rounded-lg bg-green-700 px-5 py-2 text-sm font-semibold text-white hover:bg-green-800 sm:w-fit">Create lot</button>
          </form>
          )}
        </section>

        {message && <p className="mt-5 rounded-lg bg-green-100 p-3 text-sm text-green-800">{message}</p>}
        {error && <p className="mt-5 rounded-lg bg-red-100 p-3 text-sm text-red-800">{error}</p>}
        {loadError && (
          <div role="alert" className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-red-100 p-3 text-sm text-red-800">
            <span>Could not load farm and produce-lot data: {loadError}</span>
            <button
              type="button"
              onClick={retryDashboardLoad}
              disabled={loading}
              className="rounded border border-red-700 px-3 py-1 font-semibold disabled:opacity-50"
            >
              {loading ? "Retrying..." : "Retry"}
            </button>
          </div>
        )}

        <section className="mt-7 rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">My produce lots</h2>
          {loading && <p className="py-8 text-slate-500">Loading inventory...</p>}
          {!loading && hasLoaded && lots.length === 0 && <p className="py-8 text-slate-500">No produce lots found.</p>}
          {!loading && hasLoaded && lots.length > 0 && (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[950px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>{["Lot", "Farm", "Crop", "Initial", "Available", "Grade", "Status", "Harvest", "Expiry", "Actions"].map((heading) => <th key={heading} className="px-3 py-3">{heading}</th>)}</tr>
                </thead>
                <tbody className="divide-y">
                  {lots.map((lot) => (
                    <tr key={lot.id}>
                      <td className="px-3 py-3 font-medium">#{lot.id}</td>
                      <td className="px-3 py-3">{lot.farm_name}</td>
                      <td className="px-3 py-3">{lot.crop_name}</td>
                      <td className="px-3 py-3">{lot.initial_quantity} {lot.unit}</td>
                      <td className="px-3 py-3">{lot.available_quantity} {lot.unit}</td>
                      <td className="px-3 py-3">{lot.grade || "—"}</td>
                      <td className="px-3 py-3">{lot.status}</td>
                      <td className="px-3 py-3">{lot.harvest_date}</td>
                      <td className="px-3 py-3">{lot.expiry_date || "—"}</td>
                      <td className="px-3 py-3">
                        {editingId === lot.id ? (
                          <div className="flex gap-2">
                            <button onClick={() => updateLot(lot.id)} className="font-semibold text-green-700">Save</button>
                            <button onClick={() => setEditingId(null)} className="text-slate-600">Close</button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button onClick={() => { setEditingId(lot.id); setEditForm({ grade: lot.grade || "", expiryDate: lot.expiry_date || "" }); }} className="font-semibold text-green-700">Edit</button>
                            <button onClick={() => deleteLot(lot.id)} className="font-semibold text-red-600">Delete</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
