"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const result = await signIn("credentials", {
      identifier: String(form.get("identifier") || ""),
      password: String(form.get("password") || ""),
      redirect: false,
    });
    setLoading(false);
    if (!result || result.error) {
      setError("Invalid username/email or password.");
      return;
    }
    router.push("/");
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-green-50 p-6">
      <form onSubmit={login} className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl space-y-5">
        <div className="text-center">
          <div className="text-4xl">🌾</div>
          <h1 className="text-3xl font-bold text-green-800">Smart Mandi</h1>
          <p className="text-gray-500 mt-2">Sign in to your account</p>
        </div>
        <label className="block text-sm font-medium">Username or email
          <input name="identifier" required className="mt-1 w-full rounded-lg border p-3" placeholder="Enter username or email" />
        </label>
        <label className="block text-sm font-medium">Password
          <input name="password" type="password" required className="mt-1 w-full rounded-lg border p-3" placeholder="Enter password" />
        </label>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button disabled={loading} className="w-full rounded-lg bg-green-700 p-3 font-semibold text-white hover:bg-green-800 disabled:opacity-50">
          {loading ? "Signing in..." : "Sign in"}
        </button>
        <p className="text-center text-sm text-gray-600">
          New to Smart Mandi? <Link href="/register" className="font-semibold text-green-700 hover:underline">Create an account</Link>
        </p>
        <p className="text-center text-xs text-gray-500">Secure role-based access for farmers, buyers and administrators.</p>
      </form>
    </main>
  );
}
