"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Demand = {
  id: string;
  crop: string;
  quantity: string;
  remaining_quantity: string;
  grade: string | null;
  max_price: string | null;
  status: string;
  unit: string;
};

export default function BuyerDashboardPage() {
  const [demands, setDemands] = useState<Demand[]>([]);
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

  const fulfilled = demands.reduce(
    (sum, demand) => sum + Number(demand.quantity) - Number(demand.remaining_quantity), 0
  );

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-900">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-green-700">SMART MANDI</p>
            <h1 className="mt-2 text-3xl font-bold">Buyer Dashboard</h1>
            <p className="mt-2 text-slate-500">Manage your produce requirements.</p>
          </div>
          <Link href="/buyer/dashboard/demands/new" className="rounded-lg bg-green-700 px-5 py-3 text-sm font-semibold text-white hover:bg-green-800">
            + Create New Demand
          </Link>
        </div>

        <section className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            ["Total demands", demands.length],
            ["Open demands", demands.filter(d => d.status === "OPEN" || d.status === "PARTIALLY_FULFILLED").length],
            ["Fulfilled quantity", `${fulfilled.toFixed(2)} kg`]
          ].map(([label, value]) => (
            <article key={String(label)} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">{label}</p>
              <p className="mt-2 text-2xl font-bold">{value}</p>
            </article>
          ))}
        </section>

        <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold">Recent demands</h2>
            <Link href="/buyer/dashboard/demands" className="text-sm font-semibold text-green-700 hover:underline">View all demands &gt;</Link>
          </div>
          {loading && <p className="py-8 text-slate-500">Loading demands...</p>}
          {error && <p className="py-8 text-red-600">{error}</p>}
          {!loading && !error && demands.length === 0 && <p className="py-8 text-slate-500">You have not created any demands yet.</p>}
          {!loading && !error && demands.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">ID</th><th className="px-4 py-3">Crop</th>
                    <th className="px-4 py-3">Quantity</th><th className="px-4 py-3">Grade</th>
                    <th className="px-4 py-3">Max price</th><th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {demands.slice(0, 5).map(d => (
                    <tr key={d.id}>
                      <td className="px-4 py-3"><Link className="font-semibold text-green-700 hover:underline" href={`/buyer/dashboard/demands/${d.id}`}>#{d.id}</Link></td>
                      <td className="px-4 py-3">{d.crop}</td>
                      <td className="px-4 py-3">{d.quantity} {d.unit}</td>
                      <td className="px-4 py-3">{d.grade || "—"}</td>
                      <td className="px-4 py-3">{d.max_price ? `INR ${d.max_price}` : "—"}</td>
                      <td className="px-4 py-3">{d.status}</td>
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
