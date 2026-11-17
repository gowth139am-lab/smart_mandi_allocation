"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";

type QuantityByUnit = { unit: string; quantity: string };
type SalesReport = {
  success: true;
  filters: { from: string | null; to: string | null };
  summary: {
    totalSales: string;
    totalSaleAmount: string;
    quantitySoldByUnit: QuantityByUnit[];
    collectedPaymentAmount: string;
  };
  saleCountsByStatus: { status: string; count: string }[];
  monthlySales: {
    month: string;
    salesCount: string;
    totalSaleAmount: string;
  }[];
  cropSales: {
    cropId: string;
    cropName: string;
    unit: string;
    salesCount: string;
    totalQuantity: string;
    totalSaleAmount: string;
  }[];
  marketSales: {
    marketId: string | null;
    marketName: string;
    salesCount: string;
    totalSaleAmount: string;
  }[];
};

function apiMessage(data: unknown, fallback: string) {
  if (
    data &&
    typeof data === "object" &&
    "message" in data &&
    typeof data.message === "string"
  ) {
    return data.message;
  }
  return fallback;
}

function formatAmount(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount)
    : `₹${value}`;
}

function formatCount(value: string) {
  return Number(value).toLocaleString("en-IN");
}

function formatQuantity(value: string) {
  return Number(value).toLocaleString("en-IN", { maximumFractionDigits: 3 });
}

