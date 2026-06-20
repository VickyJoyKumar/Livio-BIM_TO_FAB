const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

async function upload() {
  const supabase = createClient("https://vbigfxazqrzrastwafij.supabase.co", process.env.SK);
  const buffer = fs.readFileSync("D:/AI APPS/Liv_DTF/public/sample-model.ifc");
  const panelId = "71a7d439-e169-4e17-8acd-5480cef99b9c";
  const fileName = "Building-Architecture.ifc";
  const storagePath = `${panelId}/${fileName}`;

  const { error: ue } = await supabase.storage.from("model_files").upload(storagePath, buffer, { contentType: "application/octet-stream", upsert: true });
  if (ue) { console.log("Storage error:", ue.message); return; }
  console.log("Uploaded to storage");

  const { data: urlData } = supabase.storage.from("model_files").getPublicUrl(storagePath);
  const { data: oldModels } = await supabase.from("model_files").select("id").eq("panel_id", panelId);
  for (const m of oldModels || []) await supabase.from("model_files").delete().eq("id", m.id);

  const { error: de } = await supabase.from("model_files").insert({
    panel_id: panelId, file_name: fileName, file_url: urlData.publicUrl, format: "ifc", file_size_bytes: buffer.length,
  });
  if (de) { console.log("DB error:", de.message); return; }
  console.log("Model record created");
  console.log("URL:", urlData.publicUrl);
}
upload();
