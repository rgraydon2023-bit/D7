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
type EncodedBlob = { type: string; data: string };
export type PresentationBackup = {
  version: 1;
  boards: PdfBoard[];
  pdfs: { id: string; file: EncodedBlob }[];
  geometry: { typology: PrototypeTypologyId; name: string; image: EncodedBlob }[];
  rules: { typology: PrototypeTypologyId; name: string; image: EncodedBlob }[];
};

async function encodeBlob(blob: Blob): Promise<EncodedBlob> {
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return { type: blob.type, data };
}

function decodeBlob(value: EncodedBlob): Blob {
  if (!value || typeof value.type !== 'string' || typeof value.data !== 'string') throw new Error('Invalid file in GitHub backup.');
  const binary = atob(value.data);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return new Blob([bytes], { type: value.type });
}

export async function exportPresentationBackup(): Promise<PresentationBackup> {
  const boards = await loadPdfBoards();
  const [pdfs, geometry, rules] = await Promise.all([
    Promise.all(boards.map(async board => {
      const file = await loadPresentationPdf(board.id);
      return file ? { id: board.id, file: await encodeBlob(file) } : null;
    })),
    loadPresentationGraphics('geometry'),
    loadPresentationGraphics('rules'),
  ]);
  const encodeGraphics = (records: PresentationGraphic[]) => Promise.all(records.map(async record => ({ ...record, image: await encodeBlob(record.image) })));
  return { version: 1, boards, pdfs: pdfs.filter((item): item is NonNullable<typeof item> => item !== null), geometry: await encodeGraphics(geometry), rules: await encodeGraphics(rules) };
}

export async function importPresentationBackup(backup: PresentationBackup): Promise<void> {
  if (backup?.version !== 1 || !Array.isArray(backup.boards) || !Array.isArray(backup.pdfs) || !Array.isArray(backup.geometry) || !Array.isArray(backup.rules)
    || backup.boards.some(board => !board || typeof board.id !== 'string' || typeof board.title !== 'string')
    || new Set(backup.boards.map(board => board.id)).size !== backup.boards.length
    || backup.boards.some(board => ['boards', 'geometry', 'rules', 'video'].includes(board.id))) throw new Error('Invalid GitHub board backup.');
  const ids = new Set(backup.boards.map(board => board.id));
  const pdfs = backup.pdfs.map(item => {
    if (!item || !ids.has(item.id)) throw new Error('Invalid PDF board in backup.');
    return { id: item.id, file: decodeBlob(item.file) };
  });
  const decodeGraphics = (records: PresentationBackup['geometry']) => records.map(record => {
    if (!record || typeof record.typology !== 'string' || typeof record.name !== 'string') throw new Error('Invalid graphic in backup.');
    return { ...record, image: decodeBlob(record.image) };
  });
  const geometry = decodeGraphics(backup.geometry), rules = decodeGraphics(backup.rules);
  const db = await openStore();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['pdfBoard', 'geometry', 'graphics'], 'readwrite');
      const pdfStore = tx.objectStore('pdfBoard');
      pdfStore.clear();
      pdfStore.put(backup.boards, 'boards');
      for (const item of pdfs) pdfStore.put(item.file, item.id);
      for (const [name, records] of [['geometry', geometry], ['graphics', rules]] as const) {
        const store = tx.objectStore(name);
        store.clear();
        for (const record of records) store.put(record);
      }
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('Could not restore presentation boards.'));
    });
  } finally { db.close(); }
}
export type PublishedPresentation = { boards: PdfBoard[]; pdfs: { id: string; url: string }[]; geometry: { typology: PrototypeTypologyId; name: string; url: string }[]; rules: { typology: PrototypeTypologyId; name: string; url: string }[] };
export async function loadPublishedPresentation(signal: AbortSignal): Promise<PublishedPresentation | null> {
  const response = await fetch("/presentation-assets/index.json", { signal });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Could not load the published presentation.");
  return response.json();
}
export async function loadPdfBoards(publishedBoards?: PdfBoard[]): Promise<PdfBoard[]> {
  const db = await openStore();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('pdfBoard', 'readonly').objectStore('pdfBoard').get('boards');
      request.onsuccess = () => {
        const localBoards = request.result as PdfBoard[] | undefined;
        if (!localBoards) { resolve(publishedBoards ?? [{id:'current', title:'Blank Board'}]); return; }
        const ids = new Set(localBoards.map(board => board.id));
        resolve([...localBoards, ...(publishedBoards ?? []).filter(board => !ids.has(board.id))]);
      };
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
/** Delete a PDF and its tab together so a failed write cannot leave them inconsistent. */
export async function deletePdfBoard(id: string, boards: PdfBoard[]) {
  const db = await openStore();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('pdfBoard', 'readwrite');
      const store = tx.objectStore('pdfBoard');
      store.delete(id);
      store.put(boards, 'boards');
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('Could not delete the PDF board.'));
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
