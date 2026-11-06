"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { loadPresentationGraphics, loadPresentationPdf, savePresentationPdf, loadPdfBoards, savePdfBoards, type PdfBoard } from "@/components/presentationGraphics";
import type { PrototypeCategory, PrototypeTypologyId } from "@/components/amphitheaterPrototype";
import AppNav from "@/components/AppNav";
import { PRESENTATION_BOARD_STORAGE_KEY, useBoardMode } from "@/components/BoardMode";

const rows: { category: PrototypeCategory; title: string; typologies: { id: PrototypeTypologyId; name: string }[] }[] = [
  { category: "lobby", title: "Lobby", typologies: [
    { id: "vertical-void-lobby", name: "Vertical Void Lobby" }, { id: "compressed-sequential-lobby", name: "Compressed Sequential Lobby" }, { id: "continuous-hall-lobby", name: "Continuous Hall Lobby" }, { id: "topographic-ground-field-lobby", name: "Topographic / Ground-Field Lobby" }, { id: "linear-gallery-lobby", name: "Linear Gallery Lobby" },
  ] },
  { category: "gathering", title: "Gathering", typologies: [
    { id: "stepped-amphitheater", name: "Stepped Amphitheater" }, { id: "void-field-gathering", name: "Void-Field Gathering" }, { id: "inserted-horizontal-plate", name: "Inserted Horizontal Plate" }, { id: "contained-room-within-volume", name: "Contained Room-Within-Volume" }, { id: "linear-edge-gallery", name: "Linear Edge Gallery" },
  ] },
  { category: "office", title: "Office", typologies: [
    { id: "open-hall-workspace", name: "Open Hall Workspace" }, { id: "cascaded-terraced-plates", name: "Cascaded / Terraced Plates" }, { id: "flat-deep-plan-plate", name: "Flat Deep-Plan Plate" }, { id: "void-edge-workspace", name: "Void-Edge Workspace" }, { id: "folded-undulating-work-surface", name: "Folded / Undulating Work Surface" },
  ] },
];
type DisplayGraphic = { name: string; url: string };

