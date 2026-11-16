import type { DefaultSession } from "next-auth";

type AppRole = "FARMER" | "BUYER" | "ADMIN";

declare module "next-auth" {
  interface User {
    user_id: string;
    role: AppRole;
  }

  interface Session {
    user: {
      user_id: string;
      buyer_id: string | null;
      role: AppRole;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    user_id?: string;
    buyer_id?: string | null;
    role?: AppRole;
  }
}