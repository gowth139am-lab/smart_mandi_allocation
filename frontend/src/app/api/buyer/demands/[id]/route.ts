import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { query } from "@/lib/db/postgres";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (session.user.role !== "BUYER" || !session.user.buyer_id) {
      return NextResponse.json({ message: "Buyer access required" }, { status: 403 });
    }

    const { id } = await params;
    if (!/^[1-9]\d*$/.test(id)) {
      return NextResponse.json({ message: "Demand not found" }, { status: 404 });
    }

    const result = await query(
      `SELECT d.demand_id::text AS id, d.crop_id::text AS crop_id,
              c.crop_name AS crop, c.unit,
              d.required_quantity::text AS quantity,
              d.remaining_quantity::text AS remaining_quantity,
              d.minimum_grade AS grade,
              d.maximum_price::text AS max_price,
              d.required_date, d.location, d.status, d.created_at
       FROM buyer_demands d
       JOIN crops c ON c.crop_id = d.crop_id
       WHERE d.demand_id = $1 AND d.buyer_id = $2`,
      [id, session.user.buyer_id]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ message: "Demand not found" }, { status: 404 });
    }

    return NextResponse.json({ demand: result.rows[0] });
  } catch (error) {
    console.error("Buyer demand detail GET failed:", error);
    return NextResponse.json({ message: "Could not load demand" }, { status: 500 });
  }
}