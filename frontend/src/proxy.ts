import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((request) => {
  const path = request.nextUrl.pathname;
  const user = request.auth?.user;
  const role = user?.role;

  // Login must remain accessible when the user is signed out.
  if (path === "/login" || path === "/register") {
    if (!user) return NextResponse.next();

    const target =
      role === "BUYER" ? "/buyer/dashboard" :
      role === "FARMER" ? "/farmer/dashboard" :
      role === "ADMIN" ? "/admin/dashboard" : "/login";

    return NextResponse.redirect(new URL(target, request.url));
  }

  // Protect all dashboard routes.
  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", path);
    return NextResponse.redirect(loginUrl);
  }

  if (path.startsWith("/buyer") && role !== "BUYER") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (path.startsWith("/farmer") && role !== "FARMER") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (path.startsWith("/admin") && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/login", "/buyer/:path*", "/farmer/:path*", "/admin/:path*"],
};