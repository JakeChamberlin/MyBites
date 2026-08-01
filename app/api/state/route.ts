import { NextResponse } from "next/server";
import type { StateOperation } from "@/lib/live-state";
import { mutateSharedState, readSharedState } from "@/lib/state-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await readSharedState(), {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    console.error("Unable to read shared floor state", error);
    return NextResponse.json({ error: "Shared floor is temporarily unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const operation = await request.json() as StateOperation;
    if (!operation || typeof operation !== "object" || typeof operation.type !== "string") {
      return NextResponse.json({ error: "Invalid update." }, { status: 400 });
    }
    return NextResponse.json(await mutateSharedState(operation), {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    console.error("Unable to update shared floor state", error);
    return NextResponse.json({ error: "The update could not be saved." }, { status: 503 });
  }
}