export default function CompositionPresentationPage() {
  const presentationMode = useBoardMode();
  const [toggleReady, setToggleReady] = useState(false);
  const [togglePosition, setTogglePosition] = useState({right:12,bottom:12});
  useEffect(() => {
    setToggleReady(true);
    let frame = 0;
    const update = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => {
      const rect = presentationMode ? document.querySelector('[data-board="7407x2160"]')?.getBoundingClientRect() : null;
      setTogglePosition({right:rect?Math.max(12,window.innerWidth-rect.right+12):12,bottom:rect?Math.max(12,window.innerHeight-rect.bottom+12):12});
    }); };
    update();window.addEventListener("resize",update);
    return () => {cancelAnimationFrame(frame);window.removeEventListener("resize",update);};
  }, [presentationMode]);
  const [graphics, setGraphics] = useState<Partial<Record<PrototypeTypologyId, DisplayGraphic>>>({});
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(100);
  const [board, setBoard] = useState('current');
  const [pdfBoards, setPdfBoards] = useState<PdfBoard[]>([{id:'current', title:'Blank Board'}]);
  const [draggedBoard, setDraggedBoard] = useState<string | null>(null);
  const isPdfBoard = board !== 'geometry' && board !== 'rules';
  useEffect(() => { void loadPdfBoards().then(setPdfBoards).catch(() => setError('Could not load board titles.')); }, []);
  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfError, setPdfError] = useState('');
  const [draggingPdf, setDraggingPdf] = useState(false);
  useEffect(() => {
    let active = true; let currentUrls: string[] = []; let revision = 0;
    setGraphics({});
    const refresh = async () => {
      const request = ++revision;
      try {
        if (board !== 'geometry' && board !== 'rules') { setGraphics({}); return; }
        const records = await loadPresentationGraphics(board);
        if (!active || request !== revision) return;
        const next: Partial<Record<PrototypeTypologyId, DisplayGraphic>> = {}; const nextUrls: string[] = [];
        for (const record of records) { const url = URL.createObjectURL(record.image); nextUrls.push(url); next[record.typology] = { name: record.name, url }; }
        setGraphics(next); setError(""); currentUrls.forEach(URL.revokeObjectURL); currentUrls = nextUrls;
      } catch { if (active && request === revision) setError("Could not load the saved presentation graphics."); }
    };
    void refresh(); window.addEventListener("focus", refresh);
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("composition-presentation") : null;
    if (channel) channel.onmessage = () => { void refresh(); };
    return () => { active = false; window.removeEventListener("focus", refresh); channel?.close(); currentUrls.forEach(URL.revokeObjectURL); };
  }, [board]);
  useEffect(() => {
    let active = true; let url = '';
    setPdfUrl('');
    if (isPdfBoard) void loadPresentationPdf(board).then(file => {
      if (!active || !file) return;
      url = URL.createObjectURL(file); setPdfUrl(url);
    }).catch(() => setPdfError('Could not load the PDF board.'));
    else setPdfUrl('');
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [board]);
  const addPdf = async (file?: File) => {
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) { setPdfError('Drop a PDF file onto the board.'); return; }
    try { setPdfError(''); await savePresentationPdf(file, board); setPdfUrl(current => { if (current) URL.revokeObjectURL(current); return URL.createObjectURL(file); }); }
    catch { setPdfError('Could not add this PDF to the board.'); }
  };
  const boardOrder = [...pdfBoards.map(item => item.id), 'geometry', 'rules'];
  const updateBoards = (next: PdfBoard[]) => { setPdfBoards(next); void savePdfBoards(next).catch(() => setError('Could not save board order or title.')); };
  const currentTitle = pdfBoards.find(item => item.id === board)?.title ?? 'PDF Board';
  const boardIndex = boardOrder.indexOf(board);
  return (
    <main data-board-page="presentation" className="min-h-screen bg-black px-4 py-4 md:px-5">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-xl font-semibold" style={{ color: "#d6ad4f" }}>Presentation</h1>

      </div>
      <div className="mt-3 overflow-x-auto pb-1"><AppNav /></div>
      <h2 className="mt-3 text-sm font-semibold" style={{ color: "#d6ad4f" }}>General Rules</h2>
      <p className="mt-1 max-w-5xl text-xs leading-relaxed text-white">Letters keep their proportions and stay between 75% and 150% of their original size, while rising along Z and overlapping the other letters by at least 25% of their own volume. Adjacent letters remain connected through bridges or intersections, with central openings protected and fillets rounding connections.</p>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs" aria-label="Board navigation">
        <button type="button" aria-label="Previous board" disabled={boardIndex === 0} onClick={() => setBoard(boardOrder[boardIndex - 1])} className="rounded border px-3 py-1 disabled:opacity-40" style={{borderColor: "var(--line)"}}>←</button>
        <span aria-live="polite" className="min-w-32 text-center font-semibold" style={{color:"#d6ad4f"}}>{isPdfBoard ? currentTitle : board === 'rules' ? 'Graphic Rules Board' : 'Geometry Board'}</span>
        <button type="button" aria-label="Next board" disabled={boardIndex === boardOrder.length - 1} onClick={() => setBoard(boardOrder[boardIndex + 1])} className="rounded border px-3 py-1 disabled:opacity-40" style={{borderColor: "var(--line)"}}>→</button>
      <div className="flex flex-wrap items-center gap-2 text-xs" aria-label="Board tabs">
        {pdfBoards.map(item => <button key={item.id} type="button" draggable onDragStart={event => {setDraggedBoard(item.id);event.dataTransfer.effectAllowed='move';}} onDragEnd={() => setDraggedBoard(null)} onDragOver={event => {if(draggedBoard)event.preventDefault();}} onDrop={event => {event.preventDefault();if(!draggedBoard || draggedBoard===item.id)return;const next=[...pdfBoards];const from=next.findIndex(value=>value.id===draggedBoard),to=next.findIndex(value=>value.id===item.id);if(from<0||to<0)return;const [moved]=next.splice(from,1);next.splice(to,0,moved);updateBoards(next);setDraggedBoard(null);}} onClick={() => setBoard(item.id)} aria-pressed={board===item.id} title="Drag to reorder PDF boards" className="rounded border px-3 py-1" style={{borderColor:board===item.id?'#d6ad4f':'var(--line)'}}>{item.title || 'Untitled Board'}</button>)}
        <button type="button" aria-pressed={board==='geometry'} onClick={() => setBoard('geometry')} className="rounded border px-3 py-1" style={{borderColor:board==='geometry'?'#d6ad4f':'var(--line)'}}>Geometry Board</button>
        <button type="button" aria-pressed={board==='rules'} onClick={() => setBoard('rules')} className="rounded border px-3 py-1" style={{borderColor:board==='rules'?'#d6ad4f':'var(--line)'}}>Graphic Rules Board</button>
        <button type="button" onClick={() => {const item={id:'pdf-'+crypto.randomUUID(),title:'PDF Board '+(pdfBoards.length+1)};updateBoards([...pdfBoards,item]);setBoard(item.id);}} className="rounded border px-3 py-1" style={{borderColor:'var(--line)'}}>Add Board</button>
        {isPdfBoard && <label className="flex items-center gap-2">Title <input aria-label="PDF board title" value={currentTitle} onChange={event => updateBoards(pdfBoards.map(item => item.id===board ? {...item,title:event.target.value} : item))} className="rounded border bg-black px-2 py-1 text-white" style={{borderColor:'var(--line)'}} /></label>}
      </div>
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs" aria-label="Board zoom controls">
        <button type="button" aria-label="Zoom out" disabled={zoom <= 50} onClick={() => setZoom(value => Math.max(50, value - 25))} className="rounded border px-3 py-1 disabled:opacity-40" style={{borderColor: "var(--line)"}}>−</button>
        <span aria-live="polite">{zoom}%</span>
        <button type="button" aria-label="Zoom in" disabled={zoom >= 500} onClick={() => setZoom(value => Math.min(500, value + 25))} className="rounded border px-3 py-1 disabled:opacity-40" style={{borderColor: "var(--line)"}}>+</button>
        <button type="button" onClick={() => setZoom(100)} className="rounded border px-3 py-1" style={{borderColor: "var(--line)"}}>Reset zoom</button>
      </div>
      <div className={`presentation-board-viewport mt-2 max-h-[75vh] overflow-auto ${isPdfBoard ? 'pdf-board-viewport' : ''}`} aria-label="Presentation board viewport">
      {isPdfBoard ? <div onDragEnter={event => {event.preventDefault();setDraggingPdf(true);}} onDragOver={event => event.preventDefault()} onDragLeave={event => {if(!event.currentTarget.contains(event.relatedTarget as Node|null))setDraggingPdf(false);}} onDrop={event => {event.preventDefault();setDraggingPdf(false);void addPdf(event.dataTransfer.files[0]);}} className="presentation-pdf-board relative flex items-center justify-center overflow-hidden border border-dashed" style={{aspectRatio:'33 / 12.5',borderColor:draggingPdf?'#d6ad4f':'#b9bec6',background:'#050709'}}>
        {pdfUrl ? <><iframe title="PDF presentation board" src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=0&view=Fit`} className="absolute inset-0 h-full w-full border-0" /><div aria-hidden="true" className="absolute inset-0 z-10" /></> : <label className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-2 text-center text-xs text-white"><span>Drop a PDF here to place it on this board</span><span className="text-[#d6ad4f]">or choose a PDF</span><input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={event => void addPdf(event.target.files?.[0])}/></label>}
        {pdfError && <p role="alert" className="absolute bottom-2 left-2 bg-black/80 p-2 text-xs text-red-300">{pdfError}</p>}
      </div> : <div className="space-y-2" style={{width: zoom + "%", minWidth: (11 * zoom) + "px"}}>
        {rows.map((row) => <section key={row.category} aria-label={`${row.title} typologies`}>
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "#d6ad4f" }}>{row.title}</h2>
          <div className="grid grid-cols-5 gap-2 md:gap-3">
            {row.typologies.map((item) => {
              const graphic = graphics[item.id];
              return <article key={item.id} aria-label={`${row.title}: ${item.name}`} className="relative min-w-0 overflow-hidden border border-[#b9bec6]" style={{ aspectRatio: "33 / 12.5" }}>
                {graphic ? <div role="img" aria-label={`${graphic.name} ${board === 'rules' ? 'graphic rules' : 'geometry views'}`} className="absolute inset-0 bg-center bg-no-repeat" style={{ backgroundImage: `url("${graphic.url}")`, backgroundSize: "100% 100%" }} /> : <div className="p-2"><h3 className="truncate text-[10px] font-semibold sm:text-xs" style={{ color: "#d6ad4f" }}>{item.name}</h3><p className="mt-1 text-[9px] text-white sm:text-[10px]">{board === 'rules' ? 'Download Graphic Rules to Board' : 'Download Geometry Board'} for this typology to fill this panel.</p></div>}
              </article>;
            })}
          </div>
        </section>)}
      </div>
      }
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}
      {toggleReady && createPortal(
        <button data-board-edit-control type="button" aria-pressed={presentationMode} aria-label={presentationMode ? "Exit presentation board mode" : "Presentation board mode"} title="Presentation board mode" className="fixed z-50 rounded border bg-black/90 px-2 py-1 text-[11px]" style={{...togglePosition,borderColor:'var(--line)',color:'#d6ad4f'}} onClick={() => {
          const next = !presentationMode, url = new URL(window.location.href);
          url.searchParams.set('presentationBoard', next ? '7407x2160' : 'off');
          try { sessionStorage.setItem(PRESENTATION_BOARD_STORAGE_KEY, String(next)); } catch { /* Mode is still stored in the URL. */ }
          window.history.replaceState(window.history.state, '', url);
          window.dispatchEvent(new PopStateEvent('popstate'));
        }}>{presentationMode ? 'Exit board' : 'Board mode'}</button>
      , document.body)}
    </main>
  );
}

