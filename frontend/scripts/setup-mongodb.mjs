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
          "lot_id",
          "crop_id",
          "crop_name",
          "inspection_date",
          "inspector",
          "inspector_id",
          "measurements",
          "assessed_grade"
        ],
        properties: {
          lot_id: { bsonType: ["int", "long", "double"], minimum: 1 },
          crop_id: { bsonType: ["int", "long", "double"], minimum: 1 },
          crop_name: { bsonType: "string" },
          inspection_date: { bsonType: "date" },
          inspector: { bsonType: "string" },
          inspector_id: {
            bsonType: ["int", "long", "double", "null"],
            minimum: 1
          },
          measurements: { bsonType: "object" },
          assessed_grade: { enum: ["A", "B", "C"] }
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
      console.log("Validator updated. Existing legacy documents preserved.");
    }

    const collection = db.collection(collectionName);

    await collection.createIndex(
      { lot_id: 1, inspection_date: -1 },
      { name: "lot_id_inspection_date_idx" }
    );

    await collection.createIndex(
      { crop_id: 1 },
      { name: "crop_id_idx" }
    );

    await collection.createIndex(
      { assessed_grade: 1 },
      { name: "assessed_grade_idx" }
    );

    console.log("New schema indexes created.");
    console.log(
      "Current indexes:",
      (await collection.indexes()).map((index) => index.name)
    );
    console.log("MongoDB setup completed successfully.");
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("MongoDB setup failed:", error);
  process.exitCode = 1;
});