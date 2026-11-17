import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { auth } from "@/auth";
import { getFarmerIdForUser } from "@/lib/auth/farmer";
import { getQualityLotReference } from "@/lib/db/quality-observations";
import { getMongoDatabase } from "@/lib/db/mongodb";
import { parsePositiveBigintId } from "@/lib/validators/database";
import { isMeasurementRecord, isRecord, parseInspectionDate, VALID_QUALITY_GRADES } from "@/lib/validators/quality-observation";

type RouteContext = { params: Promise<{ id: string }> };
const COLLECTION = "quality_observations";

function response(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status });
}

async function getAuthorizedObservation(rawId: string) {
  const session = await auth();
  if (!session?.user) return { error: response("Unauthorized", 401) } as const;
  if (session.user.role !== "ADMIN" && session.user.role !== "FARMER") {
    return { error: response("Access denied", 403) } as const;
  }
  if (!/^[a-f\d]{24}$/i.test(rawId) || !ObjectId.isValid(rawId)) {
    return { error: response("Invalid observation ID", 400) } as const;
  }
  const database = await getMongoDatabase();
  const observation = await database.collection(COLLECTION).findOne({ _id: new ObjectId(rawId) });
  if (!observation) return { error: response("Quality observation not found", 404) } as const;

  if (session.user.role === "FARMER") {
    const farmerId = await getFarmerIdForUser(session.user.user_id);
    if (!farmerId) return { error: response("Farmer profile not found", 403) } as const;
    const lotId = parsePositiveBigintId(String(observation.lot_id));
    const lot = lotId ? await getQualityLotReference(lotId) : null;
    if (!lot) return { error: response("Observation lot not found", 404) } as const;
    if (lot.farmer_id !== farmerId) return { error: response("You do not own this observation", 403) } as const;
  }
  return { database, observation, objectId: new ObjectId(rawId) } as const;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const access = await getAuthorizedObservation(id);
    if ("error" in access) return access.error;
    let body: unknown;
    try { body = await request.json(); } catch { return response("Request body must be valid JSON", 400); }
    if (!isRecord(body)) return response("Invalid observation data", 400);
    if (["lot_id", "crop_id", "inspector_id", "inspector"].some((field) => field in body)) {
      return response("Observation lot, crop, and inspector cannot be changed", 400);
    }
    const updates: Record<string, unknown> = {};
    if ("inspection_date" in body) {
      const date = parseInspectionDate(body.inspection_date);
      if (!date) return response("inspection_date must be a valid ISO date or datetime", 400);
      updates.inspection_date = date;
    }
    if ("assessed_grade" in body) {
      if (typeof body.assessed_grade !== "string" || !VALID_QUALITY_GRADES.has(body.assessed_grade)) {
        return response("assessed_grade must be A, B, or C", 400);
      }
      updates.assessed_grade = body.assessed_grade;
    }
    if ("measurements" in body) {
      if (!isMeasurementRecord(body.measurements)) return response("Invalid measurements", 400);
      updates.measurements = body.measurements;
    }
    if (Object.keys(updates).length === 0) return response("Provide at least one editable field", 400);

    const result = await access.database.collection(COLLECTION).updateOne(
      { _id: access.objectId },
      { $set: updates },
    );
    if (result.matchedCount === 0) return response("Quality observation not found", 404);
    return NextResponse.json({ success: true, message: "Quality observation updated" });
  } catch (error) {
    console.error("Updating quality observation failed:", error);
    return response("Could not update quality observation", 500);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const access = await getAuthorizedObservation(id);
    if ("error" in access) return access.error;
    const result = await access.database.collection(COLLECTION).deleteOne({ _id: access.objectId });
    if (result.deletedCount === 0) return response("Quality observation not found", 404);
    return NextResponse.json({ success: true, message: "Quality observation deleted" });
  } catch (error) {
    console.error("Deleting quality observation failed:", error);
    return response("Could not delete quality observation", 500);
  }
}
