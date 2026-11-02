import Link from "next/link";
const demands = [
  {
    id: "DEMO-001",
    crop: "Tomato",
    quantity: "500 kg",
    grade: "A",
    price: "₹25/kg",
    status: "Active",
  },
  {
    id: "DEMO-002",
    crop: "Onion",
    quantity: "300 kg",
    grade: "B",
    price: "₹30/kg",
    status: "Pending",
  },
  {
    id: "DEMO-003",
    crop: "Potato",
    quantity: "200 kg",
    grade: "A",
    price: "₹22/kg",
    status: "Fulfilled",
  },
];

const stats = [
  { label: "Total demands", value: "03", detail: "Sample records", icon: "▤" },
  { label: "Active demands", value: "01", detail: "Currently open", icon: "◷" },
  { label: "Fulfilled quantity", value: "200 kg", detail: "Sample records", icon: "✓" },
  { label: "Pending demands", value: "01", detail: "Awaiting action", icon: "!" },
];

export default function BuyerDashboard() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xl font-bold text-green-800">Smart Mandi</p>
            <p className="text-xs text-slate-500">Local Farmer Market Platform</p>
          </div>
          <span className="rounded-full bg-green-50 px-4 py-2 text-sm font-medium text-green-800">
            Buyer Dashboard
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-10">
        <section className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <p className="mb-2 text-sm font-medium text-green-700">BUYER PORTAL</p>
            <h1 className="text-3xl font-bold tracking-tight">Welcome, Buyer!</h1>
            <p className="mt-2 text-slate-500">
              Manage your produce requirements and track your purchase demands.
            </p>
          </div>
          <Link
            href="/buyer/dashboard/demands/new"
            className="inline-flex items-center justify-center rounded-lg bg-green-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-green-800"
          >
            + Create New Demand
          </Link>
        </section>

        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Demo mode: The figures and demand records below are sample data, not saved buyer records.
        </div>

        <section className="mb-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <article
              key={stat.label}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-medium text-slate-500">{stat.label}</p>
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-50 text-lg text-green-700">
                  {stat.icon}
                </span>
              </div>
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="mt-1 text-xs text-slate-400">{stat.detail}</p>
            </article>
          ))}
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col justify-between gap-3 border-b border-slate-200 px-6 py-5 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-bold">Recent Demands</h2>
              <p className="mt-1 text-sm text-slate-500">
                Overview of your recent produce requirements
              </p>
            </div>
            <Link
              href="/buyer/dashboard/demands"
              className="text-sm font-semibold text-green-700 hover:text-green-900"
            >
              View all demands →
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-semibold">Demand ID</th>
                  <th className="px-6 py-4 font-semibold">Crop</th>
                  <th className="px-6 py-4 font-semibold">Quantity</th>
                  <th className="px-6 py-4 font-semibold">Grade</th>
                  <th className="px-6 py-4 font-semibold">Max price</th>
                  <th className="px-6 py-4 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {demands.map((demand) => (
                  <tr key={demand.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-6 py-4 font-medium">{demand.id}</td>
                    <td className="px-6 py-4">{demand.crop}</td>
                    <td className="whitespace-nowrap px-6 py-4">{demand.quantity}</td>
                    <td className="px-6 py-4">{demand.grade}</td>
                    <td className="whitespace-nowrap px-6 py-4">{demand.price}</td>
                    <td className="px-6 py-4">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        demand.status === "Active"
                          ? "bg-green-100 text-green-800"
                          : demand.status === "Fulfilled"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-amber-100 text-amber-800"
                      }`}>
                        {demand.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <footer className="mt-8 text-center text-xs text-slate-400">
          Smart Mandi Allocation System · Buyer Module · Development Preview
        </footer>
      </div>
    </main>
  );
}
