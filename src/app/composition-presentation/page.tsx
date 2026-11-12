"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { loadPresentationGraphics, loadPresentationPdfs, savePresentationGraphic, savePresentationPdf, loadPdfBoards, savePdfBoards, deletePdfBoard, exportPresentationBackup, importPresentationBackup, loadPublishedPresentation, type PublishedPresentation, type PdfBoard } from "@/components/presentationGraphics";
import { lightenBoardFile } from "@/components/boardRaster";
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
type ReadyBoard = { url: string; image: boolean };
const walkthroughUrl = "/tutorials/vertical-void-walkthrough.mp4";
function rememberBoard(file: Blob) {
  const url = URL.createObjectURL(file);
  const image = file.type.startsWith('image/');
  if (image) { const preload = new Image(); preload.src = url; void preload.decode().catch(() => undefined); }
  return { url, image };
}

export default function CompositionPresentationPage() {
  const presentationMode = useBoardMode();
  const [toggleReady, setToggleReady] = useState(false);
  useEffect(() => { setToggleReady(true); }, []);
  const setPresentationMode = (next: boolean) => {
    const url = new URL(window.location.href);
    url.searchParams.set('presentationBoard', next ? '7407x2160' : 'off');
    try { sessionStorage.setItem(PRESENTATION_BOARD_STORAGE_KEY, String(next)); } catch { /* Mode is still stored in the URL. */ }
    window.history.replaceState(window.history.state, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };
  const [graphics, setGraphics] = useState<Partial<Record<PrototypeTypologyId, DisplayGraphic>>>({});
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(100);
  const [board, setBoard] = useState('current');
  const [pdfBoards, setPdfBoards] = useState<PdfBoard[]>([{id:'current', title:'Blank Board'}]);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [localApp, setLocalApp] = useState(false);
  useEffect(() => { setLocalApp(/^(localhost|127\.0\.0\.1|\[::1\])$/i.test(window.location.hostname)); }, []);
  const [boardRevision, setBoardRevision] = useState(0);
  const [draggedBoard, setDraggedBoard] = useState<string | null>(null);
  const isPdfBoard = board !== 'geometry' && board !== 'rules' && board !== 'video';
  const [published, setPublished] = useState<PublishedPresentation | null>(null);
  useEffect(() => {
    const request = new AbortController();
    void (async () => {
      let snapshot: PublishedPresentation | null = null;
      try { snapshot = await loadPublishedPresentation(request.signal); }
      catch { if (!request.signal.aborted) setError('Could not load the published presentation.'); }
      if (request.signal.aborted) return;
      const boards = await loadPdfBoards(snapshot?.boards.length ? snapshot.boards : undefined);
      if (request.signal.aborted) return;
      setPublished(snapshot); setPdfBoards(boards);
      setBoard(current => boards.some(item => item.id === current) ? current : boards[0]?.id ?? 'geometry');
    })().catch(() => { if (!request.signal.aborted) setError('Could not load board titles.'); });
    return () => request.abort();
  }, []);
  const [readyBoards, setReadyBoards] = useState<Record<string, ReadyBoard>>({});
  const [checkedBoards, setCheckedBoards] = useState<Record<string, true>>({});
  const readyRef = useRef(readyBoards);
  readyRef.current = readyBoards;
  const checkedRef = useRef(checkedBoards);
  checkedRef.current = checkedBoards;
  const seenRevision = useRef(boardRevision);
  const graphicCache = useRef<Partial<Record<'geometry' | 'rules', { graphics: Partial<Record<PrototypeTypologyId, DisplayGraphic>>; urls: string[] }>>>({});
  const [pdfError, setPdfError] = useState('');
  const [draggingPdf, setDraggingPdf] = useState(false);
  const graphicRevision = useRef(boardRevision);
  useEffect(() => {
    if (board !== 'geometry' && board !== 'rules') return;
    let active = true;
    if (graphicRevision.current !== boardRevision) {
      graphicRevision.current = boardRevision;
      for (const cached of Object.values(graphicCache.current)) cached?.urls.forEach(URL.revokeObjectURL);
      graphicCache.current = {};
    }
    const cached = graphicCache.current[board];
    if (cached) setGraphics(cached.graphics);
    const refresh = async () => {
      try {
        const records = await loadPresentationGraphics(board);
        if (!active) return;
        const next: Partial<Record<PrototypeTypologyId, DisplayGraphic>> = {}; const nextUrls: string[] = [];
        for (const record of published?.[board] ?? []) next[record.typology] = { name: record.name, url: record.url };
        for (const record of records) {
          const image = record.image.type === 'image/webp' ? record.image : await lightenBoardFile(record.image);
          if (image !== record.image) await savePresentationGraphic(record.typology, record.name, image, board);
          const url = URL.createObjectURL(image); nextUrls.push(url); next[record.typology] = { name: record.name, url };
        }
        const previous = graphicCache.current[board];
        graphicCache.current[board] = { graphics: next, urls: nextUrls };
        setGraphics(next); setError("");
        previous?.urls.forEach(URL.revokeObjectURL);
      } catch { if (active) setError("Could not load the saved presentation graphics."); }
    };
    if (!cached || published) void refresh();
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("composition-presentation") : null;
    if (channel) channel.onmessage = () => { void refresh(); };
    return () => { active = false; channel?.close(); };
  }, [board, boardRevision, published]);
  useEffect(() => {
    let active = true;
    if (seenRevision.current !== boardRevision) {
      seenRevision.current = boardRevision;
      for (const item of Object.values(readyRef.current)) URL.revokeObjectURL(item.url);
      readyRef.current = {};
      checkedRef.current = {};
      setReadyBoards({});
      setCheckedBoards({});
    }
    const order = [...pdfBoards.map(item => item.id), 'geometry', 'rules', 'video'];
    const index = order.indexOf(board);
    const wanted = [order[index - 1], order[index], order[index + 1]].filter((id): id is string => Boolean(id) && id !== 'geometry' && id !== 'rules' && id !== 'video');
    const missing = wanted.filter(id => !readyRef.current[id] && !checkedRef.current[id]);
    if (!missing.length) return () => { active = false; };
    void loadPresentationPdfs(missing).then(async files => {
      const ordered = [...missing].sort((a, b) => Number(b === board) - Number(a === board));
      for (const id of ordered) {
        if (!active) return;
        const file = files.get(id);
        const publishedSlide = published?.pdfs.find(item => item.id === id);
        let slide = file;
        if (!slide && publishedSlide) {
          if (/\.pdf($|\?)/i.test(publishedSlide.url)) {
            const response = await fetch(publishedSlide.url);
            if (!response.ok) throw new Error('Could not load the published slide.');
            slide = new Blob([await response.arrayBuffer()], { type: 'application/pdf' });
          } else {
            setReadyBoards(current => current[id] ? current : { ...current, [id]: { url: publishedSlide.url, image: true } });
            continue;
          }
        }
        if (!slide) continue;
        const image = await lightenBoardFile(slide);
        if (!active) return;
        if (image !== slide) await savePresentationPdf(image, id);
        const entry = rememberBoard(image);
        setReadyBoards(current => {
          if (current[id]) { URL.revokeObjectURL(entry.url); return current; }
          return { ...current, [id]: entry };
        });
      }
      if (!active) return;
      setCheckedBoards(current => ({ ...current, ...Object.fromEntries(missing.map(id => [id, true as const])) }));
      for (const id of missing) checkedRef.current[id] = true;
    }).catch(() => { if (active) setPdfError('Could not convert this PDF into a WebP slide.'); });
    return () => { active = false; };
  }, [board, pdfBoards, boardRevision, published]);
  useEffect(() => () => { for (const item of Object.values(readyRef.current)) URL.revokeObjectURL(item.url); }, []);
  const addPdf = async (file?: File) => {
    if (!file) return;
    const named = file.name.toLowerCase();
    if (!['application/pdf', 'image/webp', 'image/jpeg'].includes(file.type) && !/\.(pdf|webp|jpe?g)$/.test(named)) { setPdfError('Choose a PDF, WebP, or JPEG slide.'); return; }
    try {
      setPdfError('');
      const slide = await lightenBoardFile(file, file.name);
      await savePresentationPdf(slide, board);
      const next = rememberBoard(slide);
      setReadyBoards(current => {
        if (current[board]) URL.revokeObjectURL(current[board].url);
        return { ...current, [board]: next };
      });
      setCheckedBoards(current => ({ ...current, [board]: true }));
    }
    catch { setPdfError('Could not add this PDF to the board.'); }
  };
  const boardOrder = [...pdfBoards.map(item => item.id), 'geometry', 'rules', 'video'];
  const updateBoards = (next: PdfBoard[]) => { setPdfBoards(next); void savePdfBoards(next).catch(() => setError('Could not save board order or title.')); };
  const currentTitle = pdfBoards.find(item => item.id === board)?.title ?? 'PDF Board';
  const boardIndex = boardOrder.indexOf(board);
  const removeCurrentBoard = async () => {
    if (!isPdfBoard || !pdfBoards.some(item => item.id === board)) return;
    if (!window.confirm(`Delete "${currentTitle}" and its PDF from this browser?`)) return;
    const next = pdfBoards.filter(item => item.id !== board);
    try {
      await deletePdfBoard(board, next);
      setReadyBoards(current => {
        if (current[board]) URL.revokeObjectURL(current[board].url);
        const rest = { ...current };
        delete rest[board];
        return rest;
      });
      setPdfBoards(next);
      setBoard(next[Math.min(boardIndex, next.length - 1)]?.id ?? 'geometry');
      setPdfError('');
      setError('');
    } catch { setError('Could not delete the PDF board.'); }
  };
  const syncBoards = async (action: 'save' | 'load') => {
    if (action === 'load' && !window.confirm('Replace the boards in this browser with the saved GitHub boards?')) return;
    setSyncing(true);
    setSyncMessage('');
    try {
      if (action === 'save') await savePdfBoards(pdfBoards);
      const response = await fetch('/api/presentation-github', action === 'save' ? {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(await exportPresentationBackup()),
      } : { method: 'GET', cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'GitHub request failed.');
      if (action === 'load') {
        await importPresentationBackup(result);
        setPdfBoards(result.boards);
        setBoard(result.boards[0]?.id ?? 'geometry');
        setBoardRevision(value => value + 1);
        if (typeof BroadcastChannel !== 'undefined') {
          const channel = new BroadcastChannel('composition-presentation');
          channel.postMessage('updated');
          channel.close();
        }
      }
      setSyncMessage(action === 'save' ? 'Boards saved to GitHub.' : 'Boards restored from GitHub.');
    } catch (error) { setSyncMessage(error instanceof Error ? error.message : 'Could not sync boards.'); }
    finally { setSyncing(false); }
  };
  return (
    <main data-board-page="presentation" className={`relative flex flex-col bg-black px-4 py-4 md:px-5 ${presentationMode ? 'h-full min-h-0' : 'min-h-screen'}`}>
      {!presentationMode && <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-xl font-semibold" style={{ color: "#d6ad4f" }}>Presentation</h1>

      </div>}
      {!presentationMode && <><div className="mt-3 overflow-x-auto pb-1"><AppNav /></div>
      {localApp && <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <button type="button" disabled={syncing} onClick={() => void syncBoards('save')} className="rounded border px-3 py-1 disabled:opacity-40" style={{borderColor:'var(--line)'}}>Save boards to GitHub</button>
        <button type="button" disabled={syncing} onClick={() => void syncBoards('load')} className="rounded border px-3 py-1 disabled:opacity-40" style={{borderColor:'var(--line)'}}>Restore boards from GitHub</button>
        <span role="status" aria-live="polite">{syncing ? 'Connecting to GitHub…' : syncMessage}</span>
      </div>}</>}
      <div className={presentationMode && isPdfBoard ? "absolute left-1/2 top-10 z-30 w-max max-w-[95%] -translate-x-1/2 rounded bg-black/90 px-3 pb-3" : ""}><div className={`mt-4 flex flex-wrap items-center gap-3 text-xs ${presentationMode ? 'justify-center' : ''}`} aria-label="Board navigation">
        {!presentationMode && <><button type="button" aria-label="Previous board" disabled={boardIndex === 0} onClick={() => setBoard(boardOrder[boardIndex - 1])} className="rounded border px-3 py-1 disabled:opacity-40" style={{borderColor: "var(--line)"}}>←</button>
        <span aria-live="polite" className="min-w-32 text-center font-semibold" style={{color:"#d6ad4f"}}>{isPdfBoard ? currentTitle : board === 'video' ? 'Demo' : board === 'rules' ? 'Graphic Rules Board' : 'Geometry Board'}</span>
        <button type="button" aria-label="Next board" disabled={boardIndex === boardOrder.length - 1} onClick={() => setBoard(boardOrder[boardIndex + 1])} className="rounded border px-3 py-1 disabled:opacity-40" style={{borderColor: "var(--line)"}}>→</button></>}
      <div className="flex flex-wrap items-center gap-2 text-xs" aria-label="Board tabs">
        {pdfBoards.map(item => <button key={item.id} type="button" draggable onDragStart={event => {setDraggedBoard(item.id);event.dataTransfer.effectAllowed='move';}} onDragEnd={() => setDraggedBoard(null)} onDragOver={event => {if(draggedBoard)event.preventDefault();}} onDrop={event => {event.preventDefault();if(!draggedBoard || draggedBoard===item.id)return;const next=[...pdfBoards];const from=next.findIndex(value=>value.id===draggedBoard),to=next.findIndex(value=>value.id===item.id);if(from<0||to<0)return;const [moved]=next.splice(from,1);next.splice(to,0,moved);updateBoards(next);setDraggedBoard(null);}} onClick={() => setBoard(item.id)} aria-pressed={board===item.id} title="Drag to reorder PDF boards" className="rounded border px-3 py-1" style={{borderColor:board===item.id?'#d6ad4f':'var(--line)'}}>{item.title || 'Untitled Board'}</button>)}
        <button type="button" aria-pressed={board==='geometry'} onClick={() => setBoard('geometry')} className="rounded border px-3 py-1" style={{borderColor:board==='geometry'?'#d6ad4f':'var(--line)'}}>Geometry Board</button>
        <button type="button" aria-pressed={board==='rules'} onClick={() => setBoard('rules')} className="rounded border px-3 py-1" style={{borderColor:board==='rules'?'#d6ad4f':'var(--line)'}}>Graphic Rules Board</button>
        <button type="button" aria-pressed={board==='video'} onClick={() => setBoard('video')} className="rounded border px-3 py-1" style={{borderColor:board==='video'?'#d6ad4f':'var(--line)'}}>Demo</button>
      </div>
      </div>
      <div className={`mt-3 flex items-center gap-2 text-xs ${presentationMode ? 'justify-center' : ''}`} aria-label="Board zoom controls">
        {presentationMode && <><button type="button" aria-label="Previous board" disabled={boardIndex === 0} onClick={() => setBoard(boardOrder[boardIndex - 1])} className="rounded border px-3 py-1 disabled:opacity-40" style={{borderColor:"var(--line)"}}>←</button>
        <span aria-live="polite" className="min-w-32 text-center font-semibold" style={{color:"#d6ad4f"}}>{isPdfBoard ? currentTitle : board === 'video' ? 'Demo' : board === 'rules' ? 'Graphic Rules Board' : 'Geometry Board'}</span>
        <button type="button" aria-label="Next board" disabled={boardIndex === boardOrder.length - 1} onClick={() => setBoard(boardOrder[boardIndex + 1])} className="rounded border px-3 py-1 disabled:opacity-40" style={{borderColor:"var(--line)"}}>→</button></>}
        <label className="flex items-center gap-1">Zoom <select aria-label="Board zoom percentage" value={zoom} onChange={event => setZoom(Number(event.target.value))} className="rounded border bg-black px-2 py-1 text-white" style={{borderColor:'var(--line)'}}>{[0,25,50,75,100,200,300,400,500,600,700,800,900,1000].map(value => <option key={value} value={value}>{value}%</option>)}</select></label>
        {board === 'video' && <a href={walkthroughUrl} download className="rounded border px-3 py-1" style={{borderColor:'var(--line)',color:'#d6ad4f'}}>Download video</a>}
        {presentationMode && <button data-board-edit-control type="button" onClick={() => setPresentationMode(false)} className="rounded border px-3 py-1" style={{borderColor:'var(--line)',color:'#d6ad4f'}}>Exit presentation mode</button>}
      </div></div>
      {!presentationMode && <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-2">Board <select aria-label="Select board to edit" value={board} onChange={event => setBoard(event.target.value)} className="rounded border bg-black px-2 py-1 text-white" style={{borderColor:'var(--line)'}}>{pdfBoards.map(item => <option key={item.id} value={item.id}>{item.title || 'Untitled Board'}</option>)}<option value="geometry">Geometry Board</option><option value="rules">Graphic Rules Board</option><option value="video">Demo</option></select></label>
        <button type="button" onClick={() => {const item={id:'pdf-'+crypto.randomUUID(),title:'PDF Board '+(pdfBoards.length+1)};updateBoards([...pdfBoards,item]);setBoard(item.id);}} className="rounded border px-3 py-1" style={{borderColor:'var(--line)'}}>Add Board</button>
        {isPdfBoard && <label className="flex items-center gap-2">Title <input aria-label="PDF board title" value={currentTitle} onChange={event => updateBoards(pdfBoards.map(item => item.id===board ? {...item,title:event.target.value} : item))} className="rounded border bg-black px-2 py-1 text-white" style={{borderColor:'var(--line)'}} /></label>}
        {isPdfBoard && <button type="button" onClick={() => void removeCurrentBoard()} className="rounded border px-3 py-1" style={{borderColor:'var(--line)'}}>Delete board</button>}
      </div>}
      <div className={`presentation-board-viewport relative mt-2 flex min-h-0 w-full flex-1 ${isPdfBoard || board === 'video' ? 'pdf-board-viewport overflow-hidden' : 'overflow-auto'} ${board === 'geometry' || board === 'rules' ? 'graphic-board-viewport' : ''}`} style={presentationMode ? undefined : {height:'calc(100dvh - 17rem)'}} aria-label="Presentation board viewport">
      <div onDragEnter={event => {if(!isPdfBoard)return;event.preventDefault();setDraggingPdf(true);}} onDragOver={event => {if(isPdfBoard)event.preventDefault();}} onDragLeave={event => {if(!isPdfBoard)return;if(!event.currentTarget.contains(event.relatedTarget as Node|null))setDraggingPdf(false);}} onDrop={event => {if(!isPdfBoard)return;event.preventDefault();setDraggingPdf(false);void addPdf(event.dataTransfer.files[0]);}} className="presentation-pdf-board relative min-h-0 w-full flex-1 overflow-hidden border border-dashed" style={isPdfBoard ? {borderColor:draggingPdf?'#d6ad4f':'#b9bec6',background:'#050709'} : {position:'absolute',inset:0,visibility:'hidden',pointerEvents:'none'}} aria-hidden={!isPdfBoard}>
        {(() => { const index = boardOrder.indexOf(board); return [boardOrder[index - 1], board, boardOrder[index + 1]].filter((id): id is string => Boolean(id) && Boolean(readyBoards[id])).map(id => { const item = readyBoards[id]; const active = id === board; return <img key={item.url} alt={active ? 'Presentation board' : ''} src={item.url} decoding={active ? 'sync' : 'async'} className="absolute inset-0 h-full w-full" style={{visibility: active ? 'visible' : 'hidden', objectFit:'contain', transform:`scale(${Math.max(zoom, 1) / 100})`}} />; }); })()}
        {isPdfBoard && (readyBoards[board] ? <div aria-hidden="true" className="absolute inset-0 z-10" /> : checkedBoards[board] ? <label className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-2 text-center text-xs text-white"><span>Drop a PDF, WebP, or JPEG here</span><span className="text-[#d6ad4f]">PDFs are saved and shown as WebP</span><input type="file" accept="application/pdf,image/webp,image/jpeg,.pdf,.webp,.jpg,.jpeg" className="sr-only" onChange={event => void addPdf(event.target.files?.[0])}/></label> : <p className="text-xs text-white">Loading slide…</p>)}
        {isPdfBoard && pdfError && <p role="alert" className="absolute bottom-2 left-2 bg-black/80 p-2 text-xs text-red-300">{pdfError}</p>}
      </div>
      {(board === 'video' || boardOrder[boardIndex - 1] === 'video' || boardOrder[boardIndex + 1] === 'video') && <div className={board === 'video' ? 'relative min-h-0 w-full flex-1 overflow-hidden bg-black' : 'absolute h-px w-px overflow-hidden'} aria-hidden={board !== 'video'}><video className="absolute inset-0 h-full w-full" style={{objectFit:'contain'}} controls preload="auto" playsInline aria-label="Vertical Void Lobby walkthrough"><source src={walkthroughUrl} type="video/mp4" />Your browser does not support video playback.</video></div>}
      {board !== 'video' && !isPdfBoard ? <div className={`space-y-2 ${presentationMode ? 'mx-auto' : ''}`} style={{width: zoom + "%", minWidth: (11 * zoom) + "px"}}>
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
      </div> : null}
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}
      {toggleReady && !presentationMode && createPortal(
        <button data-board-edit-control type="button" aria-pressed={false} aria-label="Presentation Mode" title="Presentation Mode" className="fixed bottom-3 right-3 z-50 rounded border bg-black/90 px-2 py-1 text-[11px]" style={{borderColor:'var(--line)',color:'#d6ad4f'}} onClick={() => setPresentationMode(true)}>Presentation Mode</button>
      , document.body)}
    </main>
  );
}

