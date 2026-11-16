import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { query } from "@/lib/db/postgres";

export async function getFarmerIdForUser(userId: string): Promise<string | null> {
  const result = await query<{ farmer_id: string }>(
    `SELECT f.farmer_id::text AS farmer_id
     FROM farmers f
     JOIN users u ON u.user_id = f.user_id
     WHERE f.user_id = $1 AND u.status = 'ACTIVE'
     LIMIT 1`,
    [userId],
  );

  return result.rows[0]?.farmer_id ?? null;
}

export async function requireFarmer() {
  const session = await auth();
  if (!session?.user) {
    return {
      error: NextResponse.json({ message: "Unauthorized" }, { status: 401 }),
    };
  }

  if (session.user.role !== "FARMER") {
    return {
      error: NextResponse.json({ message: "Farmer access required" }, { status: 403 }),
    };
  }

  const farmerId = await getFarmerIdForUser(session.user.user_id);

  if (!farmerId) {
    return {
      error: NextResponse.json(
        { message: "Farmer profile not found" },
        { status: 403 },
      ),
    };
  }

  return { farmerId };
}
