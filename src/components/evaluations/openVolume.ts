/**
 * Open Volume measures architectural openness: unobstructed space and low solid mass.
 * Enclosed cavities are reported separately and do not drive the score.
 */

export type Voxel = [number, number, number];

export type OpenVolumeMeasurement = {
  /** Free voxels inside the occupied bounds / occupied-bounds volume, 0–100. */
  architecturalOpenSpace: number;
  /** Equal average of the six axis pass rates, 0–100. */
  permeability: number;
  horizontalPermeability: number;
  verticalPermeability: number;
  /** Exterior-connected free space lying between surfaces, 0–100. */
  interstitialOpenSpace: number;
  /**
   * 1 - mean 26-neighbor solidity, 0–100.
   * Local material intensity, not free cells / bounding box.
   */
  lowMass: number;
  /** Share of the occupied bounds that is fully surrounded. Informational. */
  enclosedVoidRatio: number;
  score: number;
};

const THIN_AXIS_RATIO = 0.4;
const THIN_TARGET_RATIO = 0.4;

const RAYS: Array<[number, number, number]> = [];
for (let z = -1; z <= 1; z += 1) {
  for (let y = -1; y <= 1; y += 1) {
    for (let x = -1; x <= 1; x += 1) {
      if (x || y || z) RAYS.push([x, y, z]);
    }
  }
}

const AXES: Array<{ dx: number; dy: number; dz: number; horizontal: boolean }> = [
  { dx: 1, dy: 0, dz: 0, horizontal: true },
  { dx: -1, dy: 0, dz: 0, horizontal: true },
  { dx: 0, dy: 1, dz: 0, horizontal: true },
  { dx: 0, dy: -1, dz: 0, horizontal: true },
  { dx: 0, dy: 0, dz: 1, horizontal: false },
  { dx: 0, dy: 0, dz: -1, horizontal: false },
];

const clamp100 = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

function cellKey(x: number, y: number, z: number) {
  return `${x},${y},${z}`;
}

function emptyMeasurement(): OpenVolumeMeasurement {
  return {
    architecturalOpenSpace: 0,
    permeability: 0,
    horizontalPermeability: 0,
    verticalPermeability: 0,
    interstitialOpenSpace: 0,
    lowMass: 0,
    enclosedVoidRatio: 0,
    score: 0,
  };
}

/**
 * Tight envelope around occupied voxels.
 * Thin axes (a single plate) are padded so the plate is judged against a
 * small spatial field. A cube is not padded, so its shell does not count as openness.
 */
function envelopeBounds(min: Voxel, max: Voxel) {
  const span = [max[0] - min[0] + 1, max[1] - min[1] + 1, max[2] - min[2] + 1];
  const maxSpan = Math.max(...span);
  const outMin: Voxel = [...min];
  const outMax: Voxel = [...max];
  for (let axis = 0; axis < 3; axis += 1) {
    if (span[axis] / maxSpan >= THIN_AXIS_RATIO) continue;
    const target = Math.max(span[axis], Math.round(maxSpan * THIN_TARGET_RATIO));
    const extra = Math.max(0, target - span[axis]);
    const before = Math.floor(extra / 2);
    outMin[axis] -= before;
    outMax[axis] += extra - before;
  }
  return { min: outMin, max: outMax, span };
}

