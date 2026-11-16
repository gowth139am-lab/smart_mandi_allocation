import { NextResponse } from "next/server";
import { requireFarmer } from "@/lib/auth/farmer";
import { query } from "@/lib/db/postgres";
import {
  parseDateOnly,
  parsePositiveBigintId,
} from "@/lib/validators/database";

export async function GET(request: Request) {
  try {
    const access = await requireFarmer();
    if ("error" in access) return access.error;

    const params = new URL(request.url).searchParams;
    const rawCropId = params.get("crop_id");
    const rawMarketId = params.get("market_id");
    const rawFrom = params.get("from");
    const rawTo = params.get("to");
    const cropId = rawCropId ? parsePositiveBigintId(rawCropId) : null;
    const marketId = rawMarketId ? parsePositiveBigintId(rawMarketId) : null;
    const fromDate = rawFrom ? parseDateOnly(rawFrom) : null;
    const toDate = rawTo ? parseDateOnly(rawTo) : null;

    if (
      (rawCropId && !cropId) ||
      (rawMarketId && !marketId) ||
      (rawFrom && !fromDate) ||
      (rawTo && !toDate) ||
      (fromDate && toDate && fromDate > toDate)
    ) {
      return NextResponse.json(
        { message: "Enter valid crop, market, and date filters" },
        { status: 400 },
      );
    }

    const [prices, crops, markets] = await Promise.all([
      query(
        `SELECT DISTINCT ON (pr.market_id, pr.crop_id)
                pr.price_record_id::text AS id,
                pr.market_id::text AS market_id,
                m.market_name,
                m.district,
                pr.crop_id::text AS crop_id,
                c.crop_name,
                COALESCE(pr.unit, c.unit) AS unit,
                pr.price_date::text AS price_date,
                pr.min_price::text AS min_price,
                pr.max_price::text AS max_price,
                pr.modal_price::text AS modal_price,
                pr.arrival_quantity::text AS arrival_quantity,
                pr.source
         FROM price_records pr
         JOIN markets m ON m.market_id = pr.market_id
         JOIN crops c ON c.crop_id = pr.crop_id
         WHERE ($1::bigint IS NULL OR pr.crop_id = $1)
           AND ($2::bigint IS NULL OR pr.market_id = $2)
           AND ($3::date IS NULL OR pr.price_date >= $3)
           AND ($4::date IS NULL OR pr.price_date <= $4)
         ORDER BY pr.market_id, pr.crop_id,
                  pr.price_date DESC, pr.price_record_id DESC`,
        [cropId, marketId, fromDate, toDate],
      ),
      query(`SELECT crop_id::text AS id, crop_name, unit FROM crops ORDER BY crop_name`),
      query(
        `SELECT market_id::text AS id, market_name, district
         FROM markets WHERE status = 'ACTIVE'
         ORDER BY market_name, market_id`,
      ),
    ]);

    return NextResponse.json({
      prices: prices.rows,
      crops: crops.rows,
      markets: markets.rows,
    });
  } catch (error) {
    console.error("Farmer market prices GET failed:", error);
    return NextResponse.json(
      { message: "Could not load market prices" },
      { status: 500 },
    );
  }
}
