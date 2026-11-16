import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { postgresPool } from "@/lib/db/postgres";

const ROLES = ["FARMER", "BUYER"] as const;

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Request body must be valid JSON" }, { status: 400 });
  }

  const username = typeof body.username === "string" ? body.username.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const role = typeof body.role === "string" ? body.role : "";
  const businessName = typeof body.businessName === "string" ? body.businessName.trim() : "";

  if (
    !/^[A-Za-z0-9_]{3,50}$/.test(username) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 255 ||
    fullName.length < 2 ||
    fullName.length > 120 ||
    password.length < 8 ||
    password.length > 128 ||
    !ROLES.includes(role as (typeof ROLES)[number]) ||
    (role === "BUYER" && (businessName.length < 2 || businessName.length > 150))
  ) {
    return NextResponse.json({ message: "Please enter valid registration details" }, { status: 400 });
  }

  let client: import("pg").PoolClient | undefined;
  try {
    client = await postgresPool.connect();
    await client.query("BEGIN");
    const passwordHash = await bcrypt.hash(password, 12);
    const userResult = await client.query<{ user_id: string }>(
      `INSERT INTO users (username, password_hash, full_name, email, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING user_id::text AS user_id`,
      [username, passwordHash, fullName, email, role],
    );
    const userId = userResult.rows[0].user_id;

    if (role === "BUYER") {
      await client.query(
        `INSERT INTO buyers
          (user_id, business_name, buyer_type, contact_person, address)
         VALUES ($1, $2, 'WHOLESALER', $3, '')`,
        [userId, businessName, fullName],
      );
    } else {
      await client.query("INSERT INTO farmers (user_id) VALUES ($1)", [userId]);
    }

    await client.query("COMMIT");
    return NextResponse.json({ message: "Registration successful" }, { status: 201 });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "23505") {
      return NextResponse.json({ message: "Username or email is already registered" }, { status: 409 });
    }
    console.error("Registration failed:", error);
    return NextResponse.json({ message: "Could not create account" }, { status: 500 });
  } finally {
    client?.release();
  }
}
