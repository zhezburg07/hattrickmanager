import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPassword, ADMIN_SESSION_COOKIE } from "@/lib/adminAuth";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const password = String(formData.get("password") ?? "");

  const token = verifyAdminPassword(password);
  if (!token) {
    return NextResponse.redirect(new URL("/admin?error=1", request.url));
  }

  const response = NextResponse.redirect(new URL("/admin", request.url));
  response.cookies.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return response;
}
