"use client";

import { createContext, useContext, useEffect, useState, type CSSProperties } from "react";
import { usePathname } from "next/navigation";

export const BOARD_WIDTH = 7407;
export const BOARD_HEIGHT = 2160;
const BoardContext = createContext(false);
export const useBoardMode = () => useContext(BoardContext);
const GlobalBoardContext = createContext(false);
export const useGlobalBoardMode = () => useContext(GlobalBoardContext);
export const PRESENTATION_BOARD_STORAGE_KEY = 'presentation-board-mode';

/** Keeps the page mounted: changing presentation never resets application state. */
export default function BoardMode({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [globalEnabled, setGlobalEnabled] = useState(false);
  const [presentationEnabled, setPresentationEnabled] = useState(false);
  const enabled = pathname === '/composition-presentation' ? presentationEnabled : globalEnabled;
  const [capture, setCapture] = useState(false);
  const [viewport, setViewport] = useState({ width: BOARD_WIDTH, height: BOARD_HEIGHT });
  useEffect(() => {
    const update = () => {
      const params = new URLSearchParams(window.location.search);
      setGlobalEnabled(params.get("board") === "7407x2160");
      let savedPresentation = false;
      try { savedPresentation = sessionStorage.getItem(PRESENTATION_BOARD_STORAGE_KEY) === 'true'; } catch { /* URL state still works if storage is unavailable. */ }
      setPresentationEnabled(params.has('presentationBoard') ? params.get('presentationBoard') === '7407x2160' : savedPresentation);
      setCapture(params.get("capture") === "1");
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("popstate", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("popstate", update);
    };
  }, [pathname]);
  useEffect(() => {
    document.documentElement.classList.toggle("board-preview-active", enabled);
    document.documentElement.classList.toggle("board-capture-active", enabled && capture);
    return () => document.documentElement.classList.remove("board-preview-active", "board-capture-active");
  }, [enabled, capture]);
  const scale = capture ? 1 : Math.min(viewport.width / BOARD_WIDTH, viewport.height / BOARD_HEIGHT);
  const style: CSSProperties | undefined = enabled ? {
    width: BOARD_WIDTH, height: BOARD_HEIGHT,
    transform: `scale(${scale})`, transformOrigin: "top left",
    left: capture ? 0 : (viewport.width - BOARD_WIDTH * scale) / 2,
    top: capture ? 0 : (viewport.height - BOARD_HEIGHT * scale) / 2,
  } : undefined;
  return <GlobalBoardContext.Provider value={globalEnabled}><BoardContext.Provider value={enabled}>
    <div className={enabled ? "board-preview" : "board-normal"}>
      <div data-board={enabled ? "7407x2160" : undefined} data-board-capture={enabled && capture ? "true" : undefined} className={enabled ? "board-canvas" : "board-normal"} style={style}>
        {children}
      </div>
    </div>
  </BoardContext.Provider></GlobalBoardContext.Provider>;
}
