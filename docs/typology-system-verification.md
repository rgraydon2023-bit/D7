# Category / Typology / Source verification

Date: 2026-09-28

The three required contrast cases were generated sequentially with the same synchronized source arrangement, **Letters + Voids** source mode, seed `2041`, descriptor values, and continuity controls.

| Category | Typology | Distinguishing result | Connectivity | Architectural validation |
| --- | --- | --- | --- | --- |
| Gathering | Stepped Amphitheater | Seven occupied terrace levels around a gathering focus | 6 source-derived components to 1 final component | 100/100; terraced levels, circulation, floor area, and open space passed |
| Office | Flat Deep-Plan Plate | Broad, predominantly horizontal workplace plate | 6 source-derived components to 1 final component | 80/100; horizontal plate dominance, circulation, and floor area passed; open-space preservation flagged for review |
| Lobby | Vertical Void Lobby | Strong multilevel opening with overlook plates and vertical circulation | 6 source-derived components to 1 final component | 100/100; 4.5 ft vertical void extent, circulation, floor area, and open space passed |

These results confirm that the typology rule set changes the spatial organization. The office and lobby cases do not execute the radial amphitheater band or amphitheater aisle functions.

## Automated checks

- TypeScript: `npx.cmd tsc --noEmit`
- ESLint: `npm.cmd run lint`
- Production build: `npm.cmd run build`
- Registry count: 15 typology rule sets
- Live route: `http://localhost:3000/composition` returned HTTP 200 after restarting the development server

