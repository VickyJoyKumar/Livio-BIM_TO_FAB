import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ panelId: string }> },
) {
  const supabase = await createClient();
  const { panelId } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: models, error } = await supabase
    .from("model_files")
    .select("*")
    .eq("panel_id", panelId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(models);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ panelId: string }> },
) {
  const supabase = await createClient();
  const { panelId } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get model ID from query params
  const { searchParams } = new URL(request.url);
  const modelId = searchParams.get("model_id");

  if (!modelId) {
    return NextResponse.json({ error: "model_id query param required" }, { status: 400 });
  }

  // Get the model record to find the storage path
  const { data: model } = await supabase
    .from("model_files")
    .select("*")
    .eq("id", modelId)
    .eq("panel_id", panelId)
    .single();

  if (!model) {
    return NextResponse.json({ error: "Model not found" }, { status: 404 });
  }

  // Delete from storage
  const storagePath = `${panelId}/${model.file_name}`;
  await supabase.storage.from("model_files").remove([storagePath]);

  // Delete from database
  const { error } = await supabase.from("model_files").delete().eq("id", modelId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}