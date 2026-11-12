# Full-domain architectural generation — first review checkpoint

Date: 2026-09-28. Scope: G4 Contained Room-Within-Volume, O3 Flat Deep-Plan Plate, and L1 Vertical Void Lobby, in Letters, Voids and Combined modes. The other twelve typologies have not been expanded.

## Outcome and review status

The three organizers now create distinct primary architecture across the source domain. They no longer rely on the previous small local organizer. Nine deterministic test cases reconstructed as one geometric component each. This is a geometric result, not proof of architectural functionality.

The results are more spatially differentiated and substantial than the supplied failure examples, but **do not yet reach the reference board's level of architectural development**. In particular, room capacity, circulation slopes, headroom, enclosure quality and structural support need architectural review. The remaining twelve typologies should wait for this review, as requested.

## Checkpoint and changes

Pre-edit source copies are in `../../checkpoints/2026-09-28-before-full-domain/`. Each original has a `.checkpoint.txt` suffix to avoid TypeScript compiling the backups.

| File / section | Change |
|---|---|
| `src/components/CompositionStudio.tsx:335`, `completePrototypePlacements` | Full Source Field uses the selected alternative's full placements when available, preserving its optimized transforms instead of rebuilding the original grid. |
| `src/components/amphitheaterPrototype.ts:178`, `extractInterLetterVoids`; `voidBoundaries`; `analyzeSourceGeometry:449` | Scoped full-domain analysis retains all detected negative-space regions and their relevant relationships rather than the former sixteen-void / limited cross-link subset. The clearance extraction technique remains approximate. |
| `amphitheaterPrototype.ts:690`, `meshXYZExtent`, `elementXYZExtent` | Architectural XYZ extent diagnostics; renderer Y is elevation and is remapped correctly. |
| `amphitheaterPrototype.ts:706`, `previewElementMesh` | Fast element preview without SDF reconstruction. Preview connectivity is unmeasured. |
| `amphitheaterPrototype.ts:726`, `buildDomainOrganization` | New organizer scoped to the three review typologies; complete region and relationship input, continuous boundaries, primary geometry, explicit circulation, and subsequent organic deformation. |
| `amphitheaterPrototype.ts:879`, `generateProtoArchitecture` | Integrates the three organizers before connections; bypasses their former generic source-node skeleton, central core and local spines; retains legacy paths for other typologies. |
| `amphitheaterPrototype.ts:553`, `continuousSurface` | Existing reconstruction algorithm retained; minimum field resolution is 64 for the three new final outputs to preserve connector joins. |
| `src/components/PrototypeDemonstration.tsx:78`, `cachedAnalysis`, `createVariations`; component generation handlers | Caches extraction, debounces previews, runs final reconstruction on Generate, and disables unfinished OBJ exports. |
| `PrototypeDemonstration.tsx:550` and `:643` | Source utilization panel and explicit separation of geometry proxies from architectural review. JSON exports include source scope and source inventories. |

Reproducible checks: `scripts/domain-validation.cjs`, `domain-baseline.cjs`, and `domain-regression.cjs`.

## Actual source domain

The live page at localhost:3001 was inspected. It currently has **no selected generated alternative** and uses the synchronized 192-letter original grid. Its solution volume is **8.96 × 6.72 × 4.48 source units** (8 × 6 × 4 cells at 1.12). Selection is disabled. Although the extent selector is on Selected 3D Region, there is no selected subsection, so the active source falls back to the complete original field.

Both complete and active inventories report 192 letters, 35 detected negative-space regions and 260 relationships. Letter-center spans are 7.84 × 5.60 × 3.36 source units; these are not the solution bounds or mesh bounds. The seven-letter, 2 × 2 × 2 screenshot arrangement is a different state and was not reconstructed from the screenshot.

Full Source Field and Selected 3D Region are preserved. With an alternative selected, full scope takes its full placements; selected scope takes its selected placements. Existing normalization maps the active source into the architectural tile domain. Source units and architectural feet are therefore reported separately.

## How source relationships drive geometry

All relevant extracted regions contribute to a continuous domain envelope, directional density, elevation distribution and relationships. Graph endpoints contribute to the envelope and circulation entry direction. Source rotations affect the extracted outlines. Equal-distance resampling of the envelope prevents densely sampled letter corners from becoming tiny wall segments.

- Letters: the complete letter-boundary system organizes occupied geometry.
- Voids: the complete set detected by the clearance extractor organizes boundaries and openings; empty extraction returns an invalid result, not substitute letter solids.
- Combined: letters organize the occupied envelope and negative-space outlines organize apertures within one model. Separate completed models are not overlaid.

This is a synthesis of all extracted inputs, not an exact preservation of every cluster or void. Convex envelopes still simplify concavities and local clustering. The graph is the existing proximity/MST relationship representation, not every possible pairwise relationship.

## Typology, descriptors and organic development

**G4:** A substantial interstitial floor supports a nested room with an entrance, partial walls and roof. Larger wrapping shell segments and a canopy establish the outer volume. A room approach joins the hierarchy. Architectural height has a 12.5-foot minimum; it is not a direct copy of source Z.

**O3:** One broad occupied datum spans the domain with substantial depth, a limited source-informed lightwell and perimeter circulation. Source elevations influence the datum, without turning the office into stacked or terraced plates.

**L1:** A continuous negative-space-informed aperture passes through arrival and overlook levels. Level elevations combine the source distribution and architectural spacing. Perimeter ascent and rounded landings connect levels while leaving the atrium open. Height has an 8.5-foot minimum; two to four occupied levels are selected according to available height.

All twelve descriptors produce changed preview geometry when varied individually from the baseline. They affect openness, aperture size, entry direction, articulation, hierarchy, level distribution and circulation within the selected organizer. A changed mesh hash demonstrates sensitivity, not necessarily a sufficiently strong or desirable visual effect.

Organic development uses one smooth XY deformation field after primary geometry and circulation are established. The same field transforms occupied outlines, opening outlines and ramp endpoints. Flat platform elevations remain flat. Registration connector geometry and its interface arms are protected. Existing SDF/Marching Cubes reconstruction then blends the continuous elements; no box-union base massing was introduced.

## Controlled comparison

The reproducible fixture is a deterministic 192-letter, 8 × 6 × 4 arrangement, seed 2041, unchanged descriptor settings and controls across all nine cases. **It is not a capture of the current browser arrangement.** See `fixture.json` and `results.json`.

| Mode | Regions used / available | Relationships used / available |
|---|---:|---:|
| Letters | 192 / 192 | 191 / 191 |
| Voids | 32 / 32 | 31 / 31 |
| Combined | 224 / 224 | 254 / 254 |

No additional representative detail sample was used. Counts refer to regions detected by the current extractor, not a claim that all mathematically possible voids were found.

### Combined-mode extent comparison, architectural feet (X × Y × Z)

Normalized input mesh extent: **16.72 × 12.28 × 7.72 ft**. The Voids-mode extracted extent is **12.00 × 8.27 × 7.09 ft**.

| Typology | Previous final | New raw primary | New final |
|---|---|---|---|
| G4 | 5.82 × 7.59 × 2.78 | 16.73 × 12.12 × 12.80 | 16.53 × 12.00 × 12.75 |
| O3 | 7.76 × 7.48 × 0.52 | 16.73 × 12.12 × 0.80 | 16.53 × 12.41 × 1.20 |
| L1 | 7.33 × 6.23 × 4.31 | 16.73 × 12.12 × 9.35 | 16.53 × 11.97 × 9.51 |

These changes come from different domain organizers, not scaling the previous objects. O3's low vertical extent is intentional; G4 and L1 expand vertically to establish their architectural hierarchy.

### Raw topology before connection and reconstruction

| Typology | Occupied nodes | Discrete occupied plates | Principal voids | Distinguishing primary elements | Terrace active |
|---|---:|---:|---:|---|---|
| G4 | 2 | 2 | 1 | Interstitial floor, nested room, room roof, outer shells and canopy | No |
| O3 | 1 | 1 | 1 | Single deep workplace field | No |
| L1 | 2 in this fixture | 2 | 1 | Arrival and overlook rings around a continuous atrium | No |

The discrete-plate diagnostic counts occupied floor nodes, not every roof or shell element. The continuous-surface counter is zero for these primary element sets; the final reconstructed mesh is continuous geometry. G4 and O3 start as connected primary systems; L1's two occupied levels become one mesh through explicit ascent geometry.

All nine final and presentation meshes measured **one connected component**. All numerical geometry checks pass, but the UI now labels these as proxies requiring visual review. In particular, the generated-route coverage value is not a measured accessible-route analysis.

## Visual evidence

- `comparison.png`: Combined-mode isometric, plan and central cutaway views of all three types at a consistent drawing scale.
- `development.html`: original source, extracted relationships, raw/primary surfaces, connections, organic development and final views.
- Per-typology `*-stages.json` and `*-final.obj`: actual generated geometry underlying the drawings.

The static section view removes triangles on one side of the central plane; it is a diagnostic cutaway, not a capped construction section. SVG projection uses simple depth sorting, so it is not a replacement for the app's interactive camera. Browser DOM updates were verified; automated browser interaction was blocked by a CDP focus-emulation timeout. No interactive click-through success is claimed.

## Performance and preservation checks

- TypeScript full no-emit check passed.
- Nine final cases took approximately **4.1–7.9 seconds per mode** on this machine. Final generation updates one mode at a time; individual reconstruction still occupies the main thread. There is no worker implementation.
- Slider changes use debounced element previews rather than final SDF generation. Source analysis is cached independently of typology geometry.
- All twelve descriptor sensitivity checks and an interior source-position perturbation changed geometry for each of the three types.
- Checkpoint comparisons found identical final mesh hashes for Stepped Amphitheater, Void-Field Gathering and Open Hall Workspace on the same fixture.
- Empty-void extraction guard passed.
- Existing category controls, export format, Rhino feet workflow, camera modes, tile registration and aggregation remain in place. Their presence is not a claim of exhaustive end-to-end regression coverage.
- No production build was run against the live development server's `.next` directory; this avoids the prior dev/build asset collision.

## Remaining limitations / review gate

1. Void extraction remains a sampled clearance approximation (fixed XY samples and limited Z slices), not exact inter-letter Boolean volume reconstruction.
2. The domain envelope summarizes fine concavities and clustering. Source response is demonstrable, but spatial fidelity needs comparison on additional real saved arrangements.
3. G4's inner room remains small in the tested architectural tile: approximately 21 ft² in Combined and approximately 5.4 ft² in Voids. It is identifiable as nested geometry but cannot yet be called a usable gathering room.
4. L1 ascent slopes and headroom have not been certified; a connected mesh can still contain impractical circulation. The current numerical coverage proxy must not be treated as that certification.
5. Surface-area proxies can include multiple mesh faces and are not net usable floor-area schedules.
6. Exact selected seven-letter screenshot geometry was unavailable. The nine-case comparison is a reproducible full-field fixture, not validation of every source selection.
7. The outputs are still schematic proto-architecture. They do not yet meet the reference board's full development level. This review checkpoint deliberately does not expand the remaining twelve typologies.
