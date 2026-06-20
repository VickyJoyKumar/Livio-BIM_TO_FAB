import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { id: projectId } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: panels, error } = await supabase
    .from("panels")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(panels);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { id: projectId } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, panel_type } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Panel name is required" }, { status: 400 });
  }

  // Auto-generate a unique QR code from project + panel name
  const qrCode = `LIV-${projectId.slice(0, 8).toUpperCase()}-${name.trim().replace(/\s+/g, "-").toUpperCase()}`;

  const { data, error } = await supabase
    .from("panels")
    .insert({
      project_id: projectId,
      name: name.trim(),
      panel_type: panel_type?.trim() ?? null,
      qr_code: qrCode,
      metadata: {},
    })
    .select()
    .single();

  if (error) {
    // If QR code collision, append random suffix
    if (error.code === "23505") {
      const { data: retry, error: retryError } = await supabase
        .from("panels")
        .insert({
          project_id: projectId,
          name: name.trim(),
          panel_type: panel_type?.trim() ?? null,
          qr_code: `${qrCode}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
          metadata: {},
        })
        .select()
        .single();

      if (retryError) {
        return NextResponse.json({ error: retryError.message }, { status: 500 });
      }
      return NextResponse.json(retry, { status: 201 });
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}