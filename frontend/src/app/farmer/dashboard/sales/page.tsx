"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

type Lot = {
  id: string;
  crop_id: string;
  crop_name: string;
  unit: string;
  available_quantity: string;
  grade: string | null;
  status: string;
  expiry_date: string | null;
};

type Buyer = { id: string; business_name: string };
type Market = { id: string; market_name: string };
type Demand = {
  id: string;
  buyer_id: string;
  crop_id: string;
  crop_name: string;
  unit: string;
  remaining_quantity: string;
  minimum_grade: string | null;
  maximum_price: string | null;
  status: string;
};
type Sale = {
  id: string;
  sale_date: string;
  buyer_id: string;
  sale_status: string;
  payment_status: string;
  total_amount: string;
  cancelled_at: string | null;
  total_items: number;
  total_quantity: string;
};
type AllocationRow = {
  lotId: string;
  demandId: string;
  quantity: string;
  pricePerUnit: string;
};

const emptyRow = (): AllocationRow => ({
  lotId: "",
  demandId: "",
  quantity: "",
  pricePerUnit: "",
});

const quantityPattern = /^\d{1,9}(?:\.\d{1,3})?$/;
const pricePattern = /^\d{1,10}(?:\.\d{1,2})?$/;

function scaled(value: string, scale: number): bigint | null {
  const trimmed = value.trim();
  const pattern = scale === 3 ? quantityPattern : pricePattern;
  if (!pattern.test(trimmed)) return null;
  const [whole, fraction = ""] = trimmed.split(".");
  return BigInt(whole) * BigInt(10) ** BigInt(scale) + BigInt(fraction.padEnd(scale, "0"));
}

function sumScaled(values: string[], scale: number) {
  return values.reduce((total, value) => total + (scaled(value, scale) ?? BigInt(0)), BigInt(0));
}

function gradeRank(grade: string | null) {
  return grade === "A" ? 3 : grade === "B" ? 2 : grade === "C" ? 1 : 0;
}

function formatAmount(value: string) {
  return `INR ${value}`;
}

