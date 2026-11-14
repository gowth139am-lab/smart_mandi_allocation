import { auth, signOut } from "@/auth";

export default async function FarmerDashboard() {
  const session = await auth();
  return (
    <main className="min-h-screen bg-green-50 p-8">
      <div className="mx-auto max-w-5xl rounded-2xl bg-white p-8 shadow">
        <h1 className="text-3xl font-bold text-green-800">🌾 Farmer Dashboard</h1>
        <p className="mt-3 text-gray-600">Welcome, {session?.user?.name}.</p>
        <p className="mt-2">Your Smart Mandi farmer workspace.</p>
        <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
          <button className="mt-6 rounded-lg bg-red-600 px-5 py-2 text-white">Logout</button>
        </form>
      </div>
    </main>
  );
}
