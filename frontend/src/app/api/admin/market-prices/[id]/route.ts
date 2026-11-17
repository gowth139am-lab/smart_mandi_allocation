import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { query } from "@/lib/db/postgres";
import { parsePositiveBigintId } from "@/lib/validators/database";
import { parseMarketPriceInput } from "@/lib/validators/market-price";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: RouteContext) {
  try {
    const access = await requireAdmin();
    if ("error" in access) return access.error;
    const { id: rawId } = await context.params;
    const id = parsePositiveBigintId(rawId);
    if (!id) return NextResponse.json({ message: "Invalid price record ID" }, { status: 400 });
    let body: unknown;
    try { body = await request.json(); } catch {
      return NextResponse.json({ message: "Request body must be valid JSON" }, { status: 400 });
    }
    const input = parseMarketPriceInput(body);
    if (!input) return NextResponse.json({ message: "Enter valid market price details" }, { status: 400 });
    const association = await query(
      `SELECT 1 FROM market_crops WHERE market_id = $1 AND crop_id = $2`,
      [input.marketId, input.cropId],
    );
    if (association.rowCount === 0) {
      return NextResponse.json({ message: "The selected crop is not available at this market" }, { status: 400 });
    }
    const duplicate = await query(
      `SELECT 1 FROM price_records
       WHERE market_id = $1 AND crop_id = $2 AND price_date = $3
         AND price_record_id <> $4
       LIMIT 1`,
      [input.marketId, input.cropId, input.priceDate, id],
    );
    if (duplicate.rowCount) {
      return NextResponse.json({ message: "A price record already exists for this market, crop, and date" }, { status: 409 });
    }
    const result = await query(
      `UPDATE price_records
       SET market_id = $1, crop_id = $2, price_date = $3,
           min_price = $4, modal_price = $5, max_price = $6,
           arrival_quantity = $7, source = $8
       WHERE price_record_id = $9
       RETURNING price_record_id`,
      [input.marketId, input.cropId, input.priceDate, input.minPrice, input.modalPrice, input.maxPrice, input.arrivalQuantity, input.source, id],
    );
    if (result.rowCount === 0) return NextResponse.json({ message: "Price record not found" }, { status: 404 });
    return NextResponse.json({ message: "Market price updated" });
  } catch (error) {
    console.error("Admin market price PUT failed:", error);
    const code = (error as { code?: string })?.code;
    if (code === "23505") return NextResponse.json({ message: "A duplicate price record already exists" }, { status: 409 });
    if (code === "23503" || code === "23514") return NextResponse.json({ message: "Market price details violate a database constraint" }, { status: 400 });
    return NextResponse.json({ message: "Could not update market price" }, { status: 500 });
  }
}
