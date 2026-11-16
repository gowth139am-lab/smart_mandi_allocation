import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { query } from "@/lib/db/postgres";
import { getFarmerIdForUser } from "@/lib/auth/farmer";
import { parsePositiveBigintId } from "@/lib/validators/database";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const saleId = parsePositiveBigintId(id);
    if (!saleId) {
      return NextResponse.json({ message: "Sale not found" }, { status: 404 });
    }

    let ownershipClause = "";
    let ownershipParams: unknown[] = [];
    if (session.user.role === "BUYER" && session.user.buyer_id) {
      ownershipClause = "AND s.buyer_id = $2";
      ownershipParams = [session.user.buyer_id];
    } else if (session.user.role === "FARMER") {
      const farmerId = await getFarmerIdForUser(session.user.user_id);
      if (!farmerId) {
        return NextResponse.json({ message: "Farmer profile not found" }, { status: 403 });
      }
      ownershipClause = "AND s.farmer_id = $2";
      ownershipParams = [farmerId];
    } else if (session.user.role !== "ADMIN") {
      return NextResponse.json({ message: "Sales access required" }, { status: 403 });
    }

    const sale = await query(
      `SELECT s.sale_id::text AS id, s.sale_date,
              s.farmer_id::text AS farmer_id, s.buyer_id::text AS buyer_id,
              s.market_id::text AS market_id, s.sale_status, s.payment_status,
              s.total_amount::text AS total_amount, s.cancelled_at,
              s.cancellation_reason, s.created_at
       FROM sales s
       WHERE s.sale_id = $1 ${ownershipClause}`,
      [saleId, ...ownershipParams],
    );

    if (sale.rowCount === 0) {
      return NextResponse.json({ message: "Sale not found" }, { status: 404 });
    }

    const items = await query(
      `SELECT si.sale_item_id::text AS id, si.lot_id::text AS lot_id,
              si.demand_id::text AS demand_id, si.quantity::text AS quantity,
              si.price_per_unit::text AS price_per_unit,
              si.subtotal::text AS subtotal
       FROM sale_items si
       WHERE si.sale_id = $1
       ORDER BY si.sale_item_id`,
      [saleId],
    );

    return NextResponse.json({ sale: sale.rows[0], items: items.rows });
  } catch (error) {
    console.error("Sale detail GET failed:", error);
    return NextResponse.json({ message: "Could not load sale" }, { status: 500 });
  }
}
