"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type FilterOption = { id: string; crop_name?: string; market_name?: string; district?: string | null; unit?: string };
type MarketPrice = {
  id: string;
  market_id: string;
  market_name: string;
  district: string | null;
  crop_id: string;
  crop_name: string;
  unit: string;
  price_date: string;
  min_price: string;
  max_price: string;
  modal_price: string;
  arrival_quantity: string | null;
  source: string | null;
};

function formatDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.slice(0, 10));
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value;
}

export default function FarmerMarketPricesPage() {
  const [prices, setPrices] = useState<MarketPrice[]>([]);
  const [crops, setCrops] = useState<FilterOption[]>([]);
  const [markets, setMarkets] = useState<FilterOption[]>([]);
  const [cropId, setCropId] = useState("");
  const [marketId, setMarketId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestControllerRef = useRef<AbortController | null>(null);

  const loadPrices = useCallback(async () => {
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (cropId) params.set("crop_id", cropId);
    if (marketId) params.set("market_id", marketId);
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    try {
      const response = await fetch(`/api/farmer/market-prices?${params}`, { signal: controller.signal });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(data.message || "Could not load market prices");
      setPrices(data.prices || []);
      setCrops(data.crops || []);
      setMarkets(data.markets || []);
    } catch (reason) {
      if (controller.signal.aborted) return;
      setError(reason instanceof Error ? reason.message : "Could not load market prices");
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
        setLoading(false);
      }
    }
  }, [cropId, marketId, from, to]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadPrices(), 0);
    return () => {
      window.clearTimeout(timer);
      requestControllerRef.current?.abort();
    };
  }, [loadPrices]);

  const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";

  return (
    <main className="min-h-screen bg-green-50 px-5 py-10 text-slate-900">
      <div className="mx-auto max-w-7xl">
        <nav className="flex flex-wrap gap-5 text-sm font-medium text-green-700">
          <Link href="/farmer/dashboard" className="hover:underline">Back to Dashboard</Link>
          <Link href="/farmer/dashboard/sales" className="hover:underline">Sales &amp; Allocation</Link>
          <Link href="/farmer/dashboard/quality" className="hover:underline">Quality Observations</Link>
        </nav>
        <header className="mt-6">
          <p className="text-sm font-semibold text-green-700">SMART MANDI</p>
          <h1 className="mt-2 text-3xl font-bold">Market Price Comparison</h1>
          <p className="mt-2 text-slate-600">Compare the latest available crop prices across markets, or narrow results to a date range.</p>
        </header>

        <section className="mt-7 rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold">Filters</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm font-medium">Crop
              <select value={cropId} onChange={(event) => setCropId(event.target.value)} className={inputClass}>
                <option value="">All crops</option>
                {crops.map((crop) => <option key={crop.id} value={crop.id}>{crop.crop_name}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">Market
              <select value={marketId} onChange={(event) => setMarketId(event.target.value)} className={inputClass}>
                <option value="">All markets</option>
                {markets.map((market) => <option key={market.id} value={market.id}>{market.market_name}{market.district ? ` · ${market.district}` : ""}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">Price date from
              <input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} className={inputClass} />
            </label>
            <label className="text-sm font-medium">Price date to
              <input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} className={inputClass} />
            </label>
          </div>
          {(cropId || marketId || from || to) && (
            <button type="button" onClick={() => { setCropId(""); setMarketId(""); setFrom(""); setTo(""); }} className="mt-4 text-sm font-semibold text-green-700 hover:underline">
              Clear filters
            </button>
          )}
        </section>

        <section className="mt-7 rounded-xl border bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">Latest prices by market and crop</h2>
              <p className="mt-1 text-sm text-slate-600">Prices are shown in the crop’s listed unit and use each record’s actual date.</p>
            </div>
            <button type="button" onClick={() => void loadPrices()} disabled={loading} className="rounded-lg border border-green-700 px-4 py-2 text-sm font-semibold text-green-700 disabled:opacity-50">
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>
          {error && <div role="alert" className="mt-5 rounded-lg bg-red-50 p-4 text-sm text-red-800"><p>{error}</p><button type="button" onClick={() => void loadPrices()} className="mt-2 font-semibold underline">Try again</button></div>}
          {loading ? <p role="status" className="py-8 text-sm text-slate-600">Loading market prices...</p> : error ? null : prices.length === 0 ? (
            <p className="mt-5 rounded-lg bg-slate-50 p-5 text-sm text-slate-600">No market prices match these filters.</p>
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>
                  {["Crop", "Market", "District", "Price date", "Min price", "Modal price", "Max price", "Arrival", "Source"].map((heading) => <th key={heading} className="px-3 py-3">{heading}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {prices.map((price) => <tr key={`${price.market_id}-${price.crop_id}`}>
                    <td className="px-3 py-3 font-semibold">{price.crop_name}<span className="ml-1 font-normal text-slate-500">/ {price.unit}</span></td>
                    <td className="px-3 py-3">{price.market_name}</td>
                    <td className="px-3 py-3">{price.district || "—"}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{formatDate(price.price_date)}</td>
                    <td className="px-3 py-3">₹{price.min_price}</td>
                    <td className="px-3 py-3 font-semibold text-green-800">₹{price.modal_price}</td>
                    <td className="px-3 py-3">₹{price.max_price}</td>
                    <td className="px-3 py-3">{price.arrival_quantity ? `${price.arrival_quantity} ${price.unit}` : "—"}</td>
                    <td className="px-3 py-3">{price.source || "—"}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
