import { NextResponse } from "next/server";
import { query } from "@/lib/db/postgres";
import { requireFarmer } from "@/lib/auth/farmer";

const VALID_GRADES = ["A", "B", "C"];

function isValidDateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value;
}

async function getOwnedLot(id: string, farmerId: string) {
  return query(
    `SELECT pl.lot_id::text AS id, pl.farm_id::text AS farm_id,
            f.farm_name, pl.crop_id::text AS crop_id,
            c.crop_name, c.unit,
            pl.variety_id::text AS variety_id, cv.variety_name,
            pl.harvest_date, pl.initial_quantity::text AS initial_quantity,
            pl.available_quantity::text AS available_quantity,
            pl.grade, pl.status, pl.expiry_date, pl.created_at
     FROM produce_lots pl
     JOIN farms f ON f.farm_id = pl.farm_id
     JOIN crops c ON c.crop_id = pl.crop_id
     LEFT JOIN crop_varieties cv
       ON cv.variety_id = pl.variety_id AND cv.crop_id = pl.crop_id
     WHERE pl.lot_id = $1 AND f.farmer_id = $2`,
    [id, farmerId],
  );
}

function validId(id: string) {
  return /^[1-9]\d*$/.test(id);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const access = await requireFarmer();
    if ("error" in access) return access.error;
    const { id } = await params;
    if (!validId(id)) return NextResponse.json({ message: "Lot not found" }, { status: 404 });

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
    if (!validId(id)) return NextResponse.json({ message: "Lot not found" }, { status: 404 });

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ message: "Request body must be valid JSON" }, { status: 400 });
    }

    const grade = body.grade == null || body.grade === "" ? null : String(body.grade).trim();
    const expiryDate = body.expiryDate == null || body.expiryDate === "" ? null : body.expiryDate;
    if (
      (grade !== null && !VALID_GRADES.includes(grade)) ||
      (expiryDate !== null && !isValidDateOnly(expiryDate))
    ) {
      return NextResponse.json({ message: "Only a valid grade and expiry date may be updated" }, { status: 400 });
    }

    const result = await query(
      `UPDATE produce_lots pl
       SET grade = $1, expiry_date = $2
       FROM farms f
       WHERE pl.lot_id = $3
         AND pl.farm_id = f.farm_id
         AND f.farmer_id = $4
         AND NOT EXISTS (
           SELECT 1 FROM sale_items si WHERE si.lot_id = pl.lot_id
         )
       RETURNING pl.lot_id::text AS id`,
      [grade, expiryDate, id, access.farmerId],
    );

    if (result.rowCount === 0) {
      const existing = await getOwnedLot(id, access.farmerId);
      if (existing.rowCount === 0) return NextResponse.json({ message: "Lot not found" }, { status: 404 });
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
    if (!validId(id)) return NextResponse.json({ message: "Lot not found" }, { status: 404 });

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
