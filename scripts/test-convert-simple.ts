// Test sample-model.ifc → GLB conversion
const path = require("path");
const fs = require("fs");

async function main() {
  const data = fs.readFileSync(path.resolve("public/sample-model.ifc"));
  console.log("Sample IFC:", (data.length / 1024).toFixed(0), "KB");

  const { ifcToGlb } = await import("../src/lib/convert-ifc-to-glb");
  const glb = await ifcToGlb(new Uint8Array(data));
  
  const out = path.resolve("public/sample-model-converted.glb");
  fs.writeFileSync(out, glb);
  console.log("GLB:", (glb.length / 1024).toFixed(0), "KB →", out);
}

main().catch(e => { console.error("FAIL:", e.message); process.exit(1); });