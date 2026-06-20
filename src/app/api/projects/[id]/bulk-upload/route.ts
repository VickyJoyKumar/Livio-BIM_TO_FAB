import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import AdmZip from "adm-zip";

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

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No ZIP file provided" }, { status: 400 });
  }

  if (!file.name.toLowerCase().endsWith(".zip")) {
    return NextResponse.json({ error: "Only .zip files are accepted" }, { status: 400 });
  }

  // Fetch all panels for this project for name matching
  const { data: panels, error: panelsError } = await supabase
    .from("panels")
    .select("id, name")
    .eq("project_id", projectId);

  if (panelsError) {
    return NextResponse.json({ error: panelsError.message }, { status: 500 });
  }

  if (!panels || panels.length === 0) {
    return NextResponse.json(
      { error: "No panels found in this project. Add panels first before bulk uploading." },
      { status: 400 },
    );
  }

  // Extract ZIP
  const buffer = Buffer.from(await file.arrayBuffer());
  const zip = new AdmZip(buffer);
  const zipEntries = zip.getEntries();

  // Build a lookup: panel name (lowercase) → panel id
  const panelLookup = new Map<string, string>();
  for (const p of panels) {
    panelLookup.set(p.name.toLowerCase().trim(), p.id);
  }

  // Supported formats
  const supportedFormats = new Set([".ifc", ".gltf", ".glb"]);

  const results: {
    file: string;
    status: "uploaded" | "skipped" | "no_match" | "error";
    message: string;
  }[] = [];

  // Service role client for storage + DB ops
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  const { createClient: adminCreate } = await import("@supabase/supabase-js");
  const adminSupabase = adminCreate(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
  );

  for (const entry of zipEntries) {
    if (entry.isDirectory) continue;

    const entryName = entry.entryName;
    const ext = entryName.substring(entryName.lastIndexOf(".")).toLowerCase();
    if (!supportedFormats.has(ext)) {
      results.push({
        file: entryName,
        status: "skipped",
        message: `Unsupported format: ${ext}`,
      });
      continue;
    }

    // Extract base name without extension
    const baseName = entryName
      .substring(entryName.lastIndexOf("/") + 1) // remove directory prefix
      .replace(ext, "")
      .trim();

    // Try matching by full name
    let panelId = panelLookup.get(baseName.toLowerCase());

    // If not found, try partial match (e.g. "WALL-A42" matches if panel name contains it)
    if (!panelId) {
      const lowerBase = baseName.toLowerCase();
      panelLookup.forEach((pId, panelName) => {
        if (panelName.includes(lowerBase) || lowerBase.includes(panelName)) {
          panelId = pId;
        }
      });
    }

    if (!panelId) {
      results.push({
        file: entryName,
        status: "no_match",
        message: `No panel found with name matching "${baseName}"`,
      });
      continue;
    }

    try {
      // Upload to storage
      const storagePath = `${panelId}/${entryName.substring(entryName.lastIndexOf("/") + 1)}`;
      const fileBuffer = entry.getData();

      const { error: uploadError } = await adminSupabase.storage
        .from("model_files")
        .upload(storagePath, fileBuffer, {
          contentType: "application/octet-stream",
          upsert: true,
        });

      if (uploadError) {
        results.push({
          file: entryName,
          status: "error",
          message: `Storage upload failed: ${uploadError.message}`,
        });
        continue;
      }

      // Get public URL
      const { data: publicUrlData } = adminSupabase.storage
        .from("model_files")
        .getPublicUrl(storagePath);

      // Create DB record
      const format = ext.slice(1) as "ifc" | "gltf" | "glb";
      const { error: dbError } = await adminSupabase.from("model_files").insert({
        panel_id: panelId,
        file_name: entryName.substring(entryName.lastIndexOf("/") + 1),
        file_url: publicUrlData.publicUrl,
        format,
        file_size_bytes: fileBuffer.length,
      });

      if (dbError) {
        results.push({
          file: entryName,
          status: "error",
          message: `DB insert failed: ${dbError.message}`,
        });
      } else {
        results.push({
          file: entryName,
          status: "uploaded",
          message: `Uploaded to panel "${baseName}"`,
        });
      }
    } catch (err) {
      results.push({
        file: entryName,
        status: "error",
        message: `Unexpected error: ${(err as Error).message}`,
      });
    }
  }

  const uploaded = results.filter((r) => r.status === "uploaded").length;
  const noMatch = results.filter((r) => r.status === "no_match").length;
  const errors = results.filter((r) => r.status === "error").length;
  const skipped = results.filter((r) => r.status === "skipped").length;

  return NextResponse.json({
    summary: {
      total: results.length,
      uploaded,
      no_match: noMatch,
      errors,
      skipped,
    },
    results,
  });
}