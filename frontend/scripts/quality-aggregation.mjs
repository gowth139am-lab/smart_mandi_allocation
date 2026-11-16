import { MongoClient } from "mongodb";

async function main() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB;

  if (!uri || !dbName) {
    throw new Error("MongoDB environment variables are missing");
  }

  const client = new MongoClient(uri);

  try {
    await client.connect();

    const collection = client
      .db(dbName)
      .collection("quality_observations");

    const report = await collection.aggregate([
      {
        $group: {
          _id: {
            crop_id: "$crop_id",
            crop_name: "$crop_name",
            assessed_grade: "$assessed_grade"
          },
          observationCount: { $sum: 1 },
          latestInspection: { $max: "$inspection_date" },
          uniqueLots: { $addToSet: "$lot_id" }
        }
      },
      {
        $project: {
          _id: 0,
          crop_id: "$_id.crop_id",
          crop_name: "$_id.crop_name",
          assessed_grade: "$_id.assessed_grade",
          observationCount: 1,
          distinctLotCount: { $size: "$uniqueLots" },
          latestInspection: 1
        }
      },
      {
        $sort: {
          cropId: 1,
          overallGrade: 1
        }
      }
    ]).toArray();

    console.log("\n===== CROP QUALITY REPORT =====");
    console.log(JSON.stringify(report, null, 2));

    console.log("\nTotal report groups:", report.length);
    console.log("Aggregation completed successfully.");
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("Aggregation failed:", error);
  process.exitCode = 1;
});
