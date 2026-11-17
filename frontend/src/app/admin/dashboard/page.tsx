import { auth, signOut } from "@/auth";

export default async function AdminDashboard() {
  const session = await auth();
  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <div className="mx-auto max-w-5xl rounded-2xl bg-white p-8 shadow">
        <h1 className="text-3xl font-bold text-slate-800">🛡️ Admin Dashboard</h1>
        <p className="mt-3 text-gray-600">Welcome, {session?.user?.name}.</p>
        <p className="mt-2">Your Smart Mandi administration workspace.</p>
        <a href="/admin/dashboard/market-prices" className="mt-5 inline-block font-semibold text-green-700 hover:underline">Market Price Management</a>
        <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
          <button className="mt-6 rounded-lg bg-red-600 px-5 py-2 text-white">Logout</button>
        </form>
      </div>
    </main>
  );
}
