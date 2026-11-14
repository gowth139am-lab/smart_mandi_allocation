"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

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