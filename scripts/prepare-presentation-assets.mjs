import { mkdir, readFile, writeFile } from "node:fs/promises";

const source = new URL("../presentation/", import.meta.url);
const output = new URL("../public/presentation-assets/", import.meta.url);

async function preparePresentationAssets() {
  const manifestText = await readFile(new URL("manifest.json", source), "utf8")
    .catch(error => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
  if (!manifestText) return;

  const manifest = JSON.parse(manifestText);
  if (manifest.version !== 1 || !Array.isArray(manifest.chunks) || !manifest.chunks.length) {
    throw new Error("Invalid presentation backup manifest.");
  }
  const chunks = await Promise.all(manifest.chunks.map((_, index) =>
    readFile(new URL(`chunk-${String(index).padStart(5, "0")}`, source))
  ));
  const backup = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (backup.version !== 1 || !["boards", "pdfs", "geometry", "rules"].every(key => Array.isArray(backup[key]))) {
    throw new Error("Invalid presentation backup.");
  }

  await mkdir(output, { recursive: true });
  async function writeAsset(name, file, type, extension) {
    if (!extension || file?.type !== type || typeof file.data !== "string" || !file.data.length) {
      throw new Error(`Invalid presentation asset: ${name}`);
    }
    const filename = `${name}.${extension}`;
    await writeFile(new URL(filename, output), Buffer.from(file.data, "base64"));
    return `/presentation-assets/${filename}`;
  }

  const pdfs = await Promise.all(backup.pdfs.map(async ({ id, file }, index) => ({
    id,
    url: await writeAsset(`pdf-${index}`, file, file.type, ({ "application/pdf": "pdf", "image/png": "png", "image/webp": "webp", "image/jpeg": "jpg" })[file.type]),
  })));
  const writeGraphics = (board) => Promise.all(backup[board].map(async ({ typology, name, image }, index) => ({
    typology,
    name,
    url: await writeAsset(`${board}-${index}`, image, "image/png", "png"),
  })));
  const [geometry, rules] = await Promise.all([writeGraphics("geometry"), writeGraphics("rules")]);
  await writeFile(new URL("index.json", output), JSON.stringify({ boards: backup.boards, pdfs, geometry, rules }));
  console.log(`Prepared ${pdfs.length} PDFs, ${geometry.length} geometry graphics, and ${rules.length} rules graphics.`);
}

await preparePresentationAssets();
