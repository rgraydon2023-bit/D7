const maxWidth = 3200;
const pixelBudget = maxWidth * 1800;

function isPdf(file: Blob, name = "") {
  return file.type.includes("pdf") || name.toLowerCase().endsWith(".pdf");
}

async function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Replace a presentation PDF with one WebP image. Existing images are returned unchanged. */
export async function lightenBoardFile(file: Blob, name = ""): Promise<Blob> {
  if (!isPdf(file, name)) return file;
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: HTMLCanvasElement[] = [];
  try {
    let naturalWidth = 1;
    let naturalHeight = 0;
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const viewport = (await pdf.getPage(number)).getViewport({ scale: 1 });
      naturalWidth = Math.max(naturalWidth, viewport.width);
      naturalHeight += viewport.height;
    }
    const scale = Math.min(maxWidth / naturalWidth, Math.sqrt(pixelBudget / Math.max(1, naturalWidth * naturalHeight)), 2);
    let outputWidth = 1;
    let outputHeight = 0;
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not prepare the slide image.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport }).promise;
      page.cleanup();
      pages.push(canvas);
      outputWidth = Math.max(outputWidth, canvas.width);
      outputHeight += canvas.height;
    }
    const output = document.createElement("canvas");
    output.width = outputWidth;
    output.height = Math.max(1, outputHeight);
    const context = output.getContext("2d");
    if (!context) throw new Error("Could not prepare the slide image.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, output.width, output.height);
    let top = 0;
    for (const page of pages) {
      context.drawImage(page, 0, top);
      top += page.height;
      page.width = 0;
      page.height = 0;
    }
    const image = await canvasBlob(output, "image/webp", 0.8) ?? await canvasBlob(output, "image/jpeg", 0.82);
    output.width = 0;
    output.height = 0;
    if (!image) throw new Error("Could not compress this slide.");
    return image;
  } finally {
    await pdf.destroy();
  }
}
