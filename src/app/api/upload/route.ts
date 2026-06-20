import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const panelId = formData.get("panel_id") as string | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!panelId) {
    return NextResponse.json({ error: "Panel ID is required" }, { status: 400 });
  }

  // Validate file format
  const name = file.name.toLowerCase();
  let format: "ifc" | "gltf" | "glb";
  if (name.endsWith(".ifc")) format = "ifc";
  else if (name.endsWith(".gltf")) format = "gltf";
  else if (name.endsWith(".glb")) format = "glb";
  else {
    return NextResponse.json(
      { error: "Invalid format. Supported: .ifc, .gltf, .glb" },
      { status: 400 },
    );
  }

  // Upload to Supabase Storage
  const storagePath = `${panelId}/${file.name}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from("model_files")
    .upload(storagePath, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // Get public URL
  const { data: publicUrlData } = supabase.storage
    .from("model_files")
    .getPublicUrl(storagePath);

  // Create model_files record
  const { data: modelRecord, error: dbError } = await supabase
    .from("model_files")
    .insert({
      panel_id: panelId,
      file_name: file.name,
      file_url: publicUrlData.publicUrl,
      format,
      file_size_bytes: file.size,
    })
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json(modelRecord, { status: 201 });
}