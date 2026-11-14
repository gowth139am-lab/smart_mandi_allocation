import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  switch (session.user.role) {
    case "BUYER": redirect("/buyer/dashboard");
    case "FARMER": redirect("/farmer/dashboard");
    case "ADMIN": redirect("/admin/dashboard");
    default: redirect("/login");
  }
}
