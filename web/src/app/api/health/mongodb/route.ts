import { NextResponse } from "next/server";
import { getMongoDatabase } from "@/lib/db/mongodb";

export async function GET() {
  try {
    const database = await getMongoDatabase();
    const result = await database.command({ ping: 1 });

    return NextResponse.json({
      success: true,
      message: "MongoDB connection successful",
      database: database.databaseName,
      ping: result.ok === 1,
    });
  } catch (error) {
    console.error("MongoDB health check failed:", error);

    return NextResponse.json(
      {
        success: false,
        message: "MongoDB connection failed",
      },
      { status: 503 }
    );
  }
}
