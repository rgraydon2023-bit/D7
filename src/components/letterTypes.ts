export type Letter = "V" | "U" | "L";

export type Cell = {
  id: string;
  letter: Letter;
  rotation: number;
};

export type ModelFormat = "glb" | "gltf" | "obj";

export type LetterAsset =
  | {
      kind: "image";
      url: string;
      name: string;
    }
  | {
      kind: "model";
      url: string;
      name: string;
      format: ModelFormat;
    };

export type LetterAssets = Record<Letter, LetterAsset | null>;

export const LETTERS: Letter[] = ["V", "U", "L"];

export function getFileExtension(filename: string): string {
  const parts = filename.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

export function parseLetterFile(file: File): LetterAsset | null {
  const ext = getFileExtension(file.name);
  const url = URL.createObjectURL(file);

  if (ext === "glb" || ext === "gltf" || ext === "obj") {
    return {
      kind: "model",
      url,
      name: file.name,
      format: ext,
    };
  }

  if (
    file.type.startsWith("image/") ||
    ["png", "jpg", "jpeg", "webp", "gif", "svg", "avif"].includes(ext)
  ) {
    return {
      kind: "image",
      url,
      name: file.name,
    };
  }

  URL.revokeObjectURL(url);
  return null;
}

export function revokeAsset(asset: LetterAsset | null) {
  if (asset?.url) URL.revokeObjectURL(asset.url);
}
