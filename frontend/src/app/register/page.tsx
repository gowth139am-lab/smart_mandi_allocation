"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export default function RegisterPage() {
  const router = useRouter();
  const [role, setRole] = useState("FARMER");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: form.get("username"),
        email: form.get("email"),
        fullName: form.get("fullName"),
        password: form.get("password"),
        role,
        businessName: form.get("businessName"),
      }),
    });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(data.message || "Could not create account.");
      return;
    }
    router.push("/login?registered=1");
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-green-50 p-6">
      <form onSubmit={register} className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-xl space-y-5">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-green-800">Create your account</h1>
          <p className="mt-2 text-gray-500">Register as a farmer or buyer.</p>
        </div>
        <label className="block text-sm font-medium">Full name
          <input name="fullName" required minLength={2} maxLength={120} className="mt-1 w-full rounded-lg border p-3" />
        </label>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block text-sm font-medium">Username
            <input name="username" required pattern="[A-Za-z0-9_]{3,50}" className="mt-1 w-full rounded-lg border p-3" />
          </label>
          <label className="block text-sm font-medium">Email
            <input name="email" type="email" required className="mt-1 w-full rounded-lg border p-3" />
          </label>
        </div>
        <label className="block text-sm font-medium">Password
          <input name="password" type="password" required minLength={8} maxLength={128} className="mt-1 w-full rounded-lg border p-3" />
        </label>
        <label className="block text-sm font-medium">Role
          <select name="role" value={role} onChange={(event) => setRole(event.target.value)} className="mt-1 w-full rounded-lg border bg-white p-3">
            <option value="FARMER">Farmer</option>
            <option value="BUYER">Buyer</option>
          </select>
        </label>
        {role === "BUYER" && (
          <label className="block text-sm font-medium">Business name
            <input name="businessName" required minLength={2} maxLength={150} className="mt-1 w-full rounded-lg border p-3" />
          </label>
        )}
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button disabled={loading} className="w-full rounded-lg bg-green-700 p-3 font-semibold text-white disabled:opacity-50">
          {loading ? "Creating account..." : "Create account"}
        </button>
        <p className="text-center text-sm text-gray-600">
          Already registered? <Link href="/login" className="font-semibold text-green-700 hover:underline">Sign in</Link>
        </p>
      </form>
    </main>
  );
}