function floodExterior(
  occupied: Set<string>,
  min: Voxel,
  max: Voxel,
) {
  const outside = new Set<string>();
  const queue: Voxel[] = [];
  const push = (x: number, y: number, z: number) => {
    if (x < min[0] || y < min[1] || z < min[2] || x > max[0] || y > max[1] || z > max[2]) return;
    const key = cellKey(x, y, z);
    if (occupied.has(key) || outside.has(key)) return;
    outside.add(key);
    queue.push([x, y, z]);
  };
  for (let x = min[0]; x <= max[0]; x += 1) {
    for (let y = min[1]; y <= max[1]; y += 1) {
      push(x, y, min[2]);
      push(x, y, max[2]);
    }
  }
  for (let x = min[0]; x <= max[0]; x += 1) {
    for (let z = min[2]; z <= max[2]; z += 1) {
      push(x, min[1], z);
      push(x, max[1], z);
    }
  }
  for (let y = min[1]; y <= max[1]; y += 1) {
    for (let z = min[2]; z <= max[2]; z += 1) {
      push(min[0], y, z);
      push(max[0], y, z);
    }
  }
  const steps: Voxel[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (let index = 0; index < queue.length; index += 1) {
    const [x, y, z] = queue[index];
    for (const [dx, dy, dz] of steps) push(x + dx, y + dy, z + dz);
  }
  return outside;
}

function rayHits(
  occupied: Set<string>,
  x: number,
  y: number,
  z: number,
  dx: number,
  dy: number,
  dz: number,
  min: Voxel,
  max: Voxel,
) {
  let cx = x + dx;
  let cy = y + dy;
  let cz = z + dz;
  while (cx >= min[0] && cy >= min[1] && cz >= min[2] && cx <= max[0] && cy <= max[1] && cz <= max[2]) {
    if (occupied.has(cellKey(cx, cy, cz))) return true;
    cx += dx;
    cy += dy;
    cz += dz;
  }
  return false;
}

function isInterstitial(
  occupied: Set<string>,
  x: number,
  y: number,
  z: number,
  min: Voxel,
  max: Voxel,
) {
  const hits: Array<[number, number, number]> = [];
  for (const [dx, dy, dz] of RAYS) {
    if (rayHits(occupied, x, y, z, dx, dy, dz, min, max)) hits.push([dx, dy, dz]);
  }
  for (let i = 0; i < hits.length; i += 1) {
    for (let j = i + 1; j < hits.length; j += 1) {
      const dot = hits[i][0] * hits[j][0] + hits[i][1] * hits[j][1] + hits[i][2] * hits[j][2];
      if (dot <= 0) return true;
    }
  }
  return false;
}

function directionPassRate(
  occupied: Set<string>,
  min: Voxel,
  max: Voxel,
  dx: number,
  dy: number,
  dz: number,
) {
  let rays = 0;
  let passed = 0;
  const x0 = dx > 0 ? min[0] : max[0];
  const y0 = dy > 0 ? min[1] : max[1];
  const z0 = dz > 0 ? min[2] : max[2];
  const yStart = dy === 0 ? min[1] : y0;
  const yEnd = dy === 0 ? max[1] : y0;
  const zStart = dz === 0 ? min[2] : z0;
  const zEnd = dz === 0 ? max[2] : z0;
  const xStart = dx === 0 ? min[0] : x0;
  const xEnd = dx === 0 ? max[0] : x0;
  for (let x = xStart; x <= xEnd; x += 1) {
    for (let y = yStart; y <= yEnd; y += 1) {
      for (let z = zStart; z <= zEnd; z += 1) {
        rays += 1;
        let cx = x;
        let cy = y;
        let cz = z;
        let blocked = false;
        while (cx >= min[0] && cy >= min[1] && cz >= min[2] && cx <= max[0] && cy <= max[1] && cz <= max[2]) {
          if (occupied.has(cellKey(cx, cy, cz))) {
            blocked = true;
            break;
          }
          cx += dx || 0;
          cy += dy || 0;
          cz += dz || 0;
          if (!dx && !dy && !dz) break;
        }
        if (!blocked) passed += 1;
      }
    }
  }
  return rays ? passed / rays : 0;
}

/** Mean share of the 26-neighborhood that is also solid. Thin plates score low; solid blocks score high. */
export function meanNeighborSolidity(cells: Voxel[]) {
  if (!cells.length) return 1;
  const occupied = new Set(cells.map(([x, y, z]) => cellKey(x, y, z)));
  const offsets: Voxel[] = [];
  for (let z = -1; z <= 1; z += 1) {
    for (let y = -1; y <= 1; y += 1) {
      for (let x = -1; x <= 1; x += 1) {
        if (x || y || z) offsets.push([x, y, z]);
      }
    }
  }
  let sum = 0;
  for (const [x, y, z] of cells) {
    let neighbors = 0;
    for (const [dx, dy, dz] of offsets) {
      if (occupied.has(cellKey(x + dx, y + dy, z + dz))) neighbors += 1;
    }
    sum += neighbors / offsets.length;
  }
  return sum / cells.length;
}

export function openVolumeScore(measurement: Pick<OpenVolumeMeasurement, "architecturalOpenSpace" | "permeability" | "interstitialOpenSpace" | "lowMass">) {
  return clamp100(
    0.35 * measurement.architecturalOpenSpace
    + 0.3 * measurement.permeability
    + 0.25 * measurement.interstitialOpenSpace
    + 0.1 * measurement.lowMass,
  );
}

/** Score architectural openness from an occupied voxel set. Coordinates are in cell units. */
export function measureOpenVolume(cells: Voxel[]): OpenVolumeMeasurement {
  if (!cells.length) return emptyMeasurement();
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  const occupied = new Set<string>();
  for (const [x, y, z] of cells) {
    occupied.add(cellKey(x, y, z));
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }
  const formMin: Voxel = [minX, minY, minZ];
  const formMax: Voxel = [maxX, maxY, maxZ];
  const { min: envMin, max: envMax } = envelopeBounds(formMin, formMax);
  const outside = floodExterior(occupied, envMin, envMax);

  const formVolume = (maxX - minX + 1) * (maxY - minY + 1) * (maxZ - minZ + 1);
  let freeInForm = 0;
  let enclosed = 0;
  let interstitial = 0;
  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        const key = cellKey(x, y, z);
        if (occupied.has(key)) continue;
        freeInForm += 1;
        const exterior = outside.has(key);
        if (!exterior) enclosed += 1;
        else if (isInterstitial(occupied, x, y, z, formMin, formMax)) interstitial += 1;
      }
    }
  }

  const rates = AXES.map((axis) => directionPassRate(occupied, envMin, envMax, axis.dx, axis.dy, axis.dz));
  const permeability = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
  const horizontalRates = rates.filter((_, index) => AXES[index].horizontal);
  const verticalRates = rates.filter((_, index) => !AXES[index].horizontal);
  const horizontal = horizontalRates.reduce((sum, rate) => sum + rate, 0) / horizontalRates.length;
  const vertical = verticalRates.reduce((sum, rate) => sum + rate, 0) / verticalRates.length;

  const measurement: OpenVolumeMeasurement = {
    architecturalOpenSpace: clamp100((freeInForm / formVolume) * 100),
    permeability: clamp100(permeability * 100),
    horizontalPermeability: clamp100(horizontal * 100),
    verticalPermeability: clamp100(vertical * 100),
    interstitialOpenSpace: clamp100((interstitial / formVolume) * 100),
    lowMass: clamp100((1 - meanNeighborSolidity(cells)) * 100),
    enclosedVoidRatio: clamp100((enclosed / formVolume) * 100),
    score: 0,
  };
  measurement.score = openVolumeScore(measurement);
  return measurement;
}
