import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getMongoDatabase } from "@/lib/db/mongodb";
import { getFarmerIdForUser } from "@/lib/auth/farmer";
import {
  getFarmerQualityLotIds,
  getQualityLotReference,
  toQualityMongoId,
} from "@/lib/db/quality-observations";
import { parsePositiveBigintId } from "@/lib/validators/database";
import { Long } from "mongodb";

const COLLECTION = "quality_observations";
const VALID_GRADES = new Set(["A", "B", "C"]);
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATETIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status });
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function parseInspectionDate(value: unknown): Date | null {
  if (value === undefined) return new Date();
  if (typeof value !== "string") return null;

  const dateOnly = DATE_ONLY_PATTERN.exec(value);
  const dateTime = ISO_DATETIME_PATTERN.exec(value);
  const match = dateOnly ?? dateTime;
  if (!match || !isValidCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]))) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isMeasurementRecord(value: unknown): value is Record<string, string | number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const entries = Object.entries(value);
  return entries.length > 0 &&
    entries.length <= 32 &&
    entries.every(([key, measurement]) =>
      /^[A-Za-z][A-Za-z0-9_-]{0,49}$/.test(key) &&
      ((typeof measurement === "number" && Number.isFinite(measurement)) ||
        (typeof measurement === "string" &&
          measurement.trim().length > 0 &&
          measurement.length <= 200)),
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function serializeObservation<T extends Record<string, unknown>>(observation: T) {
  return Object.fromEntries(
    Object.entries(observation).map(([key, value]) => [
      key,
      ["lot_id", "crop_id", "inspector_id"].includes(key) && value != null
        ? String(value)
        : key === "_id" && value && typeof value === "object" && "toString" in value
          ? value.toString()
          : value,
    ]),
  );
}

async function getReadAccess() {
  const session = await auth();
  if (!session?.user) return { error: errorResponse("Unauthorized", 401) } as const;
  if (session.user.role === "ADMIN") return { role: "ADMIN" } as const;
  if (session.user.role !== "FARMER") {
    return { error: errorResponse("Access denied", 403) } as const;
  }

  const farmerId = await getFarmerIdForUser(session.user.user_id);
  if (!farmerId) {
    return { error: errorResponse("Farmer profile not found", 403) } as const;
  }
  return { role: "FARMER", farmerId } as const;
}

export async function GET(request: Request) {
  try {
    const access = await getReadAccess();
    if ("error" in access) return access.error;

    const lotIdParam = new URL(request.url).searchParams.get("lot_id");
    const filter: Record<string, unknown> = {};

    if (lotIdParam !== null) {
      const lotId = parsePositiveBigintId(lotIdParam);
      if (!lotId) {
        return errorResponse("lot_id must be a positive integer", 400);
      }

      if (access.role === "FARMER") {
        const lot = await getQualityLotReference(lotId);
        if (!lot) return errorResponse("Produce lot not found", 404);
        if (lot.farmer_id !== access.farmerId) {
          return errorResponse("You do not own this produce lot", 403);
        }
      }
      filter.lot_id = toQualityMongoId(lotId);
    } else if (access.role === "FARMER") {
      filter.lot_id = { $in: await getFarmerQualityLotIds(access.farmerId) };
    }

    const database = await getMongoDatabase();
    const observations = await database.collection(COLLECTION)
      .find(filter).sort({ inspection_date: -1 }).limit(100).toArray();

    return NextResponse.json({
      success: true,
      count: observations.length,
      observations: observations.map((observation) =>
        serializeObservation(observation as unknown as Record<string, unknown>),
      ),
    });
  } catch (error) {
    console.error("Fetching observations failed:", error);
    return errorResponse("Could not fetch observations", 500);
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    if (session.user.role !== "FARMER" && session.user.role !== "ADMIN") {
      return NextResponse.json({ success: false, message: "Only farmers or admins can submit quality observations" }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json() as unknown;
    } catch {
      return NextResponse.json({ success: false, message: "Request body must be valid JSON" }, { status: 400 });
    }

    if (!isRecord(body)) {
      return errorResponse("Invalid observation data", 400);
    }

    const lotId = parsePositiveBigintId(body.lot_id);
    const cropId = parsePositiveBigintId(body.crop_id);
    const assessedGrade = body.assessed_grade;
    const date = parseInspectionDate(body.inspection_date);

    if (
      !lotId ||
      !cropId ||
      typeof assessedGrade !== "string" ||
      !VALID_GRADES.has(assessedGrade) ||
      !isMeasurementRecord(body.measurements)
    ) {
      return errorResponse("Invalid observation data", 400);
    }

    if (!date) {
      return errorResponse("inspection_date must be a valid ISO date or datetime", 400);
    }

    const reference = await getQualityLotReference(lotId);
    if (!reference) {
      return errorResponse("Produce lot not found", 404);
    }

    if (session.user.role === "FARMER") {
      const farmerId = await getFarmerIdForUser(session.user.user_id);
      if (!farmerId) return errorResponse("Farmer profile not found", 403);
      if (reference.farmer_id !== farmerId) {
        return errorResponse("You do not own this produce lot", 403);
      }
    }

    if (reference.crop_id !== cropId) {
      return errorResponse("crop_id does not match the produce lot", 400);
    }

    const inspectorId = parsePositiveBigintId(session.user.user_id);
    if (!inspectorId) {
      return errorResponse("Invalid authenticated inspector", 500);
    }

    const observation = {
      lot_id: Long.fromString(lotId),
      crop_id: Long.fromString(cropId),
      crop_name: reference.crop_name,
      inspection_date: date,
      inspector: session.user.name || session.user.email || "Authenticated user",
      inspector_id: Long.fromString(inspectorId),
      measurements: body.measurements,
      assessed_grade: assessedGrade,
    };

    const database = await getMongoDatabase();
    const result = await database.collection(COLLECTION).insertOne(observation);

    return NextResponse.json({
      success: true,
      message: "Quality observation saved",
      observationId: result.insertedId.toString(),
      observation: serializeObservation(observation as unknown as Record<string, unknown>),
    }, { status: 201 });
  } catch (error) {
    console.error("Saving observation failed:", error);
    return NextResponse.json({ success: false, message: "Could not save observation" }, { status: 500 });
  }
}
