import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { query } from "@/lib/db/postgres";

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

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ message: "Request body must be valid JSON" }, { status: 400 });
    }
    const cropName = typeof body.cropName === "string" ? body.cropName.trim() : "";
    const quantity = Number(body.requiredQuantity);
    const maximumPrice =
      body.maximumPrice === "" || body.maximumPrice === null || body.maximumPrice === undefined
        ? null
        : Number(body.maximumPrice);
    const grade = body.minimumGrade ? String(body.minimumGrade).trim() : null;
    const location = typeof body.location === "string" ? body.location.trim() : "";
    const requiredDate = body.requiredDate || null;

    if (!cropName || cropName.length > 100 ||
        !Number.isFinite(quantity) || quantity <= 0 ||
        (maximumPrice !== null && (!Number.isFinite(maximumPrice) || maximumPrice < 0)) ||
        (grade !== null && grade.length > 20) ||
        !location || location.length > 200 ||
        (grade !== null && !["A", "B", "C"].includes(grade))) {
      return NextResponse.json({ message: "Please enter valid demand details" }, { status: 400 });
    }

    if (requiredDate && (typeof requiredDate !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(requiredDate) ||
        Number.isNaN(Date.parse(`${requiredDate}T00:00:00Z`)))) {
      return NextResponse.json({ message: "Invalid required date" }, { status: 400 });
    }

    const crop = await query(
      "SELECT crop_id FROM crops WHERE LOWER(crop_name) = LOWER($1)",
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
