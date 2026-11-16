import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getMongoDatabase } from "@/lib/db/mongodb";
import { getFarmerIdForUser } from "@/lib/auth/farmer";
import { getFarmerQualityLotIds } from "@/lib/db/quality-observations";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN" && session.user.role !== "FARMER") {
      return NextResponse.json({ success: false, message: "Access denied" }, { status: 403 });
    }

    let lotIds: number[] | null = null;
    if (session.user.role === "FARMER") {
      const farmerId = await getFarmerIdForUser(session.user.user_id);
      if (!farmerId) {
        return NextResponse.json({ success: false, message: "Farmer profile not found" }, { status: 403 });
      }
      lotIds = await getFarmerQualityLotIds(farmerId);
    }

    const database = await getMongoDatabase();
    const report = await database.collection("quality_observations").aggregate([
      { $match: {
        lot_id: lotIds === null ? { $type: "number" } : { $in: lotIds },
        crop_id: { $type: "number" },
        assessed_grade: { $in: ["A", "B", "C"] },
        inspection_date: { $type: "date" }
      }},
      { $group: {
        _id: { crop_id: "$crop_id", crop_name: "$crop_name", assessed_grade: "$assessed_grade" },
        observationCount: { $sum: 1 },
        latestInspection: { $max: "$inspection_date" },
        uniqueLots: { $addToSet: "$lot_id" }
      }},
      { $project: {
        _id: 0,
        crop_id: "$_id.crop_id",
        crop_name: "$_id.crop_name",
        assessed_grade: "$_id.assessed_grade",
        observationCount: 1,
        distinctLotCount: { $size: "$uniqueLots" },
        latestInspection: 1
      }},
      { $sort: { crop_id: 1, assessed_grade: 1 }}
    ]).toArray();

    return NextResponse.json({ success: true, totalGroups: report.length, report });
  } catch (error) {
    console.error("Quality report failed:", error);
    return NextResponse.json({ success: false, message: "Could not generate quality report" }, { status: 500 });
  }
}
