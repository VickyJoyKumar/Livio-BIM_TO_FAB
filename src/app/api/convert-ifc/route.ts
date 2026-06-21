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

  const body = await request.json();
  const modelId = body.model_id as string | null;
  const panelId = body.panel_id as string | null;

  if (!modelId || !panelId) {
    return NextResponse.json(
      { error: "model_id and panel_id are required" },
      { status: 400 },
    );
  }

  // Use service_role for storage + DB operations
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  const { createClient: adminCreate } = await import("@supabase/supabase-js");
  const adminSupabase = adminCreate(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
  );

  // Get the model record
  const { data: model, error: modelError } = await adminSupabase
    .from("model_files")
    .select("*")
    .eq("id", modelId)
    .eq("panel_id", panelId)
    .single();

  if (modelError || !model) {
    return NextResponse.json(
      { error: modelError?.message || "Model not found" },
      { status: 404 },
    );
  }

  if (model.format !== "ifc") {
    return NextResponse.json(
      { error: "Only IFC files can be converted" },
      { status: 400 },
    );
  }

  // Download the IFC from Supabase Storage
  const storagePath = `${panelId}/${model.file_name}`;
  const { data: fileData, error: downloadError } = await adminSupabase.storage
    .from("model_files")
    .download(storagePath);

  if (downloadError || !fileData) {
    return NextResponse.json(
      { error: downloadError?.message || "Failed to download IFC" },
      { status: 500 },
    );
  }

  // Convert IFC → GLB using IfcOpenShell pipeline
  const buffer = Buffer.from(await fileData.arrayBuffer());
  const uint8 = new Uint8Array(buffer);

  let glbBuffer: Buffer;
  let stats: { meshes: number; vertices: number; triangles: number };

  try {
    const { execSync } = await import("child_process");
    const { mkdtempSync, writeFileSync, readFileSync, rmSync } = await import("fs");
    const { join } = await import("path");
    const { tmpdir } = await import("os");

    // Create temp directory
    const tmpDir = mkdtempSync(join(tmpdir(), "ifc-convert-"));
    const tmpIfcPath = join(tmpDir, "model.ifc");
    const tmpJsonPath = join(tmpDir, "model.json");

    try {
      // Write IFC to temp file
      writeFileSync(tmpIfcPath, buffer);

      try {
        // Attempt IfcOpenShell (Python) conversion — best quality
        const scriptPath = join(process.cwd(), "scripts/ifc-to-json.py");
        execSync(
          `python "${scriptPath}" "${tmpIfcPath}" "${tmpJsonPath}"`,
          { timeout: 120000, stdio: "pipe" },
        );

        // Convert JSON to GLB using three-stdlib
        const { ifcJsonToGlb } = await import("@/lib/ifcopenshell-to-glb");
        glbBuffer = await ifcJsonToGlb(tmpJsonPath);

        const jsonData = JSON.parse(readFileSync(tmpJsonPath, "utf-8"));
        stats = jsonData.stats;
      } catch {
        // Fallback: use web-ifc only (no Python needed)
        // This works everywhere including Vercel serverless
        const { convertIfcToGlb } = await import("@/lib/convert-ifc-to-glb");
        const result = await convertIfcToGlb(uint8);
        glbBuffer = result.glbBuffer;
        stats = {
          meshes: result.stats.meshCount,
          vertices: result.stats.validTris * 3,
          triangles: result.stats.validTris,
        };
      }
    } finally {
      // Clean up temp files
      try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  } catch (err) {
    return NextResponse.json(
      {
        error: `Conversion failed: ${(err as Error).message}`,
        model_id: modelId,
      },
      { status: 500 },
    );
  }

  // Upload GLB to Supabase Storage
  const glbFileName = model.file_name.replace(/\.ifc$/i, ".glb");
  const glbStoragePath = `${panelId}/${glbFileName}`;

  const { error: uploadError } = await adminSupabase.storage
    .from("model_files")
    .upload(glbStoragePath, glbBuffer, {
      contentType: "model/gltf-binary",
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: `Storage upload failed: ${uploadError.message}` },
      { status: 500 },
    );
  }

  // Get public URL
  const { data: publicUrlData } = adminSupabase.storage
    .from("model_files")
    .getPublicUrl(glbStoragePath);

  // Create a new model_files record for the GLB
  const { data: glbRecord, error: dbError } = await adminSupabase
    .from("model_files")
    .insert({
      panel_id: panelId,
      file_name: glbFileName,
      file_url: publicUrlData.publicUrl,
      format: "glb",
      file_size_bytes: glbBuffer.length,
    })
    .select()
    .single();

  if (dbError) {
    // Clean up the uploaded GLB on failure
    await adminSupabase.storage
      .from("model_files")
      .remove([glbStoragePath]);

    return NextResponse.json(
      { error: `Database insert failed: ${dbError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      success: true,
      model_id: modelId,
      glb_record: glbRecord,
      stats,
    },
    { status: 201 },
  );
}