"use client";

import { useEffect, useState } from "react";
import { loadPresentationGraphics } from "@/components/presentationGraphics";
import type { PrototypeCategory, PrototypeTypologyId } from "@/components/amphitheaterPrototype";
import AppNav from "@/components/AppNav";

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
  const [graphics, setGraphics] = useState<Partial<Record<PrototypeTypologyId, DisplayGraphic>>>({});
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(100);
  useEffect(() => {
    let active = true; let currentUrls: string[] = []; let revision = 0;
    const refresh = async () => {
      const request = ++revision;
      try {
        const records = await loadPresentationGraphics();
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
  }, []);
  return (
    <main className="min-h-screen bg-black px-4 py-4 md:px-5">
      <h1 className="text-xl font-semibold" style={{ color: "#d6ad4f" }}>Composition Presentation</h1>
      <div className="mt-3 overflow-x-auto pb-1"><AppNav /></div>
      <h2 className="mt-3 text-sm font-semibold" style={{ color: "#d6ad4f" }}>General Rules</h2>
      <p className="mt-1 max-w-5xl text-xs leading-relaxed text-white">Letters keep their proportions and stay between 75% and 150% of their original size, while rising along Z and overlapping the other letters by at least 25% of their own volume. Adjacent letters remain connected through bridges or intersections, with central openings protected and fillets rounding connections.</p>
      <div className="mt-4 flex items-center gap-2 text-xs" aria-label="Board zoom controls">
        <button type="button" aria-label="Zoom out" disabled={zoom <= 50} onClick={() => setZoom(value => Math.max(50, value - 25))} className="rounded border px-3 py-1 disabled:opacity-40" style={{borderColor: "var(--line)"}}>−</button>
        <span aria-live="polite">{zoom}%</span>
        <button type="button" aria-label="Zoom in" disabled={zoom >= 500} onClick={() => setZoom(value => Math.min(500, value + 25))} className="rounded border px-3 py-1 disabled:opacity-40" style={{borderColor: "var(--line)"}}>+</button>
        <button type="button" onClick={() => setZoom(100)} className="rounded border px-3 py-1" style={{borderColor: "var(--line)"}}>Reset zoom</button>
      </div>
      <div className="mt-2 max-h-[75vh] overflow-auto" aria-label="Presentation board viewport">
      <div className="space-y-2" style={{width: zoom + "%", minWidth: (11 * zoom) + "px"}}>
        {rows.map((row) => <section key={row.category} aria-label={`${row.title} typologies`}>
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "#d6ad4f" }}>{row.title}</h2>
          <div className="grid grid-cols-5 gap-2 md:gap-3">
            {row.typologies.map((item) => {
              const graphic = graphics[item.id];
              return <article key={item.id} aria-label={`${row.title}: ${item.name}`} className="relative min-w-0 overflow-hidden border border-[#b9bec6]" style={{ aspectRatio: "33 / 12.5" }}>
                {graphic ? <div role="img" aria-label={`${graphic.name} graphic rules`} className="absolute inset-0 bg-center bg-no-repeat" style={{ backgroundImage: `url("${graphic.url}")`, backgroundSize: "100% 100%" }} /> : <div className="p-2"><h3 className="truncate text-[10px] font-semibold sm:text-xs" style={{ color: "#d6ad4f" }}>{item.name}</h3><p className="mt-1 text-[9px] text-white sm:text-[10px]">Download Graphic Rules to Board for this typology to fill this panel.</p></div>}
              </article>;
            })}
          </div>
        </section>)}
      </div>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}
    </main>
  );
}

