import { NextResponse } from "next/server";
import { getMongoDatabase } from "@/lib/db/mongodb";

const COLLECTION = "quality_observations";

export async function GET(request: Request) {
  try {
    const database = await getMongoDatabase();
    const collection = database.collection(COLLECTION);

    const url = new URL(request.url);
    const lotId = url.searchParams.get("lotId");

    const filter = lotId ? { lotId } : {};

    const observations = await collection
      .find(filter)
      .sort({ observedAt: -1 })
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
    const body = await request.json();

    const {
      lotId,
      cropId,
      inspectorId,
      observationType,
      attributes,
      overallGrade,
      notes,
    } = body;

    if (
      typeof lotId !== "string" || !lotId.trim() ||
      typeof cropId !== "string" || !cropId.trim() ||
      typeof inspectorId !== "string" || !inspectorId.trim() ||
      typeof observationType !== "string" || !observationType.trim() ||
      typeof overallGrade !== "string" || !overallGrade.trim() ||
      !attributes ||
      typeof attributes !== "object" ||
      Array.isArray(attributes)
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid observation data" },
        { status: 400 }
      );
    }

    if (notes !== undefined && typeof notes !== "string") {
      return NextResponse.json(
        { success: false, message: "Notes must be text" },
        { status: 400 }
      );
    }

    const database = await getMongoDatabase();
    const collection = database.collection(COLLECTION);

    const observation = {
      lotId: lotId.trim(),
      cropId: cropId.trim(),
      observedAt: new Date(),
      inspectorId: inspectorId.trim(),
      observationType: observationType.trim(),
      attributes,
      overallGrade: overallGrade.trim(),
      ...(notes !== undefined ? { notes } : {}),
    };

    const result = await collection.insertOne(observation);

    return NextResponse.json(
      {
        success: true,
        message: "Quality observation saved",
        observationId: result.insertedId.toString(),
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
