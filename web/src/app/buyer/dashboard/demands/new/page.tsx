"use client";
import Link from "next/link";

import { useState, type FormEvent } from "react";
import { buyerDemandSchema } from "@/lib/validators/buyer";

export default function NewBuyerDemandPage() {
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors([]);
    setMessage("");

    const formData = new FormData(event.currentTarget);
    const requiredBy = formData.get("requiredBy")?.toString();

    const result = buyerDemandSchema.safeParse({
      cropId: formData.get("cropId")?.toString(),
      cropName: formData.get("cropName")?.toString(),
      requiredQuantityKg: Number(formData.get("requiredQuantityKg")),
      minimumGrade: formData.get("minimumGrade")?.toString(),
      maxPricePerKg: Number(formData.get("maxPricePerKg")),
      requiredBy: requiredBy
        ? new Date(`${requiredBy}T00:00:00.000Z`).toISOString()
        : undefined,
      deliveryLocation: formData.get("deliveryLocation")?.toString(),
      notes: formData.get("notes")?.toString() || undefined,
    });

    if (!result.success) {
      setErrors(result.error.issues.map((issue) => issue.message));
      return;
    }

    setMessage(
      "Validation successful! This is a development preview. Your demand has not been saved."
    );
    event.currentTarget.reset();
  }

  const inputClass =
    "mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100";

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-900">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/buyer/dashboard"
          className="text-sm font-medium text-green-700 hover:underline"
        >
          ← Back to Buyer Dashboard
        </Link>

        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-semibold text-green-700">BUYER PORTAL</p>
          <h1 className="mt-2 text-2xl font-bold">Create New Demand</h1>
          <p className="mt-2 text-sm text-slate-500">
            Enter the produce requirements you want farmers to fulfil.
          </p>

          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Development preview: submitting this form validates the data but does not save it.
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="text-sm font-medium">
                Crop ID
                <input
                  name="cropId"
                  placeholder="Example: CROP-TOMATO"
                  required
                  className={inputClass}
                />
              </label>

              <label className="text-sm font-medium">
                Crop name
                <input
                  name="cropName"
                  placeholder="Example: Tomato"
                  required
                  className={inputClass}
                />
              </label>

              <label className="text-sm font-medium">
                Required quantity (kg)
                <input
                  name="requiredQuantityKg"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="Example: 500"
                  required
                  className={inputClass}
                />
              </label>

              <label className="text-sm font-medium">
                Minimum quality grade
                <select
                  name="minimumGrade"
                  required
                  defaultValue="A"
                  className={inputClass}
                >
                  <option value="A">Grade A</option>
                  <option value="B">Grade B</option>
                  <option value="C">Grade C</option>
                </select>
              </label>

              <label className="text-sm font-medium">
                Maximum price per kg (₹)
                <input
                  name="maxPricePerKg"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="Example: 25"
                  required
                  className={inputClass}
                />
              </label>

              <label className="text-sm font-medium">
                Required delivery date
                <input
                  name="requiredBy"
                  type="date"
                  className={inputClass}
                />
              </label>
            </div>

            <label className="block text-sm font-medium">
              Delivery location
              <input
                name="deliveryLocation"
                placeholder="Enter delivery address or market"
                required
                className={inputClass}
              />
            </label>

            <label className="block text-sm font-medium">
              Additional notes (optional)
              <textarea
                name="notes"
                rows={4}
                maxLength={500}
                placeholder="Enter any additional requirements..."
                className={inputClass}
              />
            </label>

            {errors.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                <p className="mb-2 font-semibold">Please correct these errors:</p>
                <ul className="list-inside list-disc space-y-1">
                  {errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            )}

            {message && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                {message}
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="submit"
                className="rounded-lg bg-green-700 px-6 py-3 text-sm font-semibold text-white hover:bg-green-800"
              >
                Validate Demand
              </button>

              <Link
                href="/buyer/dashboard"
                className="rounded-lg border border-slate-300 px-6 py-3 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