function formatMonth(value: string) {
  const date = new Date(`${value}-01T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-IN", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });
}

function quantityLabel(rows: QuantityByUnit[]) {
  return rows.length
    ? rows.map(({ quantity, unit }) => `${formatQuantity(quantity)} ${unit}`).join(" · ")
    : "0";
}

export default function AdminSalesReportPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [report, setReport] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadReport = useCallback(async (fromDate: string, toDate: string) => {
    setLoading(true);
    setError("");
    setReport(null);

    const params = new URLSearchParams();
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);

    try {
      const queryString = params.toString();
      const response = await fetch(
        `/api/reports/sales${queryString ? `?${queryString}` : ""}`,
        { cache: "no-store" },
      );
      const data: unknown = await response.json();
      if (!response.ok) {
        throw new Error(apiMessage(data, "Could not load sales report"));
      }
      const reportData = data as SalesReport;
      setReport(reportData);
      setFrom(reportData.filters.from ?? "");
      setTo(reportData.filters.to ?? "");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load sales report");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadReport("", ""), 0);
    return () => window.clearTimeout(timer);
  }, [loadReport]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (from && to && from > to) {
      setReport(null);
      setError("The start date must be on or before the end date.");
      return;
    }
    void loadReport(from, to);
  }

  const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";

  return (
    <main className="min-h-screen bg-slate-100 px-5 py-10 text-slate-900">
      <div className="mx-auto max-w-7xl">
        <nav className="flex flex-wrap gap-5 text-sm font-medium text-green-700">
          <Link href="/admin/dashboard" className="hover:underline">Admin Dashboard</Link>
          <Link href="/admin/dashboard/market-prices" className="hover:underline">Market Price Management</Link>
        </nav>
        <header className="mt-6">
          <p className="text-sm font-semibold text-green-700">SMART MANDI</p>
          <h1 className="mt-2 text-3xl font-bold">Sales Reports &amp; Analytics</h1>
          <p className="mt-2 text-slate-600">
            Review sales totals and breakdowns for the selected sale-date range.
          </p>
        </header>

        <section className="mt-7 rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">Date range</h2>
          <form onSubmit={applyFilters} className="mt-4 flex flex-wrap items-end gap-4">
            <label className="w-full text-sm font-medium sm:max-w-xs">
              From
              <input
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className={inputClass}
                disabled={loading}
              />
            </label>
            <label className="w-full text-sm font-medium sm:max-w-xs">
              To
              <input
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                className={inputClass}
                disabled={loading}
              />
            </label>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-green-700 px-5 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50"
            >
              {loading ? "Loading..." : "Apply filters"}
            </button>
          </form>
          <p className="mt-3 text-xs text-slate-500">
            Cancelled sales appear in status counts but are excluded from sales totals and breakdowns.
            Successful payment totals include payments for matching, non-cancelled sales.
          </p>
        </section>

        {error && (
          <div role="alert" className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => void loadReport(from, to)}
              disabled={loading}
              className="rounded border border-red-700 px-3 py-1 font-semibold disabled:opacity-50"
            >
              Retry
            </button>
          </div>
        )}

        {loading && <p role="status" className="mt-6 py-8 text-slate-600">Loading sales report...</p>}

        {!loading && report && (
          <>
            <section aria-label="Sales summary" className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: "Sales (excluding cancelled)", value: formatCount(report.summary.totalSales) },
                { label: "Total sale amount", value: formatAmount(report.summary.totalSaleAmount) },
                { label: "Quantity sold by unit", value: quantityLabel(report.summary.quantitySoldByUnit) },
                { label: "Successful payments collected", value: formatAmount(report.summary.collectedPaymentAmount) },
              ].map(({ label, value }) => (
                <article key={label} className="rounded-xl border bg-white p-5 shadow-sm">
                  <p className="text-sm text-slate-500">{label}</p>
                  <p className="mt-2 break-words text-xl font-bold">{value}</p>
                </article>
              ))}
            </section>

            {report.summary.totalSales === "0" && (
              <p className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
                No non-cancelled sales were found for this date range.
              </p>
            )}

            <section className="mt-7 rounded-xl border bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold">Sales by status</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[400px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3">Sales</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {report.saleCountsByStatus.map(({ status, count }) => (
                      <tr key={status}>
                        <td className="px-3 py-3">{status}</td>
                        <td className="px-3 py-3">{formatCount(count)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mt-7 rounded-xl border bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold">Monthly sales</h2>
              {report.monthlySales.length === 0 ? (
                <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No monthly sales to display.</p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[600px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-3">Month</th>
                        <th className="px-3 py-3">Sales</th>
                        <th className="px-3 py-3">Total sale amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {report.monthlySales.map((row) => (
                        <tr key={row.month}>
                          <td className="px-3 py-3">{formatMonth(row.month)}</td>
                          <td className="px-3 py-3">{formatCount(row.salesCount)}</td>
                          <td className="px-3 py-3">{formatAmount(row.totalSaleAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="mt-7 rounded-xl border bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold">Crop-wise sales</h2>
              {report.cropSales.length === 0 ? (
                <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No crop sales to display.</p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[750px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-3">Crop</th>
                        <th className="px-3 py-3">Sales</th>
                        <th className="px-3 py-3">Quantity</th>
                        <th className="px-3 py-3">Total sale amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {report.cropSales.map((row) => (
                        <tr key={`${row.cropId}-${row.unit}`}>
                          <td className="px-3 py-3">{row.cropName}</td>
                          <td className="px-3 py-3">{formatCount(row.salesCount)}</td>
                          <td className="px-3 py-3">{formatQuantity(row.totalQuantity)} {row.unit}</td>
                          <td className="px-3 py-3">{formatAmount(row.totalSaleAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="mt-7 rounded-xl border bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold">Market-wise sales</h2>
              {report.marketSales.length === 0 ? (
                <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No market sales to display.</p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[600px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-3">Market</th>
                        <th className="px-3 py-3">Sales</th>
                        <th className="px-3 py-3">Total sale amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {report.marketSales.map((row) => (
                        <tr key={row.marketId ?? "no-market"}>
                          <td className="px-3 py-3">{row.marketName}</td>
                          <td className="px-3 py-3">{formatCount(row.salesCount)}</td>
                          <td className="px-3 py-3">{formatAmount(row.totalSaleAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
