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

  // Use service_role key for storage + DB operations (bypasses RLS)
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const { createClient: adminCreate } = await import("@supabase/supabase-js");
  const adminSupabase = adminCreate(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
  );

  // Upload to Supabase Storage
  const storagePath = `${panelId}/${file.name}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await adminSupabase.storage
    .from("model_files")
    .upload(storagePath, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // Get public URL
  const { data: publicUrlData } = adminSupabase.storage
    .from("model_files")
    .getPublicUrl(storagePath);

  // Create model_files record (bypass RLS with service_role)
  const { data: modelRecord, error: dbError } = await adminSupabase
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