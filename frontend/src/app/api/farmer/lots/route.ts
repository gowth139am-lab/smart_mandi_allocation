import { NextResponse } from "next/server";
import { query } from "@/lib/db/postgres";
import { requireFarmer } from "@/lib/auth/farmer";

const VALID_GRADES = ["A", "B", "C"];
const MAX_QUANTITY = 999999999.999;

function isValidDateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value;
}

function parsePositiveInteger(value: unknown): string | null {
  const text = typeof value === "number" ? String(value) : String(value ?? "").trim();
  return /^[1-9]\d*$/.test(text) ? text : null;
}

function parseQuantity(value: unknown): number | null {
  const quantity = typeof value === "number" ? value : Number(value);
  if (
    !Number.isFinite(quantity) ||
    quantity <= 0 ||
    quantity > MAX_QUANTITY ||
    Math.round(quantity * 1000) / 1000 !== quantity
  ) {
    return null;
  }
  return quantity;
}

async function getFarmerReference(farmerId: string, farmId: string | null) {
  const result = await query<{ farm_id: string; farm_name: string }>(
    `SELECT farm_id::text AS farm_id, farm_name
     FROM farms
     WHERE farmer_id = $1
       AND ($2::bigint IS NULL OR farm_id = $2)
     ORDER BY farm_id
     LIMIT 1`,
    [farmerId, farmId],
  );
  return result.rows[0];
}

export async function GET() {
  try {
    const access = await requireFarmer();
    if ("error" in access) return access.error;

    const [lots, farms, crops] = await Promise.all([
      query(
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
         WHERE f.farmer_id = $1
         ORDER BY pl.created_at DESC, pl.lot_id DESC`,
        [access.farmerId],
      ),
      query(
        `SELECT farm_id::text AS id, farm_name
         FROM farms
         WHERE farmer_id = $1
         ORDER BY farm_name, farm_id`,
        [access.farmerId],
      ),
      query(
        `SELECT crop_id::text AS id, crop_name, unit
         FROM crops
         ORDER BY crop_name`,
      ),
    ]);

    return NextResponse.json({
      lots: lots.rows,
      farms: farms.rows,
      crops: crops.rows,
    });
  } catch (error) {
    console.error("Farmer lots GET failed:", error);
    return NextResponse.json({ message: "Could not load produce lots" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireFarmer();
    if ("error" in access) return access.error;

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ message: "Request body must be valid JSON" }, { status: 400 });
    }

    const cropId = parsePositiveInteger(body.cropId);
    const farmId = body.farmId == null || body.farmId === ""
      ? null
      : parsePositiveInteger(body.farmId);
    const varietyId = body.varietyId == null || body.varietyId === ""
      ? null
      : parsePositiveInteger(body.varietyId);
    const quantity = parseQuantity(body.initialQuantity);
    const harvestDate = body.harvestDate;
    const expiryDate = body.expiryDate == null || body.expiryDate === ""
      ? null
      : body.expiryDate;
    const grade = body.grade == null || body.grade === "" ? null : String(body.grade).trim();

    if (
      !cropId ||
      (body.farmId != null && body.farmId !== "" && !farmId) ||
      (body.varietyId != null && body.varietyId !== "" && !varietyId) ||
      !quantity ||
      !isValidDateOnly(harvestDate) ||
      (expiryDate !== null && !isValidDateOnly(expiryDate)) ||
      (expiryDate !== null && expiryDate < harvestDate) ||
      (grade !== null && !VALID_GRADES.includes(grade))
    ) {
      return NextResponse.json({ message: "Please enter valid produce-lot details" }, { status: 400 });
    }

    const farm = await getFarmerReference(access.farmerId, farmId);
    if (!farm) {
      return NextResponse.json(
        { message: farmId ? "Farm does not belong to this farmer" : "Create a farm before adding produce" },
        { status: 400 },
      );
    }

    const crop = await query<{ crop_id: string; unit: string }>(
      `SELECT crop_id::text AS crop_id, unit
       FROM crops
       WHERE crop_id = $1`,
      [cropId],
    );
    if (crop.rowCount === 0) {
      return NextResponse.json({ message: "Crop not found" }, { status: 400 });
    }

    if (varietyId) {
      const variety = await query(
        `SELECT variety_id
         FROM crop_varieties
         WHERE variety_id = $1 AND crop_id = $2`,
        [varietyId, cropId],
      );
      if (variety.rowCount === 0) {
        return NextResponse.json({ message: "Crop variety does not belong to the selected crop" }, { status: 400 });
      }
    }

    const result = await query<{ id: string }>(
      `INSERT INTO produce_lots
         (farm_id, crop_id, variety_id, harvest_date,
          initial_quantity, available_quantity, unit, grade, expiry_date)
       VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8)
       RETURNING lot_id::text AS id`,
      [farm.farm_id, cropId, varietyId, harvestDate, quantity, crop.rows[0].unit, grade, expiryDate],
    );

    return NextResponse.json(
      { message: "Produce lot created successfully", id: result.rows[0].id },
      { status: 201 },
    );
  } catch (error) {
    console.error("Farmer lots POST failed:", error);
    return NextResponse.json({ message: "Could not create produce lot" }, { status: 500 });
  }
}
