import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getMongoDatabase } from "@/lib/db/mongodb";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    if (!["ADMIN", "FARMER", "BUYER"].includes(session.user.role)) {
      return NextResponse.json({ success: false, message: "Access denied" }, { status: 403 });
    }

    const database = await getMongoDatabase();
    const report = await database.collection("quality_observations").aggregate([
      { $match: {
        lot_id: { $type: "number" },
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
