import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getFarmerIdForUser } from "@/lib/auth/farmer";

export async function requireFarmerSalesAccess() {
  const session = await auth();

  if (!session?.user) {
    return {
      error: NextResponse.json({ message: "Unauthorized" }, { status: 401 }),
    };
  }

  if (session.user.role !== "FARMER") {
    return {
      error: NextResponse.json(
        { message: "Farmer access required" },
        { status: 403 },
      ),
    };
  }

  const farmerId = await getFarmerIdForUser(session.user.user_id);
  if (!farmerId) {
    return {
      error: NextResponse.json(
        { message: "Farmer profile not found" },
        { status: 403 },
      ),
    };
  }

  return { session, farmerId };
}

export function getPostgresErrorMessage(error: unknown): string | null {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return null;
}

export function databaseConflictResponse(error: unknown) {
  const message = getPostgresErrorMessage(error);
  if (!message) return null;

  const conflictResponses: Array<[string, number, string]> = [
    ["Insufficient inventory.", 409, "Allocation conflicts with available inventory"],
    ["Quantity exceeds remaining buyer demand", 409, "Allocation exceeds remaining buyer demand"],
    ["Produce lot is not available", 409, "Produce lot is not available for allocation"],
    ["Produce lot has expired", 409, "Produce lot has expired"],
    ["Buyer demand is not open", 409, "Buyer demand is not open"],
    ["Sale price exceeds buyer maximum price", 409, "Sale price exceeds buyer maximum price"],
    ["Crop does not match buyer demand", 409, "Produce crop does not match buyer demand"],
    ["Produce does not satisfy minimum grade", 409, "Produce quality does not satisfy buyer demand"],
    ["Produce lot does not belong to this farmer", 403, "Produce lot is not owned by the sale farmer"],
    ["This sale cannot accept additional items", 409, "Sale cannot accept additional items"],
    ["Sale is already cancelled", 409, "Sale is already cancelled"],
    ["This sale cannot be cancelled", 409, "Sale cannot be cancelled in its current state"],
    ["Successful payment exists. Process refund first.", 409, "Paid sale cannot be cancelled until refund processing"],
    ["Sale has no allocated items", 409, "Sale has no allocated items"],
  ];

  for (const [prefix, status, safeMessage] of conflictResponses) {
    if (message.startsWith(prefix)) {
      return NextResponse.json({ message: safeMessage }, { status });
    }
  }

  return null;
}
