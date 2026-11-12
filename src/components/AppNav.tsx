"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useGlobalBoardMode } from "./BoardMode";

const LINKS = [
  { href: "/", label: "Slide" },
  { href: "/crops", label: "Crops" },
  { href: "/shapes", label: "Shapes" },
  { href: "/voids", label: "Voids" },
  { href: "/composition", label: "Composition" },
  { href: "/composition-presentation", label: "Presentation" },
  { href: "/evaluations", label: "Evaluations" },
  { href: "/lattice", label: "Lattice" },
  { href: "/part3", label: "Part 3" },
] as const;

export default function AppNav() {
  const pathname = usePathname();
  const board = useGlobalBoardMode();

  return (
    <nav aria-label="Application" className="app-nav flex items-center gap-1">
      {LINKS.map((link) => {
        const active =
          link.href === "/"
            ? pathname === "/"
            : (pathname === link.href || pathname.startsWith(`${link.href}/`));
        return (
          <Link
            key={link.href}
            href={board ? `${link.href}?board=7407x2160` : link.href}
            className="rounded px-2.5 py-1 text-[11px] transition"
            style={{
              background: active ? "var(--accent)" : "transparent",
              color: active ? "var(--app-background)" : "var(--muted)",
              border: active ? "1px solid transparent" : "1px solid var(--line)",
              fontWeight: active ? 600 : 400,
            }}
          >
            {link.label}
          </Link>
        );
      })}
      <button data-board-edit-control type="button" className="rounded border px-2.5 py-1 text-[11px]" style={{ borderColor: "var(--line)", color: "var(--muted)" }}
        onClick={() => {
          const url = new URL(window.location.href);
          if (board) { url.searchParams.delete("board"); url.searchParams.delete("capture"); }
          else url.searchParams.set("board", "7407x2160");
          window.history.replaceState(window.history.state, "", url);
          window.dispatchEvent(new PopStateEvent("popstate"));
        }}>
        {board ? "Exit board" : "Board mode"}
      </button>
    </nav>
  );
}
