import { NextResponse } from "next/server";
import { postgresPool } from "@/lib/db/postgres";
import { requireFarmerSalesAccess, databaseConflictResponse } from "@/lib/auth/sales";
import { parsePositiveBigintId } from "@/lib/validators/database";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const access = await requireFarmerSalesAccess();
  if ("error" in access) return access.error;

  const { id } = await params;
  const saleId = parsePositiveBigintId(id);
  if (!saleId) {
    return NextResponse.json({ message: "Sale not found" }, { status: 404 });
  }

  let body: unknown = {};
  try {
    const rawBody = await request.text();
    if (rawBody.trim()) {
      body = JSON.parse(rawBody);
    }
  } catch {
    return NextResponse.json({ message: "Request body must be valid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ message: "Request body must be a JSON object" }, { status: 400 });
  }

  const reasonValue = (body as Record<string, unknown>).reason;
  const reason = reasonValue === undefined || reasonValue === null ? "" : reasonValue;
  if (typeof reason !== "string" || reason.length > 2000) {
    return NextResponse.json({ message: "Invalid cancellation reason" }, { status: 400 });
  }

  const client = await postgresPool.connect();
  try {
    await client.query("BEGIN");

    const ownership = await client.query(
      `SELECT s.sale_id
       FROM sales s
       WHERE s.sale_id = $1 AND s.farmer_id = $2
       FOR UPDATE`,
      [saleId, access.farmerId],
    );
    if (ownership.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ message: "Sale not found" }, { status: 404 });
    }

    const result = await client.query<{ message: string }>(
      `SELECT cancel_sale($1, $2) AS message`,
      [saleId, reason],
    );

    await client.query("COMMIT");
    return NextResponse.json({ message: result.rows[0].message });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Sale cancellation rollback failed:", rollbackError);
    }

    const conflict = databaseConflictResponse(error);
    if (conflict) return conflict;

    console.error("Sale cancellation POST failed:", error);
    return NextResponse.json({ message: "Could not cancel sale" }, { status: 500 });
  } finally {
    client.release();
  }
}
