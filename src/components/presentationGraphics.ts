import type { PrototypeTypologyId } from "./amphitheaterPrototype";

export type PresentationGraphic = { typology: PrototypeTypologyId; name: string; image: Blob };
export type PresentationBoard = 'blank' | 'geometry' | 'rules';
const storeName = (board: PresentationBoard) => board === 'geometry' ? 'geometry' : 'graphics';
function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("composition-presentation", 4);
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
      if (event.oldVersion < 3) db.createObjectStore("geometry", { keyPath: "typology" });
      if (event.oldVersion < 4) db.createObjectStore("pdfBoard");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open presentation storage."));
  });
}
export async function savePresentationGraphic(typology: PrototypeTypologyId, name: string, image: Blob, board: PresentationBoard = 'rules') {
  const db = await openStore();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(storeName(board), "readwrite");
      transaction.objectStore(storeName(board)).put({ typology, name, image });
      transaction.oncomplete = () => resolve();
      transaction.onabort = transaction.onerror = () => reject(transaction.error ?? new Error("Could not save graphic."));
    });
    if (typeof BroadcastChannel !== "undefined") { const channel = new BroadcastChannel("composition-presentation"); channel.postMessage("updated"); channel.close(); }
  } finally { db.close(); }
}
export async function loadPresentationGraphics(board: PresentationBoard = 'rules'): Promise<PresentationGraphic[]> {
  const db = await openStore();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(storeName(board), "readonly").objectStore(storeName(board)).getAll();
      request.onsuccess = () => resolve(request.result as PresentationGraphic[]);
      request.onerror = () => reject(request.error ?? new Error("Could not load graphics."));
    });
  } finally { db.close(); }
}
export async function savePresentationPdf(file: Blob, id = 'current') {
  const db = await openStore();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('pdfBoard', 'readwrite');
      transaction.objectStore('pdfBoard').put(file, id);
      transaction.oncomplete = () => resolve();
      transaction.onabort = transaction.onerror = () => reject(transaction.error ?? new Error('Could not save the PDF to the blank board.'));
    });
  } finally { db.close(); }
}
export async function loadPresentationPdf(id = 'current'): Promise<Blob | null> {
  const db = await openStore();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('pdfBoard', 'readonly').objectStore('pdfBoard').get(id);
      request.onsuccess = () => resolve((request.result as Blob | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error('Could not load the PDF board.'));
    });
  } finally { db.close(); }
}
export type PdfBoard = { id: string; title: string };
export async function loadPdfBoards(): Promise<PdfBoard[]> {
  const db = await openStore();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('pdfBoard', 'readonly').objectStore('pdfBoard').get('boards');
      request.onsuccess = () => resolve(request.result ?? [{id:'current', title:'Blank Board'}]);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}
export async function savePdfBoards(boards: PdfBoard[]) {
  const db = await openStore();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('pdfBoard', 'readwrite');
      tx.objectStore('pdfBoard').put(boards, 'boards');
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}
export async function deletePresentationPdf() {
  const db = await openStore();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('pdfBoard', 'readwrite');
      transaction.objectStore('pdfBoard').delete('current');
      transaction.oncomplete = () => resolve();
      transaction.onabort = transaction.onerror = () => reject(transaction.error ?? new Error('Could not clear the PDF board.'));
    });
  } finally { db.close(); }
}
