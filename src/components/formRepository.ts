import type { CompositionPlacement } from "./compositionEngine";
import type { ConnectionWorkflow, IntersectionPlacement, WorkspaceEdits } from "./letterIntersectionSpaces";
import type { PrototypeCategory, PrototypeGeometryMode, PrototypeTypologyId } from "./amphitheaterPrototype";
import type { FaceBridgeSettings } from "./faceBridges";
import type { GatheringAngleLimits } from "./typologyLetterArrangement";
import type { GatheringOperations } from "./gatheringOperations";
import type { ModuleRange } from "./moduleEnvelope";

export type FormSnapshot = { source: CompositionPlacement[]; thickness: number; label: string; typology: string; key: string; data: ConnectionWorkflow; generationId?: number };
export type SavedEditor = {
  base: IntersectionPlacement[]; scales: number[]; zScales: number[]; zOffsets: number[]; xOffsets: number[]; yOffsets: number[];
  rotations: [number, number, number][]; mirror: [boolean, boolean, boolean]; duplicates: NonNullable<WorkspaceEdits["duplicates"]>;
};
export type SavedForm = {
  typology: PrototypeTypologyId; category: PrototypeCategory; savedAt: number; snapshot: FormSnapshot;
  editor: SavedEditor; moduleRange: ModuleRange; cubeCenter: [number, number, number]; settings: FaceBridgeSettings;
  gatheringAngles: GatheringAngleLimits; gatheringOperations: GatheringOperations; mode: PrototypeGeometryMode;
};

const databaseName = "luv-generated-form-repository";
const storeName = "forms";
function openRepository(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: "typology" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open the form repository."));
    request.onblocked = () => reject(new Error("The form repository is open in another tab. Close that tab and try again."));
  });
}
export async function loadForms(): Promise<SavedForm[]> {
  const db = await openRepository();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly"), request = tx.objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result as SavedForm[]);
      request.onerror = () => reject(request.error ?? new Error("Could not read saved forms."));
      tx.onabort = () => reject(tx.error ?? new Error("Could not read saved forms."));
    });
  } finally { db.close(); }
}
/** Ask the browser to retain repository data across sessions and storage pressure. */
export async function requestFormPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    return await navigator.storage.persist();
  } catch { return false; }
}
export async function saveForm(form: SavedForm): Promise<void> {
  const db = await openRepository();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).put(form);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Could not save the form."));
      tx.onabort = () => reject(tx.error ?? new Error("Could not save the form."));
    });
  } finally { db.close(); }
}
