import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { query } from "@/lib/db/postgres";
import { parseMarketPriceInput } from "@/lib/validators/market-price";

export async function GET() {
  try {
    const access = await requireAdmin();
    if ("error" in access) return access.error;

    const [prices, markets, crops, marketCrops] = await Promise.all([
      query(
        `SELECT pr.price_record_id::text AS id,
                pr.market_id::text AS market_id, m.market_name,
                pr.crop_id::text AS crop_id, c.crop_name,
                COALESCE(pr.unit, c.unit) AS unit,
                pr.price_date::text AS price_date,
                pr.min_price::text AS min_price,
                pr.modal_price::text AS modal_price,
                pr.max_price::text AS max_price,
                pr.arrival_quantity::text AS arrival_quantity,
                pr.source
         FROM price_records pr
         JOIN markets m ON m.market_id = pr.market_id
         JOIN crops c ON c.crop_id = pr.crop_id
         ORDER BY pr.price_date DESC, pr.price_record_id DESC`,
      ),
      query(`SELECT market_id::text AS id, market_name, status FROM markets ORDER BY market_name, market_id`),
      query(`SELECT crop_id::text AS id, crop_name, unit FROM crops ORDER BY crop_name, crop_id`),
      query(
        `SELECT mc.market_id::text AS market_id, mc.crop_id::text AS crop_id
         FROM market_crops mc
         JOIN markets m ON m.market_id = mc.market_id
         JOIN crops c ON c.crop_id = mc.crop_id`,
      ),
    ]);
    return NextResponse.json({ prices: prices.rows, markets: markets.rows, crops: crops.rows, marketCrops: marketCrops.rows });
  } catch (error) {
    console.error("Admin market prices GET failed:", error);
    return NextResponse.json({ message: "Could not load market prices" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireAdmin();
    if ("error" in access) return access.error;
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
       LIMIT 1`,
      [input.marketId, input.cropId, input.priceDate],
    );
    if (duplicate.rowCount) {
      return NextResponse.json({ message: "A price record already exists for this market, crop, and date" }, { status: 409 });
    }
    const result = await query<{ id: string }>(
      `INSERT INTO price_records
         (market_id, crop_id, price_date, min_price, modal_price, max_price, arrival_quantity, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING price_record_id::text AS id`,
      [input.marketId, input.cropId, input.priceDate, input.minPrice, input.modalPrice, input.maxPrice, input.arrivalQuantity, input.source],
    );
    return NextResponse.json({ message: "Market price added", id: result.rows[0].id }, { status: 201 });
  } catch (error) {
    console.error("Admin market prices POST failed:", error);
    const code = (error as { code?: string })?.code;
    if (code === "23505") return NextResponse.json({ message: "A duplicate price record already exists" }, { status: 409 });
    if (code === "23503" || code === "23514") return NextResponse.json({ message: "Market price details violate a database constraint" }, { status: 400 });
    return NextResponse.json({ message: "Could not add market price" }, { status: 500 });
  }
}
