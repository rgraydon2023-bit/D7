import type { PrototypeTypologyId } from "./amphitheaterPrototype";

export type PresentationGraphic = { typology: PrototypeTypologyId; name: string; image: Blob };
function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("composition-presentation", 2);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (event.oldVersion < 1) db.createObjectStore("graphics", { keyPath: "typology" });
      else if (event.oldVersion < 2) {
        const transaction = request.transaction!;
        const records = transaction.objectStore("graphics").getAll();
        records.onsuccess = () => {
          db.deleteObjectStore("graphics");
          const next = db.createObjectStore("graphics", { keyPath: "typology" });
          for (const record of records.result as Array<{ typology: PrototypeTypologyId; image: Blob }>) next.put({ typology: record.typology, name: record.typology, image: record.image });
        };
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open presentation storage."));
  });
}
export async function savePresentationGraphic(typology: PrototypeTypologyId, name: string, image: Blob) {
  const db = await openStore();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("graphics", "readwrite");
      transaction.objectStore("graphics").put({ typology, name, image });
      transaction.oncomplete = () => resolve();
      transaction.onabort = transaction.onerror = () => reject(transaction.error ?? new Error("Could not save graphic."));
    });
    if (typeof BroadcastChannel !== "undefined") { const channel = new BroadcastChannel("composition-presentation"); channel.postMessage("updated"); channel.close(); }
  } finally { db.close(); }
}
export async function loadPresentationGraphics(): Promise<PresentationGraphic[]> {
  const db = await openStore();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction("graphics", "readonly").objectStore("graphics").getAll();
      request.onsuccess = () => resolve(request.result as PresentationGraphic[]);
      request.onerror = () => reject(request.error ?? new Error("Could not load graphics."));
    });
  } finally { db.close(); }
}
