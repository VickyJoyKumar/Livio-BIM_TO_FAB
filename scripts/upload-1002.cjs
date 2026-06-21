const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

async function run() {
  const supabase = createClient("https://vbigfxazqrzrastwafij.supabase.co", process.env.SK);
  const buffer = fs.readFileSync("D:/AI APPS/Liv_DTF/public/1002.ifc");
  const panelId = "71a7d439-e169-4e17-8acd-5480cef99b9c";
  const fileName = "1002.ifc";
  const storagePath = `${panelId}/${fileName}`;

  const { error: ue } = await supabase.storage.from("model_files").upload(storagePath, buffer, { upsert: true });
  if (ue) { console.log("Storage error:", ue.message); return; }
  console.log("Uploaded to storage");

  const { data: urlData } = supabase.storage.from("model_files").getPublicUrl(storagePath);
  console.log("URL:", urlData.publicUrl);
  
  await supabase.from("model_files").insert({
    panel_id: panelId, file_name: fileName, file_url: urlData.publicUrl, format: "ifc", file_size_bytes: buffer.length,
  });
  console.log("Model record created");
}
run();