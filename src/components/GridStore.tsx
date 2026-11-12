"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_CROP_CRITERIA,
  evaluateAllCrops,
  type CropCriteria,
  type CropEvaluation,
} from "./cropEvaluation";
import {
  LETTERS,
  parseLetterFile,
  revokeAsset,
  type Cell,
  type Letter,
  type LetterAsset,
  type LetterAssets,
} from "./letterTypes";
import {
  rotationFromGradient,
  type GradientDirection,
  type GradientMode,
} from "./rotationGradient";
import type { CompositionPlacement } from "./compositionEngine";
import { readJson, readSlideSignature, SLIDE_SESSION_KEY, writeJson } from "./browserSession";

export type AppliedComposition = {
  seed: number;
  alternativeIndex: number;
  placements: CompositionPlacement[];
  width: number;
  height: number;
  depth: number;
  sourceCenter?: { x: number; y: number; z: number };
};

export type RotationOptions = {
  direction: GradientDirection;
  mode: GradientMode;
  lessDegrees: number;
  moreDegrees: number;
};

export type Permutation = {
  id: string;
  cells: Cell[];
};

type SlideSession = {
  cols: number;
  rows: number;
  spacing: number;
  fontSize: number;
  gradientDirection: GradientDirection;
  gradientMode: GradientMode;
  lessDegrees: number;
  moreDegrees: number;
  cells: Cell[];
  layerCells: Cell[][];
  layerMode: boolean;
  zLayers: number;
  zSpacing: number;
  attractorGap?: number | null;
  letterThickness: number;
  yRotationEnabled: boolean;
  yRotationRange: number;
  permutations: Permutation[];
  showGuides: boolean;
  cropCriteria: CropCriteria;
  showFailedCrops: boolean;
  useAssets: boolean;
  appliedComposition: AppliedComposition | null;
};

const PERMUTATION_COUNT = 16;
const MAX_Z_LAYERS = 8;
const EMPTY_ASSETS: LetterAssets = { V: null, U: null, L: null };

export const DEFAULT_ROTATION: RotationOptions = {
  direction: "left-right",
  mode: "random",
  lessDegrees: 0,
  moreDegrees: 90,
};

export const GRADIENT_OPTIONS: { value: GradientDirection; label: string }[] = [
  { value: "none", label: "Off" },
  { value: "left-right", label: "L → R" },
  { value: "right-left", label: "R → L" },
  { value: "top-bottom", label: "T → B" },
  { value: "bottom-top", label: "B → T" },
  { value: "center-out", label: "Center out" },
  { value: "edge-in", label: "Edge in" },
  { value: "diagonal", label: "Diagonal" },
];

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function randomLetter(random: () => number = Math.random): Letter {
  return LETTERS[Math.floor(random() * LETTERS.length)];
}

function cellRotation(
  index: number,
  cols: number,
  rows: number,
  options: RotationOptions,
  random: () => number = Math.random,
): number {
  const col = index % cols;
  const row = Math.floor(index / cols);
  return rotationFromGradient({
    col,
    row,
    cols,
    rows,
    ...options,
    random,
  });
}

export function createGrid(
  cols: number,
  rows: number,
  options: RotationOptions,
  random: () => number = Math.random,
): Cell[] {
  return Array.from({ length: cols * rows }, (_, i) => ({
    id: `${i}-${random().toString(36).slice(2, 8)}`,
    letter: randomLetter(random),
    rotation: cellRotation(i, cols, rows, options, random),
  }));
}

export function createPermutations(
  cols: number,
  rows: number,
  options: RotationOptions,
  count = PERMUTATION_COUNT,
  random: () => number = Math.random,
): Permutation[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `perm-${i}-${random().toString(36).slice(2, 7)}`,
    cells: createGrid(cols, rows, options, random),
  }));
}

function createDepthGrids(
  cols: number,
  rows: number,
  options: RotationOptions,
  random: () => number = Math.random,
): Cell[][] {
  return Array.from({ length: MAX_Z_LAYERS - 1 }, () =>
    createGrid(cols, rows, options, random),
  );
}

type GridStoreValue = {
  cols: number;
  rows: number;
  spacing: number;
  fontSize: number;
  setSpacing: (n: number) => void;
  setFontSize: (n: number) => void;
  gradientDirection: GradientDirection;
  setGradientDirection: (d: GradientDirection) => void;
  gradientMode: GradientMode;
  setGradientMode: (m: GradientMode) => void;
  lessDegrees: number;
  setLessDegrees: (n: number) => void;
  moreDegrees: number;
  setMoreDegrees: (n: number) => void;
  cells: Cell[];
  layerCells: Cell[][];
  layerMode: boolean;
  setLayerMode: (enabled: boolean) => void;
  zLayers: number;
  setZLayers: (count: number) => void;
  zSpacing: number;
  setZSpacing: (spacing: number) => void;
  /** Null follows the grid. A number is the 45° center-to-letter gap. */
  attractorGap: number | null;
  setAttractorGap: (gap: number | null) => void;
  letterThickness: number;
  setLetterThickness: (percent: number) => void;
  yRotationEnabled: boolean;
  setYRotationEnabled: (enabled: boolean) => void;
  yRotationRange: number;
  setYRotationRange: (degrees: number) => void;
  permutations: Permutation[];
  showGuides: boolean;
  setShowGuides: (v: boolean | ((prev: boolean) => boolean)) => void;
  cropCriteria: CropCriteria;
  setCropCriteria: (
    v: CropCriteria | ((prev: CropCriteria) => CropCriteria),
  ) => void;
  showFailedCrops: boolean;
  setShowFailedCrops: (v: boolean | ((prev: boolean) => boolean)) => void;
  assets: LetterAssets;
  useAssets: boolean;
  setUseAssets: (v: boolean) => void;
  uploadError: string | null;
  fileInputs: React.MutableRefObject<Record<Letter, HTMLInputElement | null>>;
  hasAnyAsset: boolean;
  show3D: boolean;
  cropEvaluations: CropEvaluation[];
  gradientPreview: string;
  setAssetForLetter: (letter: Letter, next: LetterAsset | null) => void;
  clearAllAssets: () => void;
  onFileChosen: (letter: Letter, file: File | null) => void;
  regenerate: () => void;
  randomizeLetters: () => void;
  applyRotationGradient: () => void;
  resizeGrid: (nextCols: number, nextRows: number) => void;
  appliedComposition: AppliedComposition | null;
  setAppliedComposition: (composition: AppliedComposition | null) => void;
  slideReady: boolean;
};

const GridStoreContext = createContext<GridStoreValue | null>(null);