export default function FarmerSalesPage() {
  const [lots, setLots] = useState<Lot[]>([]);
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [demands, setDemands] = useState<Demand[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [buyerId, setBuyerId] = useState("");
  const [marketId, setMarketId] = useState("");
  const [rows, setRows] = useState<AllocationRow[]>([emptyRow()]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [uncertainFailure, setUncertainFailure] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [lotsResponse, optionsResponse, salesResponse] = await Promise.all([
        fetch("/api/farmer/lots"),
        fetch("/api/farmer/sales/options"),
        fetch("/api/sales"),
      ]);
      const [lotsData, optionsData, salesData] = await Promise.all([
        lotsResponse.json(),
        optionsResponse.json(),
        salesResponse.json(),
      ]);
      if (!lotsResponse.ok) throw new Error(lotsData.message || "Could not load produce lots");
      if (!optionsResponse.ok) throw new Error(optionsData.message || "Could not load sale options");
      if (!salesResponse.ok) throw new Error(salesData.message || "Could not load sales");
      setLots(lotsData.lots || []);
      setBuyers(optionsData.buyers || []);
      setMarkets(optionsData.markets || []);
      setDemands(optionsData.demands || []);
      setSales(salesData.sales || []);
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : "Could not load sales data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    async function loadInitialData() {
      await loadData();
    }
    void loadInitialData();
  }, [loadData]);

  const selectedBuyerDemands = useMemo(
    () => demands.filter((demand) => demand.buyer_id === buyerId),
    [buyerId, demands],
  );

  function updateRow(index: number, patch: Partial<AllocationRow>) {
    setRows((current) => current.map((row, rowIndex) => (
      rowIndex === index ? { ...row, ...patch } : row
    )));
  }

  function validateRows() {
    if (!buyerId) return "Select a buyer.";
    if (rows.length === 0) return "Add at least one allocation item.";

    for (const [index, row] of rows.entries()) {
      const lot = lots.find((item) => item.id === row.lotId);
      const demand = demands.find((item) => item.id === row.demandId);
      const quantity = scaled(row.quantity, 3);
      const price = scaled(row.pricePerUnit, 2);
      if (!lot || !demand || quantity === null || quantity <= BigInt(0) || price === null || price < BigInt(0)) {
        return `Enter valid lot, demand, quantity, and price for item ${index + 1}.`;
      }
      if (demand.buyer_id !== buyerId) return `Demand ${demand.id} does not belong to the selected buyer.`;
      if (lot.crop_id !== demand.crop_id) return `Lot and demand crops must match for item ${index + 1}.`;
      if (lot.expiry_date && lot.expiry_date < new Date().toISOString().slice(0, 10)) {
        return `Lot ${lot.id} has expired.`;
      }
      if (gradeRank(demand.minimum_grade) > gradeRank(lot.grade)) {
        return `Lot ${lot.id} does not satisfy the minimum grade.`;
      }
      const maximumPrice = demand.maximum_price === null ? null : scaled(demand.maximum_price, 2);
      if (maximumPrice !== null && price > maximumPrice) {
        return `Price exceeds the maximum for demand ${demand.id}.`;
      }
      const lotQuantity = sumScaled(rows.filter((item) => item.lotId === row.lotId).map((item) => item.quantity), 3);
      const demandQuantity = sumScaled(rows.filter((item) => item.demandId === row.demandId).map((item) => item.quantity), 3);
      const available = scaled(lot.available_quantity, 3);
      const remaining = scaled(demand.remaining_quantity, 3);
      if (available === null || lotQuantity > available) return `Allocation exceeds available quantity for lot ${lot.id}.`;
      if (remaining === null || demandQuantity > remaining) return `Allocation exceeds remaining quantity for demand ${demand.id}.`;
    }
    return null;
  }

  async function createSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError("");
    setMessage("");
    setUncertainFailure(false);
    const validationError = validateRows();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    let response: Response;
    let data: { message?: string };
    try {
      response = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerId,
          marketId: marketId || undefined,
          allocations: rows,
        }),
      });
      data = await response.json() as { message?: string };
    } catch (reason) {
      if (reason instanceof TypeError || reason instanceof SyntaxError) {
        setUncertainFailure(true);
        setError("The request could not be confirmed.");
      } else {
        setError(reason instanceof Error ? reason.message : "Could not create sale");
      }
      setSubmitting(false);
      return;
    }

    if (!response.ok) {
      setError(data.message || "Could not create sale");
      setSubmitting(false);
      return;
    }

    setMessage(data.message || "Sale created successfully.");
    setBuyerId("");
    setMarketId("");
    setRows([emptyRow()]);
    await loadData();
    setSubmitting(false);
  }

  async function cancelSale(sale: Sale) {
    if (!window.confirm(`Cancel sale #${sale.id}? Inventory and demand will be restored by PostgreSQL.`)) return;
    const reason = window.prompt("Optional cancellation reason:", "");
    if (reason === null) return;
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/sales/${encodeURIComponent(sale.id)}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not cancel sale");
      setMessage(data.message || "Sale cancelled successfully.");
      await loadData();
    } catch (reasonValue) {
      setError(reasonValue instanceof Error ? reasonValue.message : "Could not cancel sale");
    }
  }

  const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";

  return (
    <main className="min-h-screen bg-green-50 px-5 py-10 text-slate-900">
      <div className="mx-auto max-w-7xl">
        <Link href="/farmer/dashboard" className="text-sm font-medium text-green-700 hover:underline">Back to Dashboard</Link>
        <div className="mt-6">
          <p className="text-sm font-semibold text-green-700">SMART MANDI</p>
          <h1 className="mt-2 text-3xl font-bold">Sales &amp; Allocation</h1>
          <p className="mt-2 text-slate-600">Allocate your available produce against active buyer demand.</p>
        </div>

        {loadError && (
          <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-red-100 p-3 text-sm text-red-800">
            <span>{loadError}</span>
            <button type="button" onClick={() => void loadData()} disabled={loading} className="rounded border border-red-700 px-3 py-1 font-semibold disabled:opacity-50">
              {loading ? "Retrying..." : "Retry"}
            </button>
          </div>
        )}
        {message && <p className="mt-6 rounded-lg bg-green-100 p-3 text-sm text-green-800">{message}</p>}
        {error && <p role="alert" className="mt-6 rounded-lg bg-red-100 p-3 text-sm text-red-800">{error}</p>}
        {uncertainFailure && (
          <p className="mt-3 rounded-lg bg-amber-100 p-3 text-sm text-amber-900">
            The sale request may have reached the server. Check Sales History before retrying to avoid a duplicate sale.
          </p>
        )}

        <section className="mt-7 rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">Create sale</h2>
          <form onSubmit={createSale} className="mt-5 space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium">Buyer
                <select required value={buyerId} onChange={(event) => {
                  setBuyerId(event.target.value);
                  setRows((current) => current.map((row) => ({ ...row, demandId: "" })));
                }} className={inputClass}>
                  <option value="">Select buyer</option>
                  {buyers.map((buyer) => <option key={buyer.id} value={buyer.id}>{buyer.business_name} (#{buyer.id})</option>)}
                </select>
              </label>
              <label className="text-sm font-medium">Market (optional)
                <select value={marketId} onChange={(event) => setMarketId(event.target.value)} className={inputClass}>
                  <option value="">No market selected</option>
                  {markets.map((market) => <option key={market.id} value={market.id}>{market.market_name}</option>)}
                </select>
              </label>
            </div>

            {rows.map((row, index) => {
              const selectedLot = lots.find((lot) => lot.id === row.lotId);
              const compatibleDemands = selectedLot
                ? selectedBuyerDemands.filter((demand) => demand.crop_id === selectedLot.crop_id)
                : selectedBuyerDemands;
              return (
                <div key={index} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-semibold">Allocation item {index + 1}</h3>
                    {rows.length > 1 && <button type="button" onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))} className="text-sm font-semibold text-red-600">Remove</button>}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="text-sm font-medium">Produce lot
                      <select required value={row.lotId} onChange={(event) => updateRow(index, { lotId: event.target.value, demandId: "" })} className={inputClass}>
                        <option value="">Select available lot</option>
                        {lots.filter((lot) => lot.available_quantity !== "0" && ["AVAILABLE", "PARTIALLY_SOLD"].includes(lot.status)).map((lot) => <option key={lot.id} value={lot.id}>#{lot.id} {lot.crop_name} ({lot.available_quantity} {lot.unit})</option>)}
                      </select>
                    </label>
                    <label className="text-sm font-medium">Buyer demand
                      <select required value={row.demandId} onChange={(event) => updateRow(index, { demandId: event.target.value })} className={inputClass}>
                        <option value="">Select compatible demand</option>
                        {compatibleDemands.map((demand) => <option key={demand.id} value={demand.id}>#{demand.id} {demand.crop_name} ({demand.remaining_quantity} {demand.unit} remaining)</option>)}
                      </select>
                    </label>
                    <label className="text-sm font-medium">Quantity
                      <input required inputMode="decimal" value={row.quantity} onChange={(event) => updateRow(index, { quantity: event.target.value })} className={inputClass} placeholder="0.000" />
                    </label>
                    <label className="text-sm font-medium">Price per unit
                      <input required inputMode="decimal" value={row.pricePerUnit} onChange={(event) => updateRow(index, { pricePerUnit: event.target.value })} className={inputClass} placeholder="0.00" />
                    </label>
                  </div>
                </div>
              );
            })}
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => setRows((current) => [...current, emptyRow()])} className="rounded-lg border border-green-700 px-4 py-2 text-sm font-semibold text-green-700">+ Add allocation item</button>
              <button type="submit" disabled={submitting || loading} className="rounded-lg bg-green-700 px-5 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50">{submitting ? "Creating sale..." : "Create sale"}</button>
            </div>
            {buyers.length === 0 || demands.length === 0 || lots.length === 0 ? <p className="text-sm text-slate-500">Active buyers, open demands, and available lots are required to create a sale.</p> : null}
          </form>
        </section>

        <section className="mt-7 rounded-xl border bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold">Sales history</h2>
            <button type="button" onClick={() => void loadData()} disabled={loading} className="text-sm font-semibold text-green-700 hover:underline">Refresh</button>
          </div>
          {loading && <p className="py-8 text-slate-500">Loading sales...</p>}
          {!loading && sales.length === 0 && <p className="py-8 text-slate-500">No sales found.</p>}
          {!loading && sales.length > 0 && (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[950px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Sale", "Buyer", "Date", "Items", "Quantity", "Amount", "Sale status", "Payment", "Actions"].map((heading) => <th key={heading} className="px-3 py-3">{heading}</th>)}</tr></thead>
                <tbody className="divide-y">
                  {sales.map((sale) => (
                    <tr key={sale.id}>
                      <td className="px-3 py-3 font-medium">#{sale.id}</td>
                      <td className="px-3 py-3">{buyers.find((buyer) => buyer.id === sale.buyer_id)?.business_name || `#${sale.buyer_id}`}</td>
                      <td className="px-3 py-3">{sale.sale_date}</td>
                      <td className="px-3 py-3">{sale.total_items}</td>
                      <td className="px-3 py-3">{sale.total_quantity}</td>
                      <td className="px-3 py-3">{formatAmount(sale.total_amount)}</td>
                      <td className="px-3 py-3">{sale.sale_status}</td>
                      <td className="px-3 py-3">{sale.payment_status}</td>
                      <td className="px-3 py-3">
                        <div className="flex gap-3">
                          <Link href={`/farmer/dashboard/sales/${sale.id}`} className="font-semibold text-green-700 hover:underline">View</Link>
                          {["PENDING", "CONFIRMED"].includes(sale.sale_status) && sale.payment_status !== "PAID" && <button type="button" onClick={() => void cancelSale(sale)} className="font-semibold text-red-600">Cancel</button>}
                        </div>
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
