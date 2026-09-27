"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useGridStore } from "./GridStore";
import { ROTATION_STEP } from "./rotationGradient";

const LINKS = [
  { href: "/", label: "Slide" },
  { href: "/crops", label: "Crops" },
  { href: "/3d-crops", label: "3D Crops" },
  { href: "/shapes", label: "Shapes" },
  { href: "/voids", label: "Voids" },
  { href: "/compare", label: "Compare Views" },
] as const;

export default function AppNav() {
  const pathname = usePathname();
  const { lessDegrees, setLessDegrees, moreDegrees, setMoreDegrees } = useGridStore();

  return (
    <nav className="flex flex-wrap items-center gap-1">
      {LINKS.map((link) => {
        const active =
          link.href === "/"
            ? pathname === "/"
            : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className="rounded px-2.5 py-1 text-[11px] transition"
            style={{
              background: active ? "var(--accent)" : "transparent",
              color: active ? "#000" : "var(--muted)",
              border: active ? "1px solid transparent" : "1px solid var(--line)",
              fontWeight: active ? 600 : 400,
            }}
          >
            {link.label}
          </Link>
        );
      })}
      <span className="mx-1 hidden h-4 w-px bg-[var(--line)] lg:block" />
      <label className="flex min-w-[112px] items-center gap-1 text-[10px]" title="Live minimum rotation">
        <span style={{ color: "var(--muted)" }}>Less</span>
        <input
          aria-label="Shared less rotation"
          type="range"
          min={0}
          max={345}
          step={ROTATION_STEP}
          value={lessDegrees}
          onChange={(event) => setLessDegrees(Number(event.target.value))}
          className="min-w-0 flex-1 accent-[var(--accent)]"
        />
        <span className="w-6 tabular-nums" style={{ color: "var(--muted)" }}>{lessDegrees}°</span>
      </label>
      <label className="flex min-w-[112px] items-center gap-1 text-[10px]" title="Live maximum rotation">
        <span style={{ color: "var(--muted)" }}>More</span>
        <input
          aria-label="Shared more rotation"
          type="range"
          min={0}
          max={345}
          step={ROTATION_STEP}
          value={moreDegrees}
          onChange={(event) => setMoreDegrees(Number(event.target.value))}
          className="min-w-0 flex-1 accent-[var(--accent)]"
        />
        <span className="w-6 tabular-nums" style={{ color: "var(--muted)" }}>{moreDegrees}°</span>
      </label>
    </nav>
  );
}
