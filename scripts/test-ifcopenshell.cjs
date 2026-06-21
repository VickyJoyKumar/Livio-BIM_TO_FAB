// Test IfcOpenShell GLB conversion
const path = require("path");
const fs = require("fs");

async function main() {
  console.log("Loading ifcopenshell-to-glb...");
  const { ifcJsonToGlb } = await import("../src/lib/ifcopenshell-to-glb.ts");
  console.log("Converting...");
  const glb = await ifcJsonToGlb("public/1002-ifcopenshell.json");
  console.log("GLB size:", glb.length, "bytes");
  
  const out = path.resolve("public/1002-ifcopenshell.glb");
  fs.writeFileSync(out, glb);
  
  // Validate
  const magic = glb.readUInt32LE(0);
  const jsonLen = glb.readUInt32LE(12);
  const json = JSON.parse(glb.slice(20, 20+jsonLen).toString("utf-8"));
  let tris = 0;
  for (const m of json.meshes) for (const p of m.primitives) tris += json.accessors[p.indices].count / 3;
  console.log("GLB: ok meshes=" + json.meshes.length + " tris=" + tris + " size=" + (glb.length/1024).toFixed(0) + "KB");
}

main().catch(e => { console.error("FAIL:", e.message); process.exit(1); });