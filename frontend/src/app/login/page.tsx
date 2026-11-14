import { signIn, auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  async function login(formData: FormData) {
    "use server";
    await signIn("credentials", {
      identifier: String(formData.get("identifier") || ""),
      password: String(formData.get("password") || ""),
      redirectTo: "/",
    });
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-green-50 p-6">
      <form action={login} className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl space-y-5">
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
        <button className="w-full rounded-lg bg-green-700 p-3 font-semibold text-white hover:bg-green-800">
          Sign in
        </button>
        <p className="text-center text-xs text-gray-500">Secure role-based access for farmers, buyers and administrators.</p>
      </form>
    </main>
  );
}
