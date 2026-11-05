import { NextResponse } from "next/server";
import { enrollDevice } from "@/lib/server/devices";
import { errorResponse } from "@/lib/server/http";
import { readAgentJson } from "../read";

export const dynamic = "force-dynamic";

/**
 * The first report of a computer's agent (install.cmd), with the enrolment key. No sign-in: the
 * key is the check. Answers the computer's own token, used for every later report.
 */
export async function POST(request: Request) {
  try {
    return NextResponse.json(await enrollDevice(await readAgentJson(request)));
  } catch (error) {
    return errorResponse(error);
  }
}
