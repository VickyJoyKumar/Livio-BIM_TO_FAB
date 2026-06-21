import path from "path";
import fs from "fs";

async function main() {
  const data = fs.readFileSync(path.resolve("public/sample-model.ifc"));
  console.log("Sample IFC size:", (data.length / 1024).toFixed(0), "KB");

  const { convertIfcToGlb } = await import("../src/lib/convert-ifc-to-glb");
  const result = await convertIfcToGlb(new Uint8Array(data));
  console.log("GLB size:", (result.glbBuffer.length / 1024).toFixed(0), "KB");
  console.log("Stats:", JSON.stringify(result.stats));

  fs.writeFileSync("public/sample-model-converted.glb", result.glbBuffer);
  console.log("Saved!");
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});