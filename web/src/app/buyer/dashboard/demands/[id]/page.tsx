import Link from "next/link";
import { notFound } from "next/navigation";

type Demand = {
  id: string;
  crop: string;
  quantity: number;
  fulfilled: number;
  grade: string;
  maxPrice: number;
  location: string;
  status: string;
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

export function generateStaticParams() {
  return sampleDemands.map((demand) => ({
    id: demand.id,
  }));
}
export default async function DemandDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const demand = sampleDemands.find((item) => item.id === id);

  if (!demand) {
    notFound();
  }

  const remaining = demand.quantity - demand.fulfilled;
  const progress = (demand.fulfilled / demand.quantity) * 100;

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-900">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/buyer/dashboard/demands"
          className="text-sm font-medium text-green-700 hover:underline"
        >
          ← Back to My Demands
        </Link>

        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-semibold text-green-700">BUYER PORTAL</p>
          <h1 className="mt-2 text-3xl font-bold">Demand Details</h1>
          <p className="mt-2 text-slate-500">
            Development preview — sample demand record.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <span className="font-semibold">{demand.id}</span>
            <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-800">
              {demand.status}
            </span>
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <div>
              <p className="text-sm text-slate-500">Crop</p>
              <p className="mt-1 text-lg font-semibold">{demand.crop}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Delivery market</p>
              <p className="mt-1 font-semibold">{demand.location}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Required quantity</p>
              <p className="mt-1 font-semibold">{demand.quantity} kg</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Minimum quality grade</p>
              <p className="mt-1 font-semibold">{demand.grade}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Maximum price</p>
              <p className="mt-1 font-semibold">₹{demand.maxPrice}/kg</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Fulfilled quantity</p>
              <p className="mt-1 font-semibold">{demand.fulfilled} kg</p>
            </div>
          </div>

          <div className="mt-8 border-t border-slate-200 pt-6">
            <div className="flex justify-between text-sm">
              <span className="font-semibold">Fulfilment progress</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-green-600"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-3 flex justify-between text-sm text-slate-500">
              <span>{demand.fulfilled} kg fulfilled</span>
              <span>{remaining} kg remaining</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}