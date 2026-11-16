import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { query } from "@/lib/db/postgres";
import { parseDateOnly, parsePostgresNumeric } from "@/lib/validators/database";

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (session.user.role !== "BUYER" || !session.user.buyer_id) {
      return NextResponse.json({ message: "Buyer access required" }, { status: 403 });
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
       WHERE d.buyer_id = $1
       ORDER BY d.created_at DESC`,
      [session.user.buyer_id]
    );

    return NextResponse.json({ demands: result.rows });
  } catch (error) {
    console.error("Buyer demands GET failed:", error);
    return NextResponse.json({ message: "Could not load demands" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (session.user.role !== "BUYER" || !session.user.buyer_id) {
      return NextResponse.json({ message: "Buyer access required" }, { status: 403 });
    }

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
    const cropName = typeof data.cropName === "string" ? data.cropName.trim() : "";
    const quantity = parsePostgresNumeric(data.requiredQuantity, 12, 3, true);
    const hasMaximumPrice =
      data.maximumPrice !== "" && data.maximumPrice !== null && data.maximumPrice !== undefined;
    const maximumPrice =
      hasMaximumPrice
        ? parsePostgresNumeric(data.maximumPrice, 12, 2, false)
        : null;
    const grade = data.minimumGrade ? String(data.minimumGrade).trim() : null;
    const location = typeof data.location === "string" ? data.location.trim() : "";
    const hasRequiredDate =
      data.requiredDate !== "" && data.requiredDate !== null && data.requiredDate !== undefined;
    const requiredDate = hasRequiredDate ? parseDateOnly(data.requiredDate) : null;

    if (!cropName || cropName.length > 100 ||
        quantity === null ||
        (hasMaximumPrice && maximumPrice === null) ||
        (grade !== null && grade.length > 20) ||
        !location || location.length > 200 ||
        (grade !== null && !["A", "B", "C"].includes(grade)) ||
        (hasRequiredDate && requiredDate === null)) {
      return NextResponse.json({ message: "Please enter valid demand details" }, { status: 400 });
    }

    const crop = await query(
      "SELECT crop_id::text AS crop_id FROM crops WHERE LOWER(crop_name) = LOWER($1)",
      [cropName]
    );

    if (crop.rowCount === 0) {
      return NextResponse.json({ message: "Crop not found. Choose a crop in the database." }, { status: 400 });
    }

    const result = await query(
      `INSERT INTO buyer_demands
         (buyer_id, crop_id, required_quantity, remaining_quantity,
          minimum_grade, maximum_price, required_date, location)
       VALUES ($1, $2, $3, $3, $4, $5, $6, $7)
       RETURNING demand_id::text AS id`,
      [
        session.user.buyer_id,
        crop.rows[0].crop_id,
        quantity,
        grade,
        maximumPrice,
        requiredDate,
        location
      ]
    );

    return NextResponse.json(
      { message: "Demand created successfully", id: result.rows[0].id },
      { status: 201 }
    );
  } catch (error) {
    console.error("Buyer demands POST failed:", error);
    return NextResponse.json({ message: "Could not create demand" }, { status: 500 });
  }
}
