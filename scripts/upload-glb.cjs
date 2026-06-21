// Upload the IfcOpenShell-generated GLB to Supabase test panel
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");
const path = require("path");

// Read env
const envPath = path.resolve(".env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
const serviceKey = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=([^\s]+)/)?.[1];
if (!serviceKey) {
  console.error("SUPABASE_SERVICE_ROLE_KEY not found in .env.local");
  process.exit(1);
}

const SUPABASE_URL = "https://vbigfxazqrzrastwafij.supabase.co";
const supabase = createClient(SUPABASE_URL, serviceKey);

const PANEL_ID = "71a7d439-e169-4e17-8acd-5480cef99b9c";
const GLB_PATH = "D:/AI APPS/Liv_DTF/public/1002-ifcopenshell.glb";
const GLB_NAME = "1002-ifcopenshell.glb";

async function main() {
  const buffer = fs.readFileSync(GLB_PATH);
  console.log(`GLB size: ${(buffer.length / 1024).toFixed(0)} KB`);

  const storagePath = `${PANEL_ID}/${GLB_NAME}`;

  // Upload
  const { error: ue } = await supabase.storage
    .from("model_files")
    .upload(storagePath, buffer, { upsert: true });
  if (ue) {
    console.error("Storage error:", ue.message);
    return;
  }
  console.log("Uploaded to Supabase storage");

  // Get public URL
  const { data: urlData } = supabase.storage
    .from("model_files")
    .getPublicUrl(storagePath);
  console.log("Public URL:", urlData.publicUrl);

  // Check if GLB record already exists
  const { data: existing } = await supabase
    .from("model_files")
    .select("id")
    .eq("panel_id", PANEL_ID)
    .eq("file_name", GLB_NAME)
    .single();

  if (existing) {
    console.log("GLB record already exists, skipping insert");
  } else {
    // Create model_files record
    const { data: record, error: dbError } = await supabase
      .from("model_files")
      .insert({
        panel_id: PANEL_ID,
        file_name: GLB_NAME,
        file_url: urlData.publicUrl,
        format: "glb",
        file_size_bytes: buffer.length,
      })
      .select()
      .single();

    if (dbError) {
      console.error("DB error:", dbError.message);
      return;
    }
    console.log("Model record created:", record.id);
  }

  console.log("Done! Viewer will auto-select GLB over IFC.");
}

main().catch(console.error);