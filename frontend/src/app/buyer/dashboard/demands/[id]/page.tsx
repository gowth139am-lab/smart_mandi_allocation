"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

type Demand = {
  id: string;
  crop: string;
  quantity: string;
  remaining_quantity: string;
  grade: string | null;
  max_price: string | null;
  location: string;
  status: string;
  unit: string;
  required_date: string | null;
};

export default function DemandDetailsPage() {
  const params = useParams<{ id: string }>();
  const [demand, setDemand] = useState<Demand | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/buyer/demands/${encodeURIComponent(params.id)}`)
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Demand not found");
        setDemand(data.demand);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [params.id]);

  async function updateDemand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!demand) return;
    setSaving(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/buyer/demands/${encodeURIComponent(params.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        minimumGrade: form.get("minimumGrade"),
        maximumPrice: form.get("maximumPrice"),
        requiredDate: form.get("requiredDate"),
        location: form.get("location"),
      }),
    });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) {
      setMessage(data.message || "Could not update demand");
      return;
    }
    setEditing(false);
    setMessage("Demand updated successfully.");
    const refreshed = await fetch(`/api/buyer/demands/${encodeURIComponent(params.id)}`);
    const refreshedData = await refreshed.json();
    if (refreshed.ok) setDemand(refreshedData.demand);
  }

  async function cancelDemand() {
    if (!window.confirm("Cancel this demand?")) return;
    setMessage("");
    const response = await fetch(`/api/buyer/demands/${encodeURIComponent(params.id)}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.message || "Could not cancel demand");
      return;
    }
    setDemand((current) => current ? { ...current, status: "CANCELLED" } : current);
    setMessage("Demand cancelled successfully.");
  }

  const total = Number(demand?.quantity || 0);
  const remaining = Number(demand?.remaining_quantity || 0);
  const fulfilled = Math.max(0, total - remaining);
  const progress = total > 0 ? Math.min(100, fulfilled / total * 100) : 0;

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-900">
      <div className="mx-auto max-w-3xl">
        <Link href="/buyer/dashboard/demands" className="text-sm font-medium text-green-700 hover:underline">
          Back to My Demands
        </Link>
        <section className="mt-6 rounded-xl border bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-semibold text-green-700">BUYER PORTAL</p>
          <h1 className="mt-2 text-3xl font-bold">Demand Details</h1>
          {loading && <p className="py-8 text-slate-500">Loading demand...</p>}
          {error && <p className="py-8 text-red-600">{error}</p>}
          {demand && (
            <>
              <div className="mt-6 flex items-center justify-between gap-3">
                <span className="font-semibold">Demand #{demand.id}</span>
                <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-800">{demand.status}</span>
              </div>
              {message && <p className="mt-4 rounded-lg bg-slate-100 p-3 text-sm text-slate-700">{message}</p>}
              {editing ? (
                <form onSubmit={updateDemand} className="mt-6 grid gap-4 rounded-lg bg-slate-50 p-4 sm:grid-cols-2">
                  <label className="text-sm font-medium">Minimum grade
                    <select name="minimumGrade" defaultValue={demand.grade || ""} className="mt-1 w-full rounded border bg-white p-2">
                      <option value="">No minimum</option><option value="A">Grade A</option><option value="B">Grade B</option><option value="C">Grade C</option>
                    </select>
                  </label>
                  <label className="text-sm font-medium">Maximum price
                    <input name="maximumPrice" type="number" min="0" step="0.01" defaultValue={demand.max_price || ""} className="mt-1 w-full rounded border p-2" />
                  </label>
                  <label className="text-sm font-medium">Required date
                    <input name="requiredDate" type="date" defaultValue={demand.required_date?.slice(0, 10) || ""} className="mt-1 w-full rounded border p-2" />
                  </label>
                  <label className="text-sm font-medium">Delivery location
                    <input name="location" required maxLength={200} defaultValue={demand.location} className="mt-1 w-full rounded border p-2" />
                  </label>
                  <div className="flex gap-3 sm:col-span-2">
                    <button disabled={saving} className="rounded bg-green-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Save changes"}</button>
                    <button type="button" onClick={() => setEditing(false)} className="rounded border px-4 py-2 text-sm font-semibold">Close</button>
                  </div>
                </form>
              ) : (demand.status === "OPEN" || demand.status === "PARTIALLY_FULFILLED") && (
                <div className="mt-6 flex gap-3">
                  <button onClick={() => setEditing(true)} className="rounded border border-green-700 px-4 py-2 text-sm font-semibold text-green-700">Edit demand</button>
                  <button onClick={cancelDemand} className="rounded border border-red-600 px-4 py-2 text-sm font-semibold text-red-600">Cancel demand</button>
                </div>
              )}
              <div className="mt-7 grid gap-5 sm:grid-cols-2">
                <div><p className="text-sm text-slate-500">Crop</p><p className="mt-1 font-semibold">{demand.crop}</p></div>
                <div><p className="text-sm text-slate-500">Delivery location</p><p className="mt-1 font-semibold">{demand.location}</p></div>
                <div><p className="text-sm text-slate-500">Required quantity</p><p className="mt-1 font-semibold">{demand.quantity} {demand.unit}</p></div>
                <div><p className="text-sm text-slate-500">Minimum grade</p><p className="mt-1 font-semibold">{demand.grade || "No minimum"}</p></div>
                <div><p className="text-sm text-slate-500">Maximum price</p><p className="mt-1 font-semibold">{demand.max_price ? `INR ${demand.max_price}` : "Not specified"}</p></div>
                <div><p className="text-sm text-slate-500">Required date</p><p className="mt-1 font-semibold">{demand.required_date ? new Date(demand.required_date).toLocaleDateString() : "Not specified"}</p></div>
                <div><p className="text-sm text-slate-500">Fulfilled quantity</p><p className="mt-1 font-semibold">{fulfilled.toFixed(2)} {demand.unit}</p></div>
                <div><p className="text-sm text-slate-500">Remaining quantity</p><p className="mt-1 font-semibold">{remaining.toFixed(2)} {demand.unit}</p></div>
              </div>
              <div className="mt-8 border-t pt-6">
                <div className="flex justify-between text-sm">
                  <span className="font-semibold">Fulfilment progress</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-green-600" style={{ width: `${progress}%` }} />
                </div>
                <div className="mt-3 flex justify-between text-sm text-slate-500">
                  <span>{fulfilled.toFixed(2)} fulfilled</span>
                  <span>{remaining.toFixed(2)} remaining</span>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}