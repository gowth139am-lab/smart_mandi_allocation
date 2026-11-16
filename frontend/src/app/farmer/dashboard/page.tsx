"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

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
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ grade: "", expiryDate: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadLots() {
    setLoading(true);
    try {
      const response = await fetch("/api/farmer/lots");
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not load produce lots");
      setLots(data.lots || []);
      setFarms(data.farms || []);
      setCrops(data.crops || []);
      setForm((current) => ({
        ...current,
        farmId: current.farmId || data.farms?.[0]?.id || "",
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load produce lots");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLots();
  }, []);

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
    await loadLots();
  }

  const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";

  return (
    <main className="min-h-screen bg-green-50 px-5 py-10 text-slate-900">
      <div className="mx-auto max-w-7xl">
        <Link href="/" className="text-sm font-medium text-green-700 hover:underline">Back to home</Link>
        <div className="mt-6">
          <p className="text-sm font-semibold text-green-700">SMART MANDI</p>
          <h1 className="mt-2 text-3xl font-bold">Farmer Dashboard</h1>
          <p className="mt-2 text-slate-600">Manage produce lots stored in PostgreSQL.</p>
        </div>

        <section className="mt-7 rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">Add produce lot</h2>
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
        </section>

        {message && <p className="mt-5 rounded-lg bg-green-100 p-3 text-sm text-green-800">{message}</p>}
        {error && <p className="mt-5 rounded-lg bg-red-100 p-3 text-sm text-red-800">{error}</p>}

        <section className="mt-7 rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">My produce lots</h2>
          {loading && <p className="py-8 text-slate-500">Loading inventory...</p>}
          {!loading && lots.length === 0 && <p className="py-8 text-slate-500">No produce lots found.</p>}
          {!loading && lots.length > 0 && (
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
