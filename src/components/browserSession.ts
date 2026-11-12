export const OPTIMIZER_SESSION_KEY = "vul-optimizer-session";
export const PROTOTYPE_SESSION_KEY = "vul-prototype-session";
export const SLIDE_SESSION_KEY = "vul-slide-session";
export const LATTICE_SESSION_KEY = "vul-lattice-session";
export const PART3_REPO_KEY = "vul-part3-obj-repository";

export function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function readSlideSignature(value: unknown): string | null {
  if (!value || typeof value !== "object" || !Array.isArray((value as { cells?: unknown }).cells)) return null;
  const slide = value as Record<string, unknown>;
  const numeric = ["cols", "rows", "zLayers", "spacing", "zSpacing", "fontSize", "letterThickness", "yRotationRange"] as const;
  if (numeric.some((key) => typeof slide[key] !== "number")) return null;
  if (typeof slide.layerMode !== "boolean" || typeof slide.yRotationEnabled !== "boolean") return null;
  return `${slide.cols}:${slide.rows}:${slide.layerMode}:${slide.zLayers}:${slide.spacing}:${slide.zSpacing}:${slide.fontSize}:${slide.letterThickness}:${slide.yRotationEnabled}:${slide.yRotationRange}`;
}
