"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

type Market = { id: string; market_name: string; status: string };
type Crop = { id: string; crop_name: string; unit: string };
type MarketCrop = { market_id: string; crop_id: string };
type Price = {
  id: string; market_id: string; market_name: string; crop_id: string; crop_name: string;
  unit: string; price_date: string; min_price: string; modal_price: string;
  max_price: string; arrival_quantity: string | null; source: string | null;
};
type PriceForm = {
  market_id: string; crop_id: string; price_date: string; min_price: string;
  modal_price: string; max_price: string; arrival_quantity: string; source: string;
};

function localToday() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function emptyForm(): PriceForm {
  return { market_id: "", crop_id: "", price_date: localToday(), min_price: "", modal_price: "", max_price: "", arrival_quantity: "", source: "" };
}

export default function AdminMarketPricesPage() {
  const [prices, setPrices] = useState<Price[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [marketCrops, setMarketCrops] = useState<MarketCrop[]>([]);
  const [form, setForm] = useState<PriceForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const loadControllerRef = useRef<AbortController | null>(null);
  const savingRef = useRef(false);

  const loadData = useCallback(async () => {
    loadControllerRef.current?.abort();
    const controller = new AbortController();
    loadControllerRef.current = controller;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/market-prices", { signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not load market prices");
      if (controller.signal.aborted) return;
      setPrices(data.prices || []);
      setMarkets(data.markets || []);
      setCrops(data.crops || []);
      setMarketCrops(data.marketCrops || []);
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not load market prices");
    } finally {
      if (loadControllerRef.current === controller) {
        loadControllerRef.current = null;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), 0);
    return () => { window.clearTimeout(timer); loadControllerRef.current?.abort(); };
  }, [loadData]);

  const availableCrops = crops.filter((crop) =>
    marketCrops.some((pair) => pair.market_id === form.market_id && pair.crop_id === crop.id),
  );
  const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";

  function beginEdit(price: Price) {
    setEditingId(price.id);
    setForm({
      market_id: price.market_id, crop_id: price.crop_id, price_date: price.price_date,
      min_price: price.min_price, modal_price: price.modal_price, max_price: price.max_price,
      arrival_quantity: price.arrival_quantity || "", source: price.source || "",
    });
    setError(""); setMessage("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    setError(""); setMessage(""); setSaving(true);
    try {
      const response = await fetch(editingId ? `/api/admin/market-prices/${encodeURIComponent(editingId)}` : "/api/admin/market-prices", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, arrival_quantity: form.arrival_quantity || null, source: form.source || null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not save market price");
      setMessage(data.message || "Market price saved"); setEditingId(null); setForm(emptyForm());
      await loadData();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save market price");
    } finally { savingRef.current = false; setSaving(false); }
  }

  function cancelEdit() { setEditingId(null); setForm(emptyForm()); setError(""); }

  return (
    <main className="min-h-screen bg-slate-100 px-5 py-10 text-slate-900">
      <div className="mx-auto max-w-7xl">
        <nav className="flex flex-wrap gap-5 text-sm font-medium text-green-700">
          <Link href="/admin/dashboard" className="hover:underline">Admin Dashboard</Link>
        </nav>
        <header className="mt-6">
          <p className="text-sm font-semibold text-green-700">SMART MANDI</p>
          <h1 className="mt-2 text-3xl font-bold">Market Price Management</h1>
          <p className="mt-2 text-slate-600">Add and update crop prices reported by agricultural markets.</p>
        </header>

        {error && <p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {message && <p role="status" className="mt-5 rounded-lg bg-green-100 p-3 text-sm text-green-800">{message}</p>}

        <section className="mt-7 rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">{editingId ? "Edit price record" : "Add price record"}</h2>
          <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm font-medium">Market
              <select required value={form.market_id} onChange={(event) => setForm((current) => ({ ...current, market_id: event.target.value, crop_id: "" }))} className={inputClass} disabled={saving}>
                <option value="">Select market</option>
                {markets.map((market) => <option key={market.id} value={market.id}>{market.market_name}{market.status === "INACTIVE" ? " (inactive)" : ""}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">Crop
              <select required value={form.crop_id} onChange={(event) => setForm((current) => ({ ...current, crop_id: event.target.value }))} className={inputClass} disabled={saving || !form.market_id}>
                <option value="">Select crop</option>
                {availableCrops.map((crop) => <option key={crop.id} value={crop.id}>{crop.crop_name} ({crop.unit})</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">Price date
              <input required type="date" value={form.price_date} onChange={(event) => setForm((current) => ({ ...current, price_date: event.target.value }))} className={inputClass} disabled={saving} />
            </label>
            <label className="text-sm font-medium">Minimum price
              <input required type="number" min="0" max="9999999999.99" step="0.01" value={form.min_price} onChange={(event) => setForm((current) => ({ ...current, min_price: event.target.value }))} className={inputClass} disabled={saving} />
            </label>
            <label className="text-sm font-medium">Modal price
              <input required type="number" min="0" max="9999999999.99" step="0.01" value={form.modal_price} onChange={(event) => setForm((current) => ({ ...current, modal_price: event.target.value }))} className={inputClass} disabled={saving} />
            </label>
            <label className="text-sm font-medium">Maximum price
              <input required type="number" min="0" max="9999999999.99" step="0.01" value={form.max_price} onChange={(event) => setForm((current) => ({ ...current, max_price: event.target.value }))} className={inputClass} disabled={saving} />
            </label>
            <label className="text-sm font-medium">Arrival quantity (optional)
              <input type="number" min="0" max="999999999.999" step="0.001" value={form.arrival_quantity} onChange={(event) => setForm((current) => ({ ...current, arrival_quantity: event.target.value }))} className={inputClass} disabled={saving} />
            </label>
            <label className="text-sm font-medium">Source (optional)
              <input maxLength={150} value={form.source} onChange={(event) => setForm((current) => ({ ...current, source: event.target.value }))} className={inputClass} disabled={saving} />
            </label>
            <div className="flex items-end gap-3">
              <button type="submit" disabled={saving || markets.length === 0 || availableCrops.length === 0} className="rounded-lg bg-green-700 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : editingId ? "Save changes" : "Add price"}</button>
              {editingId && <button type="button" onClick={cancelEdit} disabled={saving} className="rounded-lg border px-4 py-2 text-sm font-semibold">Cancel</button>}
            </div>
          </form>
        </section>

        <section className="mt-7 rounded-xl border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold">Price records</h2><button type="button" onClick={() => void loadData()} disabled={loading} className="rounded-lg border border-green-700 px-4 py-2 text-sm font-semibold text-green-700 disabled:opacity-50">{loading ? "Loading..." : "Refresh"}</button></div>
          {loading ? <p role="status" className="py-8 text-sm text-slate-600">Loading price records...</p> : error ? null : prices.length === 0 ? (
            <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No market price records have been added.</p>
          ) : (
            <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Date", "Market", "Crop", "Min", "Modal", "Max", "Arrival", "Source", "Action"].map((heading) => <th key={heading} className="px-3 py-3">{heading}</th>)}</tr></thead>
              <tbody className="divide-y">{prices.map((price) => <tr key={price.id}>
                <td className="px-3 py-3">{price.price_date.split("-").reverse().join("-")}</td><td className="px-3 py-3">{price.market_name}</td><td className="px-3 py-3">{price.crop_name} ({price.unit})</td>
                <td className="px-3 py-3">₹{price.min_price}</td><td className="px-3 py-3 font-semibold">₹{price.modal_price}</td><td className="px-3 py-3">₹{price.max_price}</td>
                <td className="px-3 py-3">{price.arrival_quantity ? `${price.arrival_quantity} ${price.unit}` : "—"}</td><td className="px-3 py-3">{price.source || "—"}</td>
                <td className="px-3 py-3"><button type="button" onClick={() => beginEdit(price)} className="font-semibold text-green-700 hover:underline">Edit</button></td>
              </tr>)}</tbody>
            </table></div>
          )}
        </section>
      </div>
    </main>
  );
}
