import { NextResponse } from "next/server";
import { reportDevice } from "@/lib/server/devices";
import { errorResponse } from "@/lib/server/http";
import { readAgentJson } from "../read";

export const dynamic = "force-dynamic";

/** A computer's agent reporting, every 10 minutes, with `Authorization: Bearer <its token>`. */
export async function POST(request: Request) {
  try {
    const body = await readAgentJson(request);
    return NextResponse.json(await reportDevice(request.headers.get("authorization"), body));
  } catch (error) {
    return errorResponse(error);
  }
}
