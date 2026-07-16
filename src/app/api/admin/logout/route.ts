import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/lib/adminAuth";

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/admin", request.url));
  response.cookies.delete(ADMIN_SESSION_COOKIE);
  return response;
}
