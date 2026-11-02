import { NextResponse } from "next/server";
import { getMongoDatabase } from "@/lib/db/mongodb";

export async function GET() {
  try {
    const database = await getMongoDatabase();

    const report = await database
      .collection("quality_observations")
      .aggregate([
        {
          $group: {
            _id: {
              cropId: "$cropId",
              overallGrade: "$overallGrade",
            },
            observationCount: { $sum: 1 },
            latestObservation: { $max: "$observedAt" },
            uniqueLots: { $addToSet: "$lotId" },
          },
        },
        {
          $project: {
            _id: 0,
            cropId: "$_id.cropId",
            overallGrade: "$_id.overallGrade",
            observationCount: 1,
            distinctLotCount: { $size: "$uniqueLots" },
            latestObservation: 1,
          },
        },
        {
          $sort: {
            cropId: 1,
            overallGrade: 1,
          },
        },
      ])
      .toArray();

    return NextResponse.json({
      success: true,
      totalGroups: report.length,
      report,
    });
  } catch (error) {
    console.error("Quality report failed:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Could not generate quality report",
      },
      { status: 500 }
    );
  }
}
