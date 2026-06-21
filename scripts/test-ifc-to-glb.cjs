// Quick test of IFC→GLB conversion in Node.js
// This simulates what the server API route will do

const path = require("path");
const fs = require("fs");

async function main() {
  const ifcPath = path.resolve("public/1002.ifc");
  const data = fs.readFileSync(ifcPath);

  console.log(`Loading IFC: ${ifcPath}`);
  console.log(`Size: ${(data.length / 1024).toFixed(1)} KB`);

  const { ifcToGlb } = await import("../src/lib/convert-ifc-to-glb");

  console.log("Converting to GLB...");
  const startTime = Date.now();

  const glbBuffer = await ifcToGlb(data);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Conversion complete in ${elapsed}s`);
  console.log(`GLB size: ${(glbBuffer.length / 1024).toFixed(1)} KB`);

  // Write to file for inspection
  const outPath = path.resolve("public/1002-converted.glb");
  fs.writeFileSync(outPath, glbBuffer);
  console.log(`Wrote: ${outPath}`);

  // Validate GLB header
  if (glbBuffer.length < 12) {
    console.error("ERROR: GLB too small");
    process.exit(1);
  }
  const magic = glbBuffer.readUInt32LE(0);
  const version = glbBuffer.readUInt32LE(4);
  const glbLength = glbBuffer.readUInt32LE(8);
  console.log(`GLB header: magic=0x${magic.toString(16)} version=${version} length=${glbLength}`);
  
  if (magic !== 0x46546C67) { // 'glTF'
    console.error("ERROR: Invalid GLB magic");
    process.exit(1);
  }

  console.log("✅ GLB validation passed");
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});