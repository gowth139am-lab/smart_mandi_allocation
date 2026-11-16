import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { postgresPool, query } from "@/lib/db/postgres";
import {
  databaseConflictResponse,
  requireFarmerSalesAccess,
} from "@/lib/auth/sales";
import {
  parsePostgresNumeric,
  parsePositiveBigintId,
} from "@/lib/validators/database";

type AllocationInput = {
  lotId: string;
  demandId: string;
  quantity: string;
  pricePerUnit: string;
};

function parseAllocationItems(value: unknown): AllocationInput[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    return null;
  }

  const items: AllocationInput[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return null;
    }

    const data = item as Record<string, unknown>;
    const lotId = parsePositiveBigintId(data.lotId);
    const demandId = parsePositiveBigintId(data.demandId);
    const quantity = parsePostgresNumeric(data.quantity, 12, 3, true);
    const pricePerUnit = parsePostgresNumeric(data.pricePerUnit, 12, 2, false);

    if (!lotId || !demandId || quantity === null || pricePerUnit === null) {
      return null;
    }

    items.push({ lotId, demandId, quantity, pricePerUnit });
  }

  return items;
}

function uniqueIds(values: string[]) {
  return [...new Set(values)];
}

async function getBuyerIdForRequest(buyerId: string, client: import("pg").PoolClient) {
  const result = await client.query(
    `SELECT buyer_id::text AS buyer_id
     FROM buyers
     WHERE buyer_id = $1 AND status = 'ACTIVE'`,
    [buyerId],
  );
  return result.rows[0]?.buyer_id as string | undefined;
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role === "BUYER" && session.user.buyer_id) {
      const result = await query(
        `SELECT s.sale_id::text AS id, s.sale_date, s.farmer_id::text AS farmer_id,
                s.buyer_id::text AS buyer_id, s.sale_status, s.payment_status,
                s.total_amount::text AS total_amount, s.cancelled_at,
                s.cancellation_reason, COUNT(si.sale_item_id)::int AS total_items,
                COALESCE(SUM(si.quantity), 0)::text AS total_quantity
         FROM sales s
         LEFT JOIN sale_items si ON si.sale_id = s.sale_id
         WHERE s.buyer_id = $1
         GROUP BY s.sale_id
         ORDER BY s.created_at DESC, s.sale_id DESC`,
        [session.user.buyer_id],
      );
      return NextResponse.json({ sales: result.rows });
    }

    if (session.user.role === "FARMER") {
      const access = await requireFarmerSalesAccess();
      if ("error" in access) return access.error;

      const result = await query(
        `SELECT s.sale_id::text AS id, s.sale_date, s.farmer_id::text AS farmer_id,
                s.buyer_id::text AS buyer_id, s.sale_status, s.payment_status,
                s.total_amount::text AS total_amount, s.cancelled_at,
                s.cancellation_reason, COUNT(si.sale_item_id)::int AS total_items,
                COALESCE(SUM(si.quantity), 0)::text AS total_quantity
         FROM sales s
         LEFT JOIN sale_items si ON si.sale_id = s.sale_id
         WHERE s.farmer_id = $1
         GROUP BY s.sale_id
         ORDER BY s.created_at DESC, s.sale_id DESC`,
        [access.farmerId],
      );
      return NextResponse.json({ sales: result.rows });
    }

    if (session.user.role === "ADMIN") {
      const result = await query(
        `SELECT s.sale_id::text AS id, s.sale_date, s.farmer_id::text AS farmer_id,
                s.buyer_id::text AS buyer_id, s.sale_status, s.payment_status,
                s.total_amount::text AS total_amount, s.cancelled_at,
                s.cancellation_reason, COUNT(si.sale_item_id)::int AS total_items,
                COALESCE(SUM(si.quantity), 0)::text AS total_quantity
         FROM sales s
         LEFT JOIN sale_items si ON si.sale_id = s.sale_id
         GROUP BY s.sale_id
         ORDER BY s.created_at DESC, s.sale_id DESC`,
      );
      return NextResponse.json({ sales: result.rows });
    }

    return NextResponse.json({ message: "Sales access required" }, { status: 403 });
  } catch (error) {
    console.error("Sales GET failed:", error);
    return NextResponse.json({ message: "Could not load sales" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = await requireFarmerSalesAccess();
  if ("error" in access) return access.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Request body must be valid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ message: "Request body must be a JSON object" }, { status: 400 });
  }

  const data = body as Record<string, unknown>;
  const buyerId = parsePositiveBigintId(data.buyerId);
  const marketId =
    data.marketId === undefined || data.marketId === null || data.marketId === ""
      ? null
      : parsePositiveBigintId(data.marketId);
  const items = parseAllocationItems(data.allocations);

  if (!buyerId || (data.marketId !== undefined && data.marketId !== null && data.marketId !== "" && !marketId) || !items) {
    return NextResponse.json({ message: "Please enter valid sale details" }, { status: 400 });
  }

  const client = await postgresPool.connect();
  try {
    await client.query("BEGIN");

    if (!(await getBuyerIdForRequest(buyerId, client))) {
      await client.query("ROLLBACK");
      return NextResponse.json({ message: "Buyer not found" }, { status: 400 });
    }

    if (marketId) {
      const market = await client.query(
        `SELECT market_id
         FROM markets
         WHERE market_id = $1 AND status = 'ACTIVE'`,
        [marketId],
      );
      if (market.rowCount === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ message: "Market not found" }, { status: 400 });
      }
    }

    const lotIds = uniqueIds(items.map((item) => item.lotId));
    const demandIds = uniqueIds(items.map((item) => item.demandId));

    const lots = await client.query(
      `SELECT pl.lot_id::text AS lot_id
       FROM produce_lots pl
       JOIN farms f ON f.farm_id = pl.farm_id
       WHERE f.farmer_id = $1 AND pl.lot_id = ANY($2::bigint[])`,
      [access.farmerId, lotIds],
    );
    if (lots.rowCount !== lotIds.length) {
      await client.query("ROLLBACK");
      return NextResponse.json({ message: "One or more lots do not belong to this farmer" }, { status: 403 });
    }

    const demands = await client.query(
      `SELECT demand_id::text AS demand_id
       FROM buyer_demands
       WHERE buyer_id = $1 AND demand_id = ANY($2::bigint[])`,
      [buyerId, demandIds],
    );
    if (demands.rowCount !== demandIds.length) {
      await client.query("ROLLBACK");
      return NextResponse.json({ message: "One or more demands do not belong to this buyer" }, { status: 403 });
    }

    const sale = await client.query<{ id: string }>(
      `INSERT INTO sales (farmer_id, buyer_id, market_id)
       VALUES ($1, $2, $3)
       RETURNING sale_id::text AS id`,
      [access.farmerId, buyerId, marketId],
    );

    const saleId = sale.rows[0].id;
    const saleItemIds: string[] = [];
    for (const item of items) {
      const allocation = await client.query<{ id: string }>(
        `SELECT allocate_sale_item($1, $2, $3, $4, $5)::text AS id`,
        [saleId, item.lotId, item.demandId, item.quantity, item.pricePerUnit],
      );
      saleItemIds.push(allocation.rows[0].id);
    }

    await client.query("COMMIT");
    return NextResponse.json(
      { message: "Sale created and allocated successfully", id: saleId, saleItemIds },
      { status: 201 },
    );
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Sale creation rollback failed:", rollbackError);
    }

    const conflict = databaseConflictResponse(error);
    if (conflict) return conflict;

    console.error("Sales POST failed:", error);
    return NextResponse.json({ message: "Could not create sale" }, { status: 500 });
  } finally {
    client.release();
  }
}
