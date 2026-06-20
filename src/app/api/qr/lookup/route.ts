import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code || typeof code !== "string" || code.trim().length === 0) {
    return NextResponse.json({ error: "QR code query param is required" }, { status: 400 });
  }

  // Look up panel by qr_code
  const { data: panel, error } = await supabase
    .from("panels")
    .select("id, project_id, name, qr_code")
    .eq("qr_code", code.trim())
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!panel) {
    return NextResponse.json({ error: "No panel found with this QR code" }, { status: 404 });
  }

  return NextResponse.json(panel);
}