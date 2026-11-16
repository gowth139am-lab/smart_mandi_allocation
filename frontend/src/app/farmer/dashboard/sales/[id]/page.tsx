"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type Sale = {
  id: string;
  sale_date: string;
  buyer_id: string;
  market_id: string | null;
  sale_status: string;
  payment_status: string;
  total_amount: string;
  cancelled_at: string | null;
  cancellation_reason: string | null;
};
type SaleItem = {
  id: string;
  lot_id: string;
  demand_id: string;
  quantity: string;
  price_per_unit: string;
  subtotal: string;
};

export default function FarmerSaleDetailsPage() {
  const params = useParams<{ id: string }>();
  const [sale, setSale] = useState<Sale | null>(null);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const cancelDialogRef = useRef<HTMLDivElement | null>(null);
  const cancelReasonRef = useRef<HTMLTextAreaElement | null>(null);
  const cancelOriginRef = useRef<HTMLButtonElement | null>(null);

  const loadSale = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/sales/${encodeURIComponent(params.id)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not load sale");
      setSale(data.sale);
      setItems(data.items || []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load sale");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    async function loadInitialSale() {
      await loadSale();
    }
    void loadInitialSale();
  }, [loadSale]);

  const closeCancelDialog = useCallback(() => {
    if (cancelling) return;
    setCancelDialogOpen(false);
    setCancelReason("");
    setCancelError("");
    cancelOriginRef.current?.focus();
  }, [cancelling]);

  useEffect(() => {
    if (!cancelDialogOpen) return;
    cancelReasonRef.current?.focus();
    function handleDialogKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (!cancelling) closeCancelDialog();
        return;
      }
      if (event.key !== "Tab" || !cancelDialogRef.current) return;
      const focusable = Array.from(cancelDialogRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), textarea:not([disabled])",
      ));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleDialogKeyDown);
    return () => document.removeEventListener("keydown", handleDialogKeyDown);
  }, [cancelDialogOpen, cancelling, closeCancelDialog]);

  function openCancelDialog(origin: HTMLButtonElement) {
    cancelOriginRef.current = origin;
    setCancelDialogOpen(true);
    setCancelReason("");
    setCancelError("");
  }

  async function confirmCancelSale() {
    if (!sale || cancelling) return;
    setCancelError("");
    setError("");
    setMessage("");
    setCancelling(true);
    try {
      const response = await fetch(`/api/sales/${encodeURIComponent(sale.id)}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not cancel sale");
      setMessage(data.message || "Sale cancelled successfully.");
      setCancelDialogOpen(false);
      setCancelReason("");
      setCancelError("");
      cancelOriginRef.current?.focus();
      await loadSale();
    } catch (reasonValue) {
      setCancelError(reasonValue instanceof Error ? reasonValue.message : "Could not cancel sale");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <main className="min-h-screen bg-green-50 px-5 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <Link href="/farmer/dashboard/sales" className="text-sm font-medium text-green-700 hover:underline">Back to Sales &amp; Allocation</Link>
        <h1 className="mt-6 text-3xl font-bold">Sale details</h1>
        {loading && <p className="mt-6 text-slate-500">Loading sale...</p>}
        {error && <div role="alert" className="mt-6 flex justify-between gap-3 rounded-lg bg-red-100 p-3 text-sm text-red-800"><span>{error}</span><button type="button" onClick={() => void loadSale()} className="font-semibold underline">Retry</button></div>}
        {message && <p className="mt-6 rounded-lg bg-green-100 p-3 text-sm text-green-800">{message}</p>}
        {!loading && sale && (
          <>
            <section className="mt-6 rounded-xl border bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-slate-500">Sale #{sale.id}</p>
                  <p className="mt-1 text-slate-600">Buyer #{sale.buyer_id} · {sale.sale_date}</p>
                </div>
                {["PENDING", "CONFIRMED"].includes(sale.sale_status) && sale.payment_status !== "PAID" && <button type="button" onClick={(event) => openCancelDialog(event.currentTarget)} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">Cancel sale</button>}
              </div>
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div><p className="text-sm text-slate-500">Sale status</p><p className="mt-1 font-semibold">{sale.sale_status}</p></div>
                <div><p className="text-sm text-slate-500">Payment status</p><p className="mt-1 font-semibold">{sale.payment_status}</p></div>
                <div><p className="text-sm text-slate-500">Market</p><p className="mt-1 font-semibold">{sale.market_id ? `#${sale.market_id}` : "—"}</p></div>
                <div><p className="text-sm text-slate-500">Total</p><p className="mt-1 font-semibold">INR {sale.total_amount}</p></div>
              </div>
              {sale.cancelled_at && <div className="mt-5 rounded-lg bg-slate-50 p-4 text-sm"><p><strong>Cancelled:</strong> {sale.cancelled_at}</p><p className="mt-1"><strong>Reason:</strong> {sale.cancellation_reason || "—"}</p></div>}
            </section>
            <section className="mt-6 rounded-xl border bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold">Sale items</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[650px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Item", "Lot", "Demand", "Quantity", "Unit price", "Subtotal"].map((heading) => <th key={heading} className="px-3 py-3">{heading}</th>)}</tr></thead>
                  <tbody className="divide-y">
                    {items.map((item) => <tr key={item.id}><td className="px-3 py-3">#{item.id}</td><td className="px-3 py-3">#{item.lot_id}</td><td className="px-3 py-3">#{item.demand_id}</td><td className="px-3 py-3">{item.quantity}</td><td className="px-3 py-3">INR {item.price_per_unit}</td><td className="px-3 py-3">INR {item.subtotal}</td></tr>)}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
      {cancelDialogOpen && sale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-5">
          <div
            ref={cancelDialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="cancel-sale-dialog-title"
            aria-describedby="cancel-sale-dialog-description"
            className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
          >
            <h2 id="cancel-sale-dialog-title" className="text-xl font-bold">Cancel sale #{sale.id}?</h2>
            <p id="cancel-sale-dialog-description" className="mt-3 text-sm text-slate-700">
              Inventory and buyer demand will be restored by PostgreSQL.
            </p>
            <label className="mt-5 block text-sm font-medium">
              Cancellation reason (optional)
              <textarea
                ref={cancelReasonRef}
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                disabled={cancelling}
                className="mt-1 min-h-24 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                rows={3}
              />
            </label>
            {cancelError && <p role="alert" className="mt-3 rounded-lg bg-red-100 p-3 text-sm text-red-800">{cancelError}</p>}
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={closeCancelDialog} disabled={cancelling} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">
                Back
              </button>
              <button type="button" onClick={() => void confirmCancelSale()} disabled={cancelling} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                {cancelling ? "Cancelling..." : "Confirm cancellation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
