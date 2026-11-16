import { NextResponse } from "next/server";
import { query } from "@/lib/db/postgres";
import { requireFarmer } from "@/lib/auth/farmer";
import { farmCreateSchema } from "@/lib/validators/farmer";

export async function GET() {
  try {
    const access = await requireFarmer();
    if ("error" in access) return access.error;

    const result = await query(
      `SELECT farm_id::text AS id, farm_name, location,
              area_acres::text AS area_acres, soil_type, irrigation_type
       FROM farms
       WHERE farmer_id = $1
       ORDER BY farm_name, farm_id`,
      [access.farmerId],
    );

    return NextResponse.json({ farms: result.rows });
  } catch (error) {
    console.error("Farmer farms GET failed:", error);
    return NextResponse.json({ message: "Could not load farms" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireFarmer();
    if ("error" in access) return access.error;

    let body: unknown;
    try {
      body = await request.json() as unknown;
    } catch {
      return NextResponse.json({ message: "Request body must be valid JSON" }, { status: 400 });
    }

    const parsed = farmCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Please enter valid farm details", errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { farmName, location, areaAcres, soilType, irrigationType } = parsed.data;
    const result = await query<{
      id: string;
      farm_name: string;
      location: string | null;
      area_acres: string | null;
      soil_type: string | null;
      irrigation_type: string | null;
    }>(
      `INSERT INTO farms
         (farmer_id, farm_name, location, area_acres, soil_type, irrigation_type)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING farm_id::text AS id, farm_name, location,
                 area_acres::text AS area_acres, soil_type, irrigation_type`,
      [access.farmerId, farmName, location, areaAcres, soilType, irrigationType],
    );

    return NextResponse.json(
      { message: "Farm created successfully", farm: result.rows[0] },
      { status: 201 },
    );
  } catch (error) {
    console.error("Farmer farms POST failed:", error);
    return NextResponse.json({ message: "Could not create farm" }, { status: 500 });
  }
}
