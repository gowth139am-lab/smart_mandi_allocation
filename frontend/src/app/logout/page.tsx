import { signOut } from "@/auth";

export default function LogoutPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}
        className="rounded-xl bg-white p-8 shadow space-y-4">
        <h1 className="text-xl font-bold">Sign out of Smart Mandi?</h1>
        <button type="submit" className="rounded-lg bg-red-600 px-5 py-3 text-white">Sign out</button>
      </form>
    </main>
  );
}
