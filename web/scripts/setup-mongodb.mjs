import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB;

if (!uri || !dbName) {
  throw new Error("MONGODB_URI or MONGODB_DB is missing");
}

const collectionName = "quality_observations";

async function main() {
  const client = new MongoClient(uri);

  try {
    await client.connect();

    const db = client.db(dbName);

    const validator = {
      $jsonSchema: {
        bsonType: "object",
        required: [
          "lotId",
          "cropId",
          "observedAt",
          "inspectorId",
          "observationType",
          "attributes",
          "overallGrade"
        ],
        properties: {
          lotId: { bsonType: "string" },
          cropId: { bsonType: "string" },
          observedAt: { bsonType: "date" },
          inspectorId: { bsonType: "string" },
          observationType: { bsonType: "string" },
          attributes: { bsonType: "object" },
          overallGrade: { bsonType: "string" },
          notes: { bsonType: "string" }
        }
      }
    };

    const existing = await db
      .listCollections({ name: collectionName })
      .hasNext();

    if (!existing) {
      await db.createCollection(collectionName, { validator });
      console.log("Quality observations collection created.");
    } else {
      await db.command({
        collMod: collectionName,
        validator,
        validationLevel: "strict",
        validationAction: "error"
      });
      console.log("Existing collection validator updated.");
    }

    const collection = db.collection(collectionName);

    await collection.createIndex(
      { lotId: 1, observedAt: -1 },
      { name: "lot_observation_date_idx" }
    );

    await collection.createIndex(
      { cropId: 1, observedAt: -1 },
      { name: "crop_observation_date_idx" }
    );

    await collection.createIndex(
      { inspectorId: 1 },
      { name: "inspector_idx" }
    );

    console.log("Quality observation indexes created.");

    const indexes = await collection.indexes();

    console.log("Current indexes:");
    console.log(indexes.map((index) => index.name));

    console.log("MongoDB setup completed successfully.");
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("MongoDB setup failed:", error);
  process.exitCode = 1;
});