export function GridStoreProvider({ children }: { children: ReactNode }) {
  const [cols, setCols] = useState(8);
  const [rows, setRows] = useState(6);
  const [spacing, setSpacing] = useState(56);
  const [fontSize, setFontSize] = useState(42);
  const [gradientDirection, setGradientDirection] =
    useState<GradientDirection>(DEFAULT_ROTATION.direction);
  const [gradientMode, setGradientMode] = useState<GradientMode>(DEFAULT_ROTATION.mode);
  const [lessDegrees, setLessDegrees] = useState(DEFAULT_ROTATION.lessDegrees);
  const [moreDegrees, setMoreDegrees] = useState(DEFAULT_ROTATION.moreDegrees);
  const rotationOptions = useMemo<RotationOptions>(
    () => ({
      direction: gradientDirection,
      mode: gradientMode,
      lessDegrees,
      moreDegrees,
    }),
    [gradientDirection, gradientMode, lessDegrees, moreDegrees],
  );
  const [cells, setCells] = useState<Cell[]>(() =>
    createGrid(8, 6, DEFAULT_ROTATION, seededRandom(1)),
  );
  const [layerCells, setLayerCells] = useState<Cell[][]>(() =>
    createDepthGrids(8, 6, DEFAULT_ROTATION, seededRandom(3)),
  );
  const [layerMode, setLayerMode] = useState(false);
  const [zLayers, setZLayers] = useState(4);
  const [zSpacing, setZSpacing] = useState(56);
  const [attractorGap, setAttractorGap] = useState<number | null>(null);
  const [letterThickness, setLetterThickness] = useState(12);
  const [yRotationEnabled, setYRotationEnabled] = useState(false);
  const [yRotationRange, setYRotationRange] = useState(90);
  const [permutations, setPermutations] = useState<Permutation[]>(() =>
    createPermutations(8, 6, DEFAULT_ROTATION, PERMUTATION_COUNT, seededRandom(2)),
  );
  const [showGuides, setShowGuides] = useState(true);
  const [cropCriteria, setCropCriteria] = useState<CropCriteria>(DEFAULT_CROP_CRITERIA);
  const [showFailedCrops, setShowFailedCrops] = useState(true);
  const [assets, setAssets] = useState<LetterAssets>(EMPTY_ASSETS);
  const [useAssets, setUseAssets] = useState(true);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [appliedComposition, setAppliedComposition] = useState<AppliedComposition | null>(null);
  const sourceVersion = useRef({ cells, layerCells, cols, rows, spacing, fontSize, zLayers, zSpacing, attractorGap, letterThickness, yRotationEnabled, yRotationRange });
  const restoringSlide = useRef(false);
  const fileInputs = useRef<Record<Letter, HTMLInputElement | null>>({
    V: null,
    U: null,
    L: null,
  });

  useEffect(() => {
    const previous = sourceVersion.current;
    const changed = previous.cells !== cells
      || previous.layerCells !== layerCells
      || previous.cols !== cols
      || previous.rows !== rows
      || previous.spacing !== spacing
      || previous.fontSize !== fontSize
      || previous.zLayers !== zLayers
      || previous.zSpacing !== zSpacing
      || previous.attractorGap !== attractorGap
      || previous.letterThickness !== letterThickness
      || previous.yRotationEnabled !== yRotationEnabled
      || previous.yRotationRange !== yRotationRange;
    sourceVersion.current = { cells, layerCells, cols, rows, spacing, fontSize, zLayers, zSpacing, attractorGap, letterThickness, yRotationEnabled, yRotationRange };
    if (changed && !restoringSlide.current) setAppliedComposition(null);
    restoringSlide.current = false;
  }, [cells, layerCells, cols, rows, spacing, fontSize, zLayers, zSpacing, attractorGap, letterThickness, yRotationEnabled, yRotationRange]);

  const [slideReady, setSlideReady] = useState(false);
  useEffect(() => {
    const saved = readJson<SlideSession>(SLIDE_SESSION_KEY);
    if (saved && readSlideSignature(saved)) {
      restoringSlide.current = true;
      setCols(saved.cols);
      setRows(saved.rows);
      setSpacing(saved.spacing);
      setFontSize(saved.fontSize);
      setGradientDirection(saved.gradientDirection);
      setGradientMode(saved.gradientMode);
      setLessDegrees(saved.lessDegrees);
      setMoreDegrees(saved.moreDegrees);
      setCells(saved.cells);
      setLayerCells(saved.layerCells);
      setLayerMode(saved.layerMode);
      setZLayers(saved.zLayers);
      setZSpacing(saved.zSpacing);
      if (typeof saved.attractorGap === "number") setAttractorGap(saved.attractorGap);
      setLetterThickness(saved.letterThickness);
      setYRotationEnabled(saved.yRotationEnabled);
      setYRotationRange(saved.yRotationRange);
      if (Array.isArray(saved.permutations)) setPermutations(saved.permutations);
      if (typeof saved.showGuides === "boolean") setShowGuides(saved.showGuides);
      if (saved.cropCriteria) setCropCriteria(saved.cropCriteria);
      if (typeof saved.showFailedCrops === "boolean") setShowFailedCrops(saved.showFailedCrops);
      if (typeof saved.useAssets === "boolean") setUseAssets(saved.useAssets);
      setAppliedComposition(saved.appliedComposition ?? null);
    }
    setSlideReady(true);
  }, []);
  useEffect(() => {
    if (!slideReady) return;
    const snapshot: SlideSession = {
      cols, rows, spacing, fontSize, gradientDirection, gradientMode, lessDegrees, moreDegrees,
      cells, layerCells, layerMode, zLayers, zSpacing, attractorGap, letterThickness, yRotationEnabled, yRotationRange,
      permutations, showGuides, cropCriteria, showFailedCrops, useAssets, appliedComposition,
    };
    const timer = window.setTimeout(() => writeJson(SLIDE_SESSION_KEY, snapshot), 300);
    return () => {
      window.clearTimeout(timer);
      writeJson(SLIDE_SESSION_KEY, snapshot);
    };
  }, [slideReady, cols, rows, spacing, fontSize, gradientDirection, gradientMode, lessDegrees, moreDegrees, cells, layerCells, layerMode, zLayers, zSpacing, attractorGap, letterThickness, yRotationEnabled, yRotationRange, permutations, showGuides, cropCriteria, showFailedCrops, useAssets, appliedComposition]);

  useEffect(() => {
    return () => {
      LETTERS.forEach((letter) => revokeAsset(assets[letter]));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasModels = LETTERS.some((letter) => assets[letter]?.kind === "model");
  const hasAnyAsset = LETTERS.some((letter) => assets[letter]);
  const show3D = layerMode || (useAssets && hasModels);

  const setAssetForLetter = useCallback((letter: Letter, next: LetterAsset | null) => {
    setAssets((prev) => {
      revokeAsset(prev[letter]);
      return { ...prev, [letter]: next };
    });
    if (!next) {
      const input = fileInputs.current[letter];
      if (input) input.value = "";
    }
  }, []);

  const clearAllAssets = useCallback(() => {
    setAssets((prev) => {
      LETTERS.forEach((letter) => revokeAsset(prev[letter]));
      return { ...EMPTY_ASSETS };
    });
    LETTERS.forEach((letter) => {
      const input = fileInputs.current[letter];
      if (input) input.value = "";
    });
    setUploadError(null);
  }, []);

  const onFileChosen = useCallback(
    (letter: Letter, file: File | null) => {
      setUploadError(null);
      if (!file) {
        setAssetForLetter(letter, null);
        return;
      }

      const parsed = parseLetterFile(file);
      if (!parsed) {
        setUploadError(`Unsupported file for ${letter}. Use image or .glb/.gltf/.obj.`);
        const input = fileInputs.current[letter];
        if (input) input.value = "";
        return;
      }

      setAssetForLetter(letter, parsed);
    },
    [setAssetForLetter],
  );

  const regenerate = useCallback(() => {
    setCells(createGrid(cols, rows, rotationOptions));
    setLayerCells(createDepthGrids(cols, rows, rotationOptions));
    setPermutations(createPermutations(cols, rows, rotationOptions));
  }, [cols, rows, rotationOptions]);

  const randomizeLetters = useCallback(() => {
    setCells((prev) =>
      prev.map((cell) => ({
        ...cell,
        letter: randomLetter(),
      })),
    );
    setLayerCells((prev) =>
      prev.map((layer) => layer.map((cell) => ({ ...cell, letter: randomLetter() }))),
    );
    setPermutations((prev) =>
      prev.map((perm) => ({
        ...perm,
        cells: perm.cells.map((cell) => ({
          ...cell,
          letter: randomLetter(),
        })),
      })),
    );
  }, []);

  const applyRotationGradient = useCallback(() => {
    setCells((prev) =>
      prev.map((cell, i) => ({
        ...cell,
        rotation: cellRotation(i, cols, rows, rotationOptions),
      })),
    );
    setLayerCells((prev) =>
      prev.map((layer) =>
        layer.map((cell, i) => ({
          ...cell,
          rotation: cellRotation(i, cols, rows, rotationOptions),
        })),
      ),
    );
    setPermutations((prev) =>
      prev.map((perm) => ({
        ...perm,
        cells: perm.cells.map((cell, i) => ({
          ...cell,
          rotation: cellRotation(i, cols, rows, rotationOptions),
        })),
      })),
    );
  }, [cols, rows, rotationOptions]);

  const resizeGrid = useCallback(
    (nextCols: number, nextRows: number) => {
      setCols(nextCols);
      setRows(nextRows);
      setCells(createGrid(nextCols, nextRows, rotationOptions));
      setLayerCells(createDepthGrids(nextCols, nextRows, rotationOptions));
      setPermutations(createPermutations(nextCols, nextRows, rotationOptions));
    },
    [rotationOptions],
  );

  const gradientPreview = useMemo(() => {
    const stops =
      gradientDirection === "top-bottom" || gradientDirection === "bottom-top"
        ? "to bottom"
        : gradientDirection === "diagonal"
          ? "135deg"
          : gradientDirection === "center-out"
            ? "circle at center"
            : gradientDirection === "edge-in"
              ? "circle at center"
              : "to right";

    if (gradientDirection === "none") {
      return `linear-gradient(to right, #3dd6db55, #3dd6db55)`;
    }
    if (gradientDirection === "center-out") {
      return `radial-gradient(${stops}, #3dd6db22 0%, #3dd6db 70%)`;
    }
    if (gradientDirection === "edge-in") {
      return `radial-gradient(${stops}, #3dd6db 0%, #3dd6db22 70%)`;
    }
    if (gradientDirection === "right-left" || gradientDirection === "bottom-top") {
      return `linear-gradient(${stops}, #3dd6db, #3dd6db22)`;
    }
    return `linear-gradient(${stops}, #3dd6db22, #3dd6db)`;
  }, [gradientDirection]);

  const cropEvaluations = useMemo(
    () =>
      evaluateAllCrops(
        cells,
        cols,
        rows,
        spacing,
        fontSize,
        cropCriteria,
        permutations,
      ),
    [cells, cols, rows, spacing, fontSize, cropCriteria, permutations],
  );

  const value = useMemo<GridStoreValue>(
    () => ({
      cols,
      rows,
      spacing,
      fontSize,
      setSpacing,
      setFontSize,
      gradientDirection,
      setGradientDirection,
      gradientMode,
      setGradientMode,
      lessDegrees,
      setLessDegrees,
      moreDegrees,
      setMoreDegrees,
      cells,
      layerCells,
      layerMode,
      setLayerMode,
      zLayers,
      setZLayers,
      zSpacing,
      setZSpacing,
      attractorGap,
      setAttractorGap,
      letterThickness,
      setLetterThickness,
      yRotationEnabled,
      setYRotationEnabled,
      yRotationRange,
      setYRotationRange,
      permutations,
      showGuides,
      setShowGuides,
      cropCriteria,
      setCropCriteria,
      showFailedCrops,
      setShowFailedCrops,
      assets,
      useAssets,
      setUseAssets,
      uploadError,
      fileInputs,
      hasAnyAsset,
      show3D,
      cropEvaluations,
      gradientPreview,
      setAssetForLetter,
      clearAllAssets,
      onFileChosen,
      regenerate,
      randomizeLetters,
      applyRotationGradient,
      resizeGrid,
      appliedComposition,
      setAppliedComposition,
      slideReady,
    }),
    [
      cols,
      rows,
      spacing,
      fontSize,
      gradientDirection,
      gradientMode,
      lessDegrees,
      moreDegrees,
      cells,
      layerCells,
      layerMode,
      zLayers,
      zSpacing,
      attractorGap,
      letterThickness,
      yRotationEnabled,
      yRotationRange,
      permutations,
      showGuides,
      cropCriteria,
      showFailedCrops,
      assets,
      useAssets,
      uploadError,
      hasAnyAsset,
      show3D,
      cropEvaluations,
      gradientPreview,
      setAssetForLetter,
      clearAllAssets,
      onFileChosen,
      regenerate,
      randomizeLetters,
      applyRotationGradient,
      resizeGrid,
      appliedComposition,
      slideReady,
    ],
  );

  return (
    <GridStoreContext.Provider value={value}>{children}</GridStoreContext.Provider>
  );
}

export function useGridStore() {
  const ctx = useContext(GridStoreContext);
  if (!ctx) throw new Error("useGridStore must be used within GridStoreProvider");
  return ctx;
}
