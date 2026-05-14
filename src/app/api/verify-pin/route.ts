import { NextRequest, NextResponse } from "next/server";

const VALID_PINS = (process.env.VALID_PINS ?? "")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const pin = String(body?.pin ?? "").trim();

  if (!pin || !VALID_PINS.includes(pin)) {
    return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set("fg-auth", "ok", {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 5, // 5 seconds
  });
  return response;
}
