import { NextResponse } from "next/server";
import { sequelize } from "@/lib/db";

export async function GET() {
  try {
    await sequelize.authenticate();
    return NextResponse.json(
      {
        status: "healthy",
        database: "connected",
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Health check DB failure:", error);
    return NextResponse.json(
      {
        status: "unhealthy",
        database: "disconnected",
        error: error instanceof Error ? error.message : "Unknown database error",
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
