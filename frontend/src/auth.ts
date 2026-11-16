import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { query } from "@/lib/db/postgres";

type AppRole = "FARMER" | "BUYER" | "ADMIN";

function logAuthTiming(label: string, startedAt: number) {
  if (process.env.NODE_ENV !== "production") {
    console.info(`[auth timing] ${label}: ${(performance.now() - startedAt).toFixed(1)}ms`);
  }
}

type DatabaseUser = {
  user_id: string;
  username: string;
  email: string;
  full_name: string;
  password_hash: string;
  role: AppRole;
  user_status: string;
  buyer_id: string | null;
  buyer_status: string | null;
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },

  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        identifier: { label: "Username or email", type: "text" },
        password: { label: "Password", type: "password" },
      },

      async authorize(credentials) {
        const identifier =
          typeof credentials?.identifier === "string"
            ? credentials.identifier.trim()
            : "";

        const password =
          typeof credentials?.password === "string"
            ? credentials.password
            : "";

        if (!identifier || !password || password.length > 128) return null;

        const databaseStartedAt = performance.now();
        const result = await query<DatabaseUser>(
          `SELECT
             u.user_id::text AS user_id,
             u.username,
             u.email,
             u.full_name,
             u.password_hash,
             u.role,
             u.status AS user_status,
             b.buyer_id::text AS buyer_id,
             b.status AS buyer_status
           FROM users u
           LEFT JOIN buyers b ON b.user_id = u.user_id
           WHERE LOWER(u.username) = LOWER($1)
              OR LOWER(u.email) = LOWER($1)
           LIMIT 1`,
          [identifier],
        );
        logAuthTiming("credentials database lookup", databaseStartedAt);

        const user = result.rows[0];

        if (!user || user.user_status !== "ACTIVE") return null;

        // Reject the placeholder values in the sample data.
        if (!/^\$2[aby]\$\d{2}\$/.test(user.password_hash)) return null;

        const bcryptStartedAt = performance.now();
        const passwordMatches = await bcrypt.compare(
          password,
          user.password_hash,
        );
        logAuthTiming("credentials bcrypt comparison", bcryptStartedAt);

        if (!passwordMatches) return null;

        if (
          user.role === "BUYER" &&
          (!user.buyer_id || user.buyer_status !== "ACTIVE")
        ) {
          return null;
        }

        return {
          id: user.user_id,
          user_id: user.user_id,
          name: user.full_name,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.user_id = user.user_id;
        token.role = user.role;
      }

      const userId = token.user_id;
      if (typeof userId !== "string" || !/^[1-9]\d{0,18}$/.test(userId) ||
        (userId.length === 19 && userId > "9223372036854775807") ||
        (token.role !== "FARMER" && token.role !== "BUYER" && token.role !== "ADMIN")) {
        return null;
      }

      const result = await query<{
        user_id: string;
        full_name: string;
        email: string;
        role: AppRole;
        user_status: string;
        buyer_id: string | null;
        buyer_status: string | null;
      }>(
        `SELECT
           u.user_id::text AS user_id,
           u.full_name,
           u.email,
           u.role,
           u.status AS user_status,
           b.buyer_id::text AS buyer_id,
           b.status AS buyer_status
         FROM users u
         LEFT JOIN buyers b ON b.user_id = u.user_id
         WHERE u.user_id = $1
         LIMIT 1`,
        [userId],
      );
      const currentUser = result.rows[0];
      if (
        !currentUser ||
        currentUser.user_status !== "ACTIVE" ||
        currentUser.role !== token.role ||
        (currentUser.role === "BUYER" &&
          (!currentUser.buyer_id || currentUser.buyer_status !== "ACTIVE"))
      ) {
        return null;
      }

      token.user_id = currentUser.user_id;
      token.role = currentUser.role;
      token.buyer_id =
        currentUser.role === "BUYER" ? currentUser.buyer_id : null;
      token.name = currentUser.full_name;
      token.email = currentUser.email;
      return token;
    },

    async session({ session, token }) {
      if (
        typeof token.user_id !== "string" ||
        (token.role !== "FARMER" && token.role !== "BUYER" && token.role !== "ADMIN")
      ) {
        throw new Error("Invalid authentication session");
      }

      session.user.user_id = token.user_id;
      session.user.buyer_id =
        typeof token.buyer_id === "string" ? token.buyer_id : null;
      session.user.role = token.role;
      session.user.name = typeof token.name === "string" ? token.name : null;
      if (typeof token.email === "string") session.user.email = token.email;

      return session;
    },
  },
});