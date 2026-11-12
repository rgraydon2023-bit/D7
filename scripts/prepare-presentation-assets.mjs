import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const source = new URL("../presentation/", import.meta.url);
const output = new URL("../public/presentation-assets/", import.meta.url);
const pdfjsRoot = new URL("../node_modules/pdfjs-dist/", import.meta.url);
const maxWidth = 3200;
const pixelBudget = maxWidth * 1800;

function scaleFor(width, height) {
  return Math.min(maxWidth / Math.max(1, width), Math.sqrt(pixelBudget / Math.max(1, width * height)), 2);
}

async function webpFromImage(bytes) {
  const image = await loadImage(bytes);
  const scale = Math.min(1, scaleFor(image.width, image.height));
  const canvas = createCanvas(Math.max(1, Math.floor(image.width * scale)), Math.max(1, Math.floor(image.height * scale)));
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toBuffer("image/webp", 80);
}

async function webpFromPdf(bytes) {
  const pdf = await getDocument({
    data: new Uint8Array(bytes),
    cMapUrl: fileURLToPath(new URL("cmaps/", pdfjsRoot)) + "/",
    cMapPacked: true,
    standardFontDataUrl: fileURLToPath(new URL("standard_fonts/", pdfjsRoot)) + "/",
    useSystemFonts: true,
    disableFontFace: true,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
    maxImageSize: -1,
    canvasMaxAreaInBytes: pixelBudget * 4,
  }).promise;
  const pages = [];
  try {
    let naturalWidth = 1;
    let naturalHeight = 0;
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const viewport = (await pdf.getPage(number)).getViewport({ scale: 1 });
      naturalWidth = Math.max(naturalWidth, viewport.width);
      naturalHeight += viewport.height;
    }
    const scale = scaleFor(naturalWidth, naturalHeight);
    let outputWidth = 1;
    let outputHeight = 0;
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number);
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.max(1, Math.floor(viewport.width)), Math.max(1, Math.floor(viewport.height)));
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport }).promise;
      page.cleanup();
      pages.push(canvas);
      outputWidth = Math.max(outputWidth, canvas.width);
      outputHeight += canvas.height;
    }
    const canvas = createCanvas(outputWidth, Math.max(1, outputHeight));
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    let top = 0;
    for (const page of pages) {
      context.drawImage(page, 0, top);
      top += page.height;
    }
    return canvas.toBuffer("image/webp", 80);
  } finally {
    await pdf.destroy();
  }
}

async function toWebp(file) {
  const bytes = Buffer.from(file.data, "base64");
  if (file.type === "image/webp") return bytes;
  if (file.type === "application/pdf") return webpFromPdf(bytes);
  if (file.type === "image/png" || file.type === "image/jpeg") return webpFromImage(bytes);
  throw new Error(`Unsupported presentation file type: ${file.type}`);
}

async function preparePresentationAssets() {
  const manifestText = await readFile(new URL("manifest.json", source), "utf8").catch(error => {
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

  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });

  async function writeWebp(name, file) {
    if (!file || typeof file.type !== "string" || typeof file.data !== "string" || !file.data.length) {
      throw new Error(`Invalid presentation asset: ${name}`);
    }
    const filename = `${name}.webp`;
    await writeFile(new URL(filename, output), await toWebp(file));
    return `/presentation-assets/${filename}`;
  }

  const pdfs = [];
  for (const [index, item] of backup.pdfs.entries()) {
    console.log(`Converting slide ${index + 1}/${backup.pdfs.length} (${item.file.type})`);
    pdfs.push({ id: item.id, url: await writeWebp(`slide-${index}`, item.file) });
  }
  async function writeGraphics(board) {
    const graphics = [];
    for (const [index, item] of backup[board].entries()) {
      console.log(`Converting ${board} ${index + 1}/${backup[board].length}`);
      const typology = typeof item.typology === "string" && item.typology.includes("-")
        ? item.typology
        : String(item.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      graphics.push({ typology, name: item.name, url: await writeWebp(`${board}-${index}`, item.image) });
    }
    return graphics;
  }
  const geometry = await writeGraphics("geometry");
  const rules = await writeGraphics("rules");
  await writeFile(new URL("index.json", output), JSON.stringify({ boards: backup.boards, pdfs, geometry, rules }));
  console.log(`Prepared ${pdfs.length} slides, ${geometry.length} geometry graphics, and ${rules.length} rules graphics as WebP.`);
}

await preparePresentationAssets();
