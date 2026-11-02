"use client";
import Link from "next/link";

import { useMemo, useState } from "react";

type DemandStatus = "Active" | "Pending" | "Fulfilled";

type Demand = {
  id: string;
  crop: string;
  quantity: number;
  fulfilled: number;
  grade: string;
  maxPrice: number;
  location: string;
  status: DemandStatus;
};

const sampleDemands: Demand[] = [
  {
    id: "DEMO-001",
    crop: "Tomato",
    quantity: 500,
    fulfilled: 100,
    grade: "A",
    maxPrice: 25,
    location: "Bengaluru Market",
    status: "Active",
  },
  {
    id: "DEMO-002",
    crop: "Onion",
    quantity: 300,
    fulfilled: 0,
    grade: "B",
    maxPrice: 30,
    location: "Mysuru Market",
    status: "Pending",
  },
  {
    id: "DEMO-003",
    crop: "Potato",
    quantity: 200,
    fulfilled: 200,
    grade: "A",
    maxPrice: 22,
    location: "Bengaluru Market",
    status: "Fulfilled",
  },
  {
    id: "DEMO-004",
    crop: "Carrot",
    quantity: 400,
    fulfilled: 150,
    grade: "B",
    maxPrice: 35,
    location: "Mandya Market",
    status: "Active",
  },
];

const statusStyles: Record<DemandStatus, string> = {
  Active: "bg-green-100 text-green-800",
  Pending: "bg-amber-100 text-amber-800",
  Fulfilled: "bg-blue-100 text-blue-800",
};

export default function BuyerDemandsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const filteredDemands = useMemo(() => {
    return sampleDemands.filter((demand) => {
      const matchesSearch =
        demand.crop.toLowerCase().includes(search.toLowerCase()) ||
        demand.id.toLowerCase().includes(search.toLowerCase());

      const matchesStatus =
        statusFilter === "All" || demand.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [search, statusFilter]);

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-900">
      <div className="mx-auto max-w-7xl">
        <Link
          href="/buyer/dashboard"
          className="text-sm font-medium text-green-700 hover:underline"
        >
          ← Back to Dashboard
        </Link>

        <section className="mt-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-semibold text-green-700">BUYER PORTAL</p>
            <h1 className="mt-2 text-3xl font-bold">My Demands</h1>
            <p className="mt-2 text-slate-500">
              Search and track your produce requirements.
            </p>
          </div>

          <Link
            href="/buyer/dashboard/demands/new"
            className="rounded-lg bg-green-700 px-5 py-3 text-center text-sm font-semibold text-white hover:bg-green-800"
          >
            + Create New Demand
          </Link>
        </section>

        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Development preview: these are sample records and are not stored in a database.
        </div>

        <section className="mt-7 grid gap-4 sm:grid-cols-3">
          {[
            {
              label: "Total demands",
              value: sampleDemands.length,
            },
            {
              label: "Active demands",
              value: sampleDemands.filter((d) => d.status === "Active").length,
            },
            {
              label: "Fulfilled quantity",
              value: `${sampleDemands.reduce((sum, d) => sum + d.fulfilled, 0)} kg`,
            },
          ].map((stat) => (
            <article
              key={stat.label}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <p className="text-sm text-slate-500">{stat.label}</p>
              <p className="mt-2 text-2xl font-bold">{stat.value}</p>
            </article>
          ))}
        </section>

        <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Search demands
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search crop or demand ID..."
                className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-green-600"
              />
            </label>

            <label className="text-sm font-medium">
              Filter by status
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-green-600"
              >
                <option value="All">All statuses</option>
                <option value="Active">Active</option>
                <option value="Pending">Pending</option>
                <option value="Fulfilled">Fulfilled</option>
              </select>
            </label>
          </div>

          <div className="mt-6 flex items-center justify-between">
            <h2 className="font-bold">Demand Records</h2>
            <span className="text-sm text-slate-500">
              {filteredDemands.length} result(s)
            </span>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-4">Demand ID</th>
                  <th className="px-4 py-4">Crop</th>
                  <th className="px-4 py-4">Quantity</th>
                  <th className="px-4 py-4">Fulfilled</th>
                  <th className="px-4 py-4">Grade</th>
                  <th className="px-4 py-4">Max price</th>
                  <th className="px-4 py-4">Status</th>
                  <th className="px-4 py-4">Details</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredDemands.map((demand) => (
                  <tr key={demand.id} className="hover:bg-slate-50">
                    <td className="px-4 py-4 font-medium">{demand.id}</td>
                    <td className="px-4 py-4">{demand.crop}</td>
                    <td className="px-4 py-4">{demand.quantity} kg</td>
                    <td className="px-4 py-4">
                      {demand.fulfilled} kg
                      <p className="text-xs text-slate-400">
                        {demand.quantity - demand.fulfilled} kg remaining
                      </p>
                    </td>
                    <td className="px-4 py-4">{demand.grade}</td>
                    <td className="px-4 py-4">₹{demand.maxPrice}/kg</td>
                    <td className="px-4 py-4">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[demand.status]}`}>
                        {demand.status}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <Link
                        href={`/buyer/dashboard/demands/${demand.id}`}
                        className="font-semibold text-green-700 hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}

                {filteredDemands.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                      No demands found. Try changing your search or filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
