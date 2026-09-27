export type GradientDirection =
  | "none"
  | "left-right"
  | "right-left"
  | "top-bottom"
  | "bottom-top"
  | "center-out"
  | "edge-in"
  | "diagonal";

export type GradientMode = "random" | "exact";

export const ROTATION_STEP = 15;
export const ROTATION_STEPS = 24; // 0 … 345

export function snapRotation(degrees: number): number {
  const snapped = Math.round(degrees / ROTATION_STEP) * ROTATION_STEP;
  return ((snapped % 360) + 360) % 360;
}

export function gradientFactor(
  col: number,
  row: number,
  cols: number,
  rows: number,
  direction: GradientDirection,
): number {
  if (direction === "none" || cols < 1 || rows < 1) return 0.5;

  const x = cols === 1 ? 0.5 : col / (cols - 1);
  const y = rows === 1 ? 0.5 : row / (rows - 1);

  switch (direction) {
    case "left-right":
      return x;
    case "right-left":
      return 1 - x;
    case "top-bottom":
      return y;
    case "bottom-top":
      return 1 - y;
    case "diagonal":
      return (x + y) / 2;
    case "center-out": {
      const dx = x - 0.5;
      const dy = y - 0.5;
      return Math.min(1, Math.sqrt(dx * dx + dy * dy) / Math.SQRT1_2);
    }
    case "edge-in": {
      const dx = x - 0.5;
      const dy = y - 0.5;
      return 1 - Math.min(1, Math.sqrt(dx * dx + dy * dy) / Math.SQRT1_2);
    }
    default:
      return 0.5;
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Pick a rotation (15° steps) from less→more along the gradient.
 * - exact: rotation = lerp(less, more, t)
 * - random: rotation = random in [0 .. lerp(less, more, t)] in 15° steps
 *   (so low-gradient areas stay near upright; high-gradient areas can spin more)
 */
export function rotationFromGradient(options: {
  col: number;
  row: number;
  cols: number;
  rows: number;
  direction: GradientDirection;
  mode: GradientMode;
  lessDegrees: number;
  moreDegrees: number;
  random?: () => number;
}): number {
  const { col, row, cols, rows, direction, mode, lessDegrees, moreDegrees, random = Math.random } =
    options;

  if (direction === "none") {
    if (mode === "exact") return snapRotation(lessDegrees);
    const maxSteps = Math.round(Math.max(lessDegrees, moreDegrees) / ROTATION_STEP);
    return Math.floor(random() * (maxSteps + 1)) * ROTATION_STEP;
  }

  const t = gradientFactor(col, row, cols, rows, direction);
  const target = lerp(lessDegrees, moreDegrees, t);

  if (mode === "exact") {
    return snapRotation(target);
  }

  // Random within 0..target magnitude, snapped to 15°.
  // If more < less (inverted feel via sliders), use absolute envelope.
  const low = Math.min(lessDegrees, moreDegrees);
  const high = Math.max(lessDegrees, moreDegrees);
  const localMax = lerp(low, high, t);
  const maxSteps = Math.max(0, Math.round(localMax / ROTATION_STEP));
  return Math.floor(random() * (maxSteps + 1)) * ROTATION_STEP;
}
