"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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
};

export default function BuyerDemandsPage() {
  const [demands, setDemands] = useState<Demand[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/buyer/demands")
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Could not load demands");
        setDemands(data.demands || []);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => demands.filter(d =>
    (d.crop.toLowerCase().includes(search.toLowerCase()) || d.id.includes(search)) &&
    (status === "ALL" || d.status === status)
  ), [demands, search, status]);

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-900">
      <div className="mx-auto max-w-7xl">
        <Link href="/buyer/dashboard" className="text-sm font-medium text-green-700 hover:underline">Back to Dashboard</Link>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <div><p className="text-sm font-semibold text-green-700">BUYER PORTAL</p><h1 className="mt-2 text-3xl font-bold">My Demands</h1><p className="mt-2 text-slate-500">Your saved database demand records.</p></div>
          <Link href="/buyer/dashboard/demands/new" className="rounded-lg bg-green-700 px-5 py-3 text-sm font-semibold text-white">+ Create New Demand</Link>
        </div>

        <section className="mt-7 grid gap-4 sm:grid-cols-3">
          <article className="rounded-xl border bg-white p-5"><p className="text-sm text-slate-500">Total demands</p><p className="mt-2 text-2xl font-bold">{demands.length}</p></article>
          <article className="rounded-xl border bg-white p-5"><p className="text-sm text-slate-500">Open demands</p><p className="mt-2 text-2xl font-bold">{demands.filter(d => d.status === "OPEN" || d.status === "PARTIALLY_FULFILLED").length}</p></article>
          <article className="rounded-xl border bg-white p-5"><p className="text-sm text-slate-500">Fulfilled quantity</p><p className="mt-2 text-2xl font-bold">{demands.reduce((s,d) => s + Number(d.quantity) - Number(d.remaining_quantity), 0).toFixed(2)} kg</p></article>
        </section>

        <section className="mt-7 rounded-xl border bg-white p-5 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">Search crop or demand ID<input value={search} onChange={e => setSearch(e.target.value)} className="mt-2 w-full rounded-lg border px-4 py-3" placeholder="Search..." /></label>
            <label className="text-sm font-medium">Filter status<select value={status} onChange={e => setStatus(e.target.value)} className="mt-2 w-full rounded-lg border bg-white px-4 py-3"><option value="ALL">All statuses</option><option value="OPEN">Open</option><option value="PARTIALLY_FULFILLED">Partially fulfilled</option><option value="FULFILLED">Fulfilled</option><option value="CANCELLED">Cancelled</option><option value="EXPIRED">Expired</option></select></label>
          </div>
          <div className="mt-6 flex justify-between"><h2 className="font-bold">Demand records</h2><span className="text-sm text-slate-500">{filtered.length} result(s)</span></div>
          {loading && <p className="py-8 text-slate-500">Loading...</p>}
          {error && <p className="py-8 text-red-600">{error}</p>}
          {!loading && !error && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["ID","Crop","Quantity","Remaining","Grade","Max price","Status","Details"].map(x => <th key={x} className="px-4 py-3">{x}</th>)}</tr></thead>
                <tbody className="divide-y">
                  {filtered.map(d => <tr key={d.id}>
                    <td className="px-4 py-4 font-medium">#{d.id}</td><td className="px-4 py-4">{d.crop}</td>
                    <td className="px-4 py-4">{d.quantity} {d.unit}</td><td className="px-4 py-4">{d.remaining_quantity} {d.unit}</td>
                    <td className="px-4 py-4">{d.grade || "—"}</td><td className="px-4 py-4">{d.max_price ? `INR ${d.max_price}` : "—"}</td>
                    <td className="px-4 py-4">{d.status}</td><td className="px-4 py-4"><Link className="font-semibold text-green-700 hover:underline" href={`/buyer/dashboard/demands/${d.id}`}>View</Link></td>
                  </tr>)}
                  {filtered.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-500">No demands found.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
