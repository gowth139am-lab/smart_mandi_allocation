import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { query } from "@/lib/db/postgres";
import {
  parseDateOnly,
  parsePostgresNumeric,
  parsePositiveBigintId,
} from "@/lib/validators/database";

type RouteContext = { params: Promise<{ id: string }> };

async function getBuyerDemand(id: string, buyerId: string) {
  return query(
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
    [id, buyerId],
  );
}

async function authorizeBuyer() {
  const session = await auth();
  if (!session?.user) {
    return { response: NextResponse.json({ message: "Unauthorized" }, { status: 401 }) };
  }
  if (session.user.role !== "BUYER" || !session.user.buyer_id) {
    return { response: NextResponse.json({ message: "Buyer access required" }, { status: 403 }) };
  }
  return { session };
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const access = await authorizeBuyer();
    if ("response" in access) return access.response;
    const buyerId = access.session.user.buyer_id;
    if (!buyerId) return NextResponse.json({ message: "Buyer access required" }, { status: 403 });
    const { id } = await params;
    if (!parsePositiveBigintId(id)) return NextResponse.json({ message: "Invalid demand ID" }, { status: 400 });
    const result = await getBuyerDemand(id, buyerId);
    if (result.rowCount === 0) {
      return NextResponse.json({ message: "Demand not found" }, { status: 404 });
    }
    return NextResponse.json({ demand: result.rows[0] });
  } catch (error) {
    console.error("Buyer demand detail GET failed:", error);
    return NextResponse.json({ message: "Could not load demand" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: RouteContext) {
  try {
    const access = await authorizeBuyer();
    if ("response" in access) return access.response;
    const buyerId = access.session.user.buyer_id;
    if (!buyerId) return NextResponse.json({ message: "Buyer access required" }, { status: 403 });
    const { id } = await params;
    if (!parsePositiveBigintId(id)) return NextResponse.json({ message: "Invalid demand ID" }, { status: 400 });

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
    const location = typeof data.location === "string" ? data.location.trim() : "";
    const grade = data.minimumGrade === "" || data.minimumGrade == null ? null : String(data.minimumGrade).trim();
    const hasMaximumPrice = data.maximumPrice !== "" && data.maximumPrice != null;
    const maximumPrice = hasMaximumPrice
      ? parsePostgresNumeric(data.maximumPrice, 12, 2, false)
      : null;
    const hasRequiredDate = data.requiredDate !== "" && data.requiredDate != null;
    const requiredDate = hasRequiredDate ? parseDateOnly(data.requiredDate) : null;
    if (
      !location || location.length > 200 ||
      (grade !== null && !["A", "B", "C"].includes(grade)) ||
      (hasMaximumPrice && maximumPrice === null) ||
      (hasRequiredDate && requiredDate === null)
    ) {
      return NextResponse.json({ message: "Please enter valid demand details" }, { status: 400 });
    }

    const result = await query(
      `UPDATE buyer_demands
       SET minimum_grade = $1, maximum_price = $2, required_date = $3, location = $4
       WHERE demand_id = $5 AND buyer_id = $6
         AND status IN ('OPEN', 'PARTIALLY_FULFILLED')
       RETURNING demand_id::text AS id`,
      [grade, maximumPrice, requiredDate, location, id, buyerId],
    );
    if (result.rowCount === 0) {
      const existing = await getBuyerDemand(id, buyerId);
      if (existing.rowCount === 0) return NextResponse.json({ message: "Demand not found" }, { status: 404 });
      return NextResponse.json({ message: "Only open demands can be updated" }, { status: 409 });
    }
    return NextResponse.json({ message: "Demand updated successfully", id });
  } catch (error) {
    console.error("Buyer demand PUT failed:", error);
    return NextResponse.json({ message: "Could not update demand" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const access = await authorizeBuyer();
    if ("response" in access) return access.response;
    const buyerId = access.session.user.buyer_id;
    if (!buyerId) return NextResponse.json({ message: "Buyer access required" }, { status: 403 });
    const { id } = await params;
    if (!parsePositiveBigintId(id)) return NextResponse.json({ message: "Invalid demand ID" }, { status: 400 });
    const result = await query(
      `UPDATE buyer_demands
       SET status = 'CANCELLED'
       WHERE demand_id = $1 AND buyer_id = $2
         AND status IN ('OPEN', 'PARTIALLY_FULFILLED')
       RETURNING demand_id::text AS id`,
      [id, buyerId],
    );
    if (result.rowCount === 0) {
      const existing = await getBuyerDemand(id, buyerId);
      if (existing.rowCount === 0) return NextResponse.json({ message: "Demand not found" }, { status: 404 });
      return NextResponse.json({ message: "Only open demands can be cancelled" }, { status: 409 });
    }
    return NextResponse.json({ message: "Demand cancelled successfully", id });
  } catch (error) {
    console.error("Buyer demand DELETE failed:", error);
    return NextResponse.json({ message: "Could not cancel demand" }, { status: 500 });
  }
}
