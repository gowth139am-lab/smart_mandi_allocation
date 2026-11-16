import { NextResponse } from "next/server";
import { query } from "@/lib/db/postgres";
import { requireFarmerSalesAccess } from "@/lib/auth/sales";

export async function GET() {
  try {
    const access = await requireFarmerSalesAccess();
    if ("error" in access) return access.error;

    const [buyers, markets, demands] = await Promise.all([
      query(
        `SELECT b.buyer_id::text AS id, b.business_name
         FROM buyers b
         JOIN users u ON u.user_id = b.user_id
         WHERE b.status = 'ACTIVE' AND u.status = 'ACTIVE'
         ORDER BY b.business_name, b.buyer_id`,
      ),
      query(
        `SELECT market_id::text AS id, market_name
         FROM markets
         WHERE status = 'ACTIVE'
         ORDER BY market_name, market_id`,
      ),
      query(
        `SELECT d.demand_id::text AS id, d.buyer_id::text AS buyer_id,
                d.crop_id::text AS crop_id, c.crop_name, c.unit,
                d.remaining_quantity::text AS remaining_quantity,
                d.minimum_grade, d.maximum_price::text AS maximum_price,
                d.status
         FROM buyer_demands d
         JOIN buyers b ON b.buyer_id = d.buyer_id
         JOIN users u ON u.user_id = b.user_id
         JOIN crops c ON c.crop_id = d.crop_id
         WHERE b.status = 'ACTIVE'
           AND u.status = 'ACTIVE'
           AND d.status IN ('OPEN', 'PARTIALLY_FULFILLED')
           AND d.remaining_quantity > 0
         ORDER BY d.created_at DESC, d.demand_id DESC`,
      ),
    ]);

    return NextResponse.json({
      buyers: buyers.rows,
      markets: markets.rows,
      demands: demands.rows,
    });
  } catch (error) {
    console.error("Farmer sales options GET failed:", error);
    return NextResponse.json({ message: "Could not load sale options" }, { status: 500 });
  }
}
