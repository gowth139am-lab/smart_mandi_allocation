import { NextResponse } from "next/server";
import { query } from "@/lib/db/postgres";
import { requireFarmer } from "@/lib/auth/farmer";
import { parseDateOnly, parsePositiveBigintId } from "@/lib/validators/database";

const VALID_GRADES = ["A", "B", "C"];

async function getOwnedLot(id: string, farmerId: string) {
  return query(
    `SELECT pl.lot_id::text AS id, pl.farm_id::text AS farm_id,
            f.farm_name, pl.crop_id::text AS crop_id,
            c.crop_name, c.unit,
            pl.variety_id::text AS variety_id, cv.variety_name,
            pl.harvest_date::text AS harvest_date,
            pl.initial_quantity::text AS initial_quantity,
            pl.available_quantity::text AS available_quantity,
            pl.grade, pl.status, pl.expiry_date::text AS expiry_date, pl.created_at
     FROM produce_lots pl
     JOIN farms f ON f.farm_id = pl.farm_id
     JOIN crops c ON c.crop_id = pl.crop_id
     LEFT JOIN crop_varieties cv
       ON cv.variety_id = pl.variety_id AND cv.crop_id = pl.crop_id
     WHERE pl.lot_id = $1 AND f.farmer_id = $2`,
    [id, farmerId],
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const access = await requireFarmer();
    if ("error" in access) return access.error;
    const { id } = await params;
    if (!parsePositiveBigintId(id)) return NextResponse.json({ message: "Invalid lot ID" }, { status: 400 });

    const result = await getOwnedLot(id, access.farmerId);
    if (result.rowCount === 0) return NextResponse.json({ message: "Lot not found" }, { status: 404 });
    return NextResponse.json({ lot: result.rows[0] });
  } catch (error) {
    console.error("Farmer lot GET failed:", error);
    return NextResponse.json({ message: "Could not load produce lot" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const access = await requireFarmer();
    if ("error" in access) return access.error;
    const { id } = await params;
    if (!parsePositiveBigintId(id)) return NextResponse.json({ message: "Invalid lot ID" }, { status: 400 });

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

    const existing = await getOwnedLot(id, access.farmerId);
    if (existing.rowCount === 0) return NextResponse.json({ message: "Lot not found" }, { status: 404 });
    const currentLot = existing.rows[0];

    const hasHarvestDate = Object.hasOwn(data, "harvestDate");
    const hasExpiryDate = Object.hasOwn(data, "expiryDate");
    const harvestDate = hasHarvestDate
      ? parseDateOnly(data.harvestDate)
      : parseDateOnly(currentLot.harvest_date);
    const expiryDate = hasExpiryDate
      ? (data.expiryDate === null || data.expiryDate === ""
        ? null
        : parseDateOnly(data.expiryDate))
      : parseDateOnly(currentLot.expiry_date);
    const grade = Object.hasOwn(data, "grade")
      ? (data.grade == null || data.grade === "" ? null : String(data.grade).trim())
      : currentLot.grade;
    if (
      harvestDate === null ||
      (hasExpiryDate && data.expiryDate !== null && data.expiryDate !== "" && expiryDate === null) ||
      (expiryDate !== null && expiryDate < harvestDate) ||
      (grade !== null && !VALID_GRADES.includes(grade))
    ) {
      return NextResponse.json({ message: "Please enter valid harvest date, expiry date, and grade values" }, { status: 400 });
    }

    const result = await query(
      `UPDATE produce_lots pl
       SET harvest_date = $1, grade = $2, expiry_date = $3
       FROM farms f
       WHERE pl.lot_id = $4
         AND pl.farm_id = f.farm_id
         AND f.farmer_id = $5
         AND NOT EXISTS (
           SELECT 1 FROM sale_items si WHERE si.lot_id = pl.lot_id
         )
       RETURNING pl.lot_id::text AS id`,
      [harvestDate, grade, expiryDate, id, access.farmerId],
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ message: "Lots involved in sales cannot be edited" }, { status: 409 });
    }
    return NextResponse.json({ message: "Produce lot updated successfully", id });
  } catch (error) {
    console.error("Farmer lot PUT failed:", error);
    return NextResponse.json({ message: "Could not update produce lot" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const access = await requireFarmer();
    if ("error" in access) return access.error;
    const { id } = await params;
    if (!parsePositiveBigintId(id)) return NextResponse.json({ message: "Invalid lot ID" }, { status: 400 });

    const result = await query(
      `DELETE FROM produce_lots pl
       USING farms f
       WHERE pl.lot_id = $1
         AND pl.farm_id = f.farm_id
         AND f.farmer_id = $2
         AND pl.status = 'AVAILABLE'
         AND pl.available_quantity = pl.initial_quantity
         AND NOT EXISTS (
           SELECT 1 FROM sale_items si WHERE si.lot_id = pl.lot_id
         )
       RETURNING pl.lot_id::text AS id`,
      [id, access.farmerId],
    );

    if (result.rowCount === 0) {
      const existing = await getOwnedLot(id, access.farmerId);
      if (existing.rowCount === 0) return NextResponse.json({ message: "Lot not found" }, { status: 404 });
      return NextResponse.json(
        { message: "Only unsold, fully available lots can be deleted" },
        { status: 409 },
      );
    }
    return NextResponse.json({ message: "Produce lot deleted successfully", id });
  } catch (error) {
    console.error("Farmer lot DELETE failed:", error);
    return NextResponse.json({ message: "Could not delete produce lot" }, { status: 500 });
  }
}
