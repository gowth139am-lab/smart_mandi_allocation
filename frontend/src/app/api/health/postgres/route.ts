import { NextResponse } from "next/server";
import { query } from "@/lib/db/postgres";

export async function GET() {
  try {
    const result = await query<{
      database: string;
      username: string;
    }>(
      "SELECT current_database() AS database, current_user AS username"
    );

    return NextResponse.json({
      success: true,
      message: "PostgreSQL connection successful",
      ...result.rows[0],
    });
  } catch (error) {
    console.error("PostgreSQL health check failed:", error);

    return NextResponse.json(
      {
        success: false,
        message: "PostgreSQL connection failed",
      },
      { status: 503 }
    );
  }
}