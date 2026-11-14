import { NextResponse } from "next/server";
import { getMongoDatabase } from "@/lib/db/mongodb";
import { query } from "@/lib/db/postgres";

const COLLECTION = "quality_observations";
const VALID_GRADES = ["A", "B", "C"];

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const lotIdParam = url.searchParams.get("lot_id");

    const filter: Record<string, unknown> = {};

    if (lotIdParam !== null) {
      const lotId = Number(lotIdParam);

      if (!Number.isSafeInteger(lotId) || lotId <= 0) {
        return NextResponse.json(
          { success: false, message: "lot_id must be a positive integer" },
          { status: 400 }
        );
      }

      filter.lot_id = lotId;
    }

    const database = await getMongoDatabase();
    const observations = await database
      .collection(COLLECTION)
      .find(filter)
      .sort({ inspection_date: -1 })
      .limit(100)
      .toArray();

    return NextResponse.json({
      success: true,
      count: observations.length,
      observations: observations.map(({ _id, ...rest }) => ({
        ...rest,
        _id: _id.toString(),
      })),
    });
  } catch (error) {
    console.error("Fetching observations failed:", error);
    return NextResponse.json(
      { success: false, message: "Could not fetch observations" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    let body: Record<string, unknown>;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, message: "Request body must be valid JSON" },
        { status: 400 }
      );
    }

    const {
      lot_id,
      crop_id,
      inspector,
      inspector_id,
      measurements,
      assessed_grade,
      inspection_date,
    } = body;

    if (
      !Number.isSafeInteger(lot_id) ||
      (lot_id as number) <= 0 ||
      !Number.isSafeInteger(crop_id) ||
      (crop_id as number) <= 0 ||
      typeof inspector !== "string" ||
      !inspector.trim() ||
      !(inspector_id === null ||
        (Number.isSafeInteger(inspector_id) && (inspector_id as number) > 0)) ||
      !measurements ||
      typeof measurements !== "object" ||
      Array.isArray(measurements) ||
      typeof assessed_grade !== "string" ||
      !VALID_GRADES.includes(assessed_grade)
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid observation data" },
        { status: 400 }
      );
    }

    const date = inspection_date === undefined
      ? new Date()
      : new Date(inspection_date as string);

    if (
      !(date instanceof Date) ||
      Number.isNaN(date.getTime()) ||
      (inspection_date !== undefined && typeof inspection_date !== "string")
    ) {
      return NextResponse.json(
        { success: false, message: "inspection_date must be a valid date string" },
        { status: 400 }
      );
    }

    const reference = await query<{
      lot_id: string;
      crop_id: string;
      crop_name: string;
    }>(
      `SELECT pl.lot_id::text, pl.crop_id::text, c.crop_name
       FROM produce_lots pl
       JOIN crops c ON c.crop_id = pl.crop_id
       WHERE pl.lot_id = $1 AND pl.crop_id = $2`,
      [lot_id, crop_id]
    );

    if (reference.rowCount === 0) {
      return NextResponse.json(
        { success: false, message: "Produce lot does not exist or does not belong to this crop" },
        { status: 400 }
      );
    }

    const database = await getMongoDatabase();

    const observation = {
      lot_id,
      crop_id,
      crop_name: reference.rows[0].crop_name,
      inspection_date: date,
      inspector: inspector.trim(),
      inspector_id,
      measurements,
      assessed_grade,
    };

    const result = await database
      .collection(COLLECTION)
      .insertOne(observation);

    return NextResponse.json(
      {
        success: true,
        message: "Quality observation saved",
        observationId: result.insertedId.toString(),
        observation,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Saving observation failed:", error);
    return NextResponse.json(
      { success: false, message: "Could not save observation" },
      { status: 500 }
    );
  }
}