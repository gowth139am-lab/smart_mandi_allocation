"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function NewBuyerDemandPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);

    const form = new FormData(event.currentTarget);
    const payload = {
      cropName: String(form.get("cropName") || ""),
      requiredQuantity: Number(form.get("requiredQuantity")),
      minimumGrade: String(form.get("minimumGrade") || ""),
      maximumPrice: form.get("maximumPrice") ? Number(form.get("maximumPrice")) : null,
      requiredDate: String(form.get("requiredDate") || "") || null,
      location: String(form.get("location") || "")
    };

    try {
      const response = await fetch("/api/buyer/demands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not save demand");
      router.push(`/buyer/dashboard/demands/${data.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save demand");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm";

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-900">
      <div className="mx-auto max-w-3xl">
        <Link href="/buyer/dashboard" className="text-sm font-medium text-green-700 hover:underline">Back to Buyer Dashboard</Link>
        <section className="mt-6 rounded-xl border bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-semibold text-green-700">BUYER PORTAL</p>
          <h1 className="mt-2 text-2xl font-bold">Create New Demand</h1>
          <p className="mt-2 text-sm text-slate-500">Your demand will be saved to PostgreSQL.</p>
          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <label className="block text-sm font-medium">Crop
              <input name="cropName" list="crop-options" required maxLength={100} placeholder="Enter crop name, e.g. Tomato" className={inputClass} />
              <datalist id="crop-options"><option value="Tomato" /></datalist>
              <span className="mt-1 block text-xs text-slate-500">Choose a crop that exists in the database.</span>
            </label>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="text-sm font-medium">Required quantity
                <input name="requiredQuantity" type="number" min="0.001" step="0.001" required className={inputClass} placeholder="Example: 500" />
              </label>
              <label className="text-sm font-medium">Minimum grade
                <select name="minimumGrade" className={inputClass}><option value="">No minimum</option><option value="A">Grade A</option><option value="B">Grade B</option><option value="C">Grade C</option></select>
              </label>
              <label className="text-sm font-medium">Maximum price (INR per unit)
                <input name="maximumPrice" type="number" min="0" step="0.01" className={inputClass} placeholder="Optional" />
              </label>
              <label className="text-sm font-medium">Required date
                <input name="requiredDate" type="date" className={inputClass} />
              </label>
            </div>
            <label className="block text-sm font-medium">Delivery location
              <input name="location" required maxLength={200} className={inputClass} placeholder="Enter delivery address or market" />
            </label>
            {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <div className="flex flex-wrap gap-3">
              <button disabled={saving} type="submit" className="rounded-lg bg-green-700 px-6 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Save Demand"}</button>
              <Link href="/buyer/dashboard" className="rounded-lg border px-6 py-3 text-sm font-semibold">Cancel</Link>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
