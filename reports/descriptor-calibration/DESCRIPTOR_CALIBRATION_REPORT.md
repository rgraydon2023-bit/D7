# Descriptor calibration report

Source: the 15 OBJs assigned on the live Evaluations page at `http://localhost:3210` (unit feet, up axis auto, identity voxel analysis at 2 ft cells). These are the imported source meshes, not the part2 samples and not lattice-placed copies.

Slot IDs follow the current assignment map. Several filenames do not match the catalog slot names. L1 is `Lobby, Vertical Void.obj` (14,282 vertices), the open stacked form previously shown with Open Volume 1.

One arithmetic bug was corrected after the first pass. `planAspect` used `Math.min(bboxX, bboxY, 0.01)`, which is always 0.01, so every plan aspect was about 2,000. The guard is now `Math.max(0.01, Math.min(bboxX, bboxY))`. No other formula weights were changed. The pre-fix export is `descriptor-calibration-before-planaspect-fix.json`. Numbers below are the corrected run unless marked pre-fix.

These 15 forms are all about 20 × 20 × 20 ft. Absolute size barely varies. Score clustering is mostly caps, shared proxies, and that shared envelope, not a lack of geometric difference inside the envelope.

## Score statistics

| Descriptor | Min | Max | Mean | Median | Std dev | Range | Unique | CV | Low | High | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Open Volume | 38 | 73 | 56.9 | 57 | 9.0 | 35 | 13 | 0.16 | G1 | L5 | Usable spread |
| Convergent | 79 | 99 | 92.9 | 93 | 4.9 | 20 | 9 | 0.05 | O1 | O4 | Saturated high |
| Sculptural | 58 | 75 | 65.9 | 64 | 6.0 | 17 | 12 | 0.09 | G4 | L4 | Compressed mid |
| Visually Connected | 16 | 68 | 49.2 | 48 | 13.4 | 52 | 13 | 0.27 | L1 | O3 | Spread is real, proxy is not |
| Surreal | 39 | 61 | 54.3 | 55 | 6.3 | 22 | 5 | 0.12 | G3 | O2 | Banded |
| Monumental | 37 | 58 | 50.5 | 53 | 6.9 | 21 | 11 | 0.14 | L5 | G1 | Compressed by shared 20 ft envelope |
| Hierarchical | 55 | 80 | 73.7 | 75 | 6.7 | 25 | 4 | 0.09 | G3 | O2 | Banded, 4 values |
| Sequential | 28 | 55 | 43.5 | 47 | 8.4 | 27 | 11 | 0.19 | L1 | O3 | One live component |
| Circulation Activated | 54 | 85 | 71.3 | 73 | 10.3 | 31 | 14 | 0.15 | L1 | G4 | Shares passage with Sequential |
| Centralized | 60 | 81 | 74.4 | 75 | 4.7 | 21 | 9 | 0.06 | O1 | L4 | Saturated, duplicate of Convergent |
| Vertically Integrated | 67 | 88 | 86.2 | 88 | 5.2 | 21 | 3 | 0.06 | G3 | G1 | Severely saturated, 14/15 at 87–88 |
| Luminous | 39 | 77 | 62.2 | 64 | 10.4 | 38 | 13 | 0.17 | L1 | G4 | Partial; sky term is a proxy |

Pre-fix, the plan-aspect bug pinned four components at a constant: Sculptural Formal Irregularity 100, Surreal Non-orthogonal 100, Sequential Linear Plan Bias 100, Centralized Compact Plan 0. After the fix those constants moved, but Vertically Integrated, Convergent, and the Surreal–Hierarchical pair did not open up. Those forms really are ~20 ft squares, so a correct plan aspect is ~1 for all of them.

## Open Volume

Range 38–73. Mean 56.9. Std dev 9.0. 13 unique scores. Status: the old 1–18 cluster is gone.

The 1–18 band was the previous enclosed-void formula. On this set, enclosed void is 0–3 and has weight 0. Exterior-connected space inside the occupied bounds is counted. L1 (`Lobby, Vertical Void.obj`) is 55, not 1. Its other screenshot scores still matched before this audit (Visually Connected 16, Convergent 93, Monumental 57, Hierarchical 75).

| Slot | Open space | Permeability | Interstitial | Low mass | Enclosed void | Score |
|---|---:|---:|---:|---:|---:|---:|
| G1 | 49 | 13 | 49 | 49 | 0 | 38 |
| G2 | 69 | 21 | 63 | 69 | 1 | 53 |
| G3 | 70 | 27 | 67 | 70 | 0 | 57 |
| G4 | 76 | 37 | 70 | 76 | 0 | 63 |
| G5 | 80 | 36 | 69 | 80 | 0 | 65 |
| O1 | 83 | 46 | 57 | 83 | 0 | 67 |
| O2 | 72 | 33 | 61 | 72 | 1 | 58 |
| O3 | 82 | 34 | 72 | 82 | 0 | 66 |
| O4 | 72 | 32 | 68 | 72 | 0 | 59 |
| O5 | 54 | 16 | 50 | 54 | 1 | 42 |
| L1 | 64 | 37 | 59 | 64 | 0 | 55 |
| L2 | 64 | 20 | 58 | 64 | 0 | 50 |
| L3 | 71 | 27 | 59 | 71 | 1 | 55 |
| L4 | 69 | 22 | 61 | 69 | 3 | 53 |
| L5 | 87 | 60 | 57 | 87 | 0 | 73 |

For every form here, architectural open space equals low mass. The envelope is the occupied bounds, these meshes fill all three axes, and no thin-axis padding is added, so free/volume and 1 − occupied/volume are the same number. Half the score (0.35 + 0.15) is one measurement counted twice. Permeability is the component that actually separates them (13–60).

Not rewritten. Recommended later: keep the four-part definition, but compute low mass against a mass baseline that is not identical to the open-space denominator, and keep enclosed void informational.

## Convergent

Range 79–99. Mean 92.9. 87% of forms are 90 or above. Std dev 4.9.

Current formula:

- Plan Centroid Concentration 40%: `(1 - min(1, centroidOffsetPlan * 2)) * 100` → 63–99, mostly ~90
- Inward Recess 35%: `min(1, recess / 8) * 100` → 100 for all 15 (recess is 18–35 ft; the cap is 8 ft)
- Edge Softening 25%: `(1 - edgeFloorRatio) * 100` → 76–100

Inward Recess contributes a locked 35 points. The centroid term adds about 36. Nothing in the formula counts paths, branches, or a shared destination. A form scores high because its floor cells sit near the bounding-box center and the silhouette recess exceeds 8 ft. That is central mass, which is why Convergent and Centralized correlate at Pearson 0.923.

Recommended raw metrics, not applied:

- Directional path convergence: share of circulation graphs whose endpoints fall in the same destination zone
- Branch-in degree at destination zones
- Distinct approach directions that terminate together

Suggested weights: destination agreement 0.45, approach-direction diversity that still terminates 0.35, path continuity into that destination 0.20. Drop centroid, recess, and edge softening from this descriptor. Expected effect: compact centered solids fall; forms with several routes into one room rise; correlation with Centralized should fall because Centralized keeps the centroid term.

## Centralized

Range 60–81 after the plan-aspect fix (pre-fix 30–51). Std dev still 4.7.

- Radial Concentration 50%: same centroid offset as Convergent, with `* 2.2` instead of `* 2`
- Compact Plan 30%: `min(100, 120 / planAspect)` → 100 for all 15, because every plan is about 20 × 20 ft
- Contained Void Core 20%: `voidShare * 110` → 0–10, and 0 for 60%

Two of three components do not vary. The score is the centroid term plus a constant. It is a renamed slice of Convergent.

Recommended: keep centroid concentration, replace compact plan with a radial occupancy falloff (occupied cells vs distance from the plan center), and replace void share with center-zone dominance (share of floor area in the inner third). Weights 0.4 / 0.35 / 0.25. Do not use recess or edge softening.

## Vertically Integrated

Range 67–88. 14 of 15 forms score 87 or 88. Only 3 distinct scores. G3 is 67. Status: severely saturated.

Current formula:

- Floor Stack Count 40%: `min(1, (floorLevels - 1) / 4) * 100`
- Vertical Cell Continuity 35%: `min(100, verticalShare * 150 + spanCellsZ * 10)`
- Height / Plan Ratio 25%: `min(100, aspectTall * 50)`

What the 15 forms actually contain:

| Slot | Floor levels | Span Z (cells) | Vertical share | Stack | Continuity | Height ratio | Score |
|---|---:|---:|---:|---:|---:|---:|---:|
| G1 | 11 | 11 | 0.98 | 100 | 100 | ~50 | 88 |
| G2 | 5 | 11 | 0.88 | 100 | 100 | ~50 | 88 |
| G3 | 3 | 11 | 0.77 | 50 | 100 | ~48 | 67 |
| G4–G5, O1, O5, L1, L5 | 5–11 | 11 | 0.66–0.99 | 100 | 100 | ~50–52 | 88 |
| O2–O4, L2–L4 | 5–10 | 10–11 | 0.85–0.94 | 100 | 100 | ~46–50 | 87 |

`spanCellsZ` is 10 or 11 for every form, because each mesh is about 20 ft tall and the cell is 2 ft. `spanCellsZ * 10` is already 100 before vertical share is added, so Vertical Cell Continuity is 100 for every object. It does not test whether a cell touches the cell above it.

Floor Stack Count hits 100 at 5 distinct floor-Z values. Fourteen forms have 5 or more. G3 has 3, so that term is 50, and it is the only form that leaves the 87–88 band.

Height / Plan Ratio is about 50 for every form because they are all roughly cubic 20 ft masses. `aspectTall * 50` cannot move.

A disconnected stack of plates with five or more occupied Z values scores the same as a stair-connected building. The metric counts “geometry exists at several Z values” and “the object is about as tall as it is wide.”

Recommended raw metrics:

- Connected level pairs: fraction of adjacent occupied levels joined by floor, ramp, stair, or continuous vertical void that a person could pass
- Reachable level count from the lowest entrance, not raw occupied-Z count
- Atrium / void overlap between levels (shared plan footprint of unoccupied shafts)
- Penalize or ignore mere coplanar overlap of disconnected plates

Suggested weights: reachable level fraction 0.45, adjacent-level links 0.35, shared vertical void 0.20. Do not add `spanCellsZ * 10` and do not cap level count at 5. Expected effect: G3 stays lower if its three levels are weakly linked; a true multilevel lobby rises; a plate stack with gaps and no vertical link falls well below 87.

## Sculptural

Range 58–75. Std dev 6.0. The narrow band is normalization, not the full shape range.

- Projection Variation 35%: `min(1, projection / 12) * 100` → only 0, 17, or 33, because raw projection is only 0, 2, or 4 ft
- Recess Variation 30%: `recess / 8` capped → 100 for every form
- Vertical / Horizontal Mix 20%: varies 74–100
- Formal Irregularity 15%: `(planAspect - 1) * 25 + spanCellsZ * 8` → 80–90. Plan aspect is ~1, so this is just height-in-cells and is nearly constant

The score never sees face-normal variation, curvature, or asymmetry. Two components are stuck at the cap.

Recommended: mean angle between adjacent face normals, normal-orientation entropy, sectional-area variance along Z, and plan asymmetry. Weights 0.3 / 0.25 / 0.25 / 0.2. Drop recess, projection, and span-Z. Expected effect: the 58–75 band opens for folded and undulating meshes and drops for flat orthogonal plates.

## Visually Connected

Range 16–68. Std dev 13.4. The spread is real. The measurement is not sight.

- Passage Continuity 40%: `passageShare * 140`
- Open Boundary 30%: `porosity * 130` → 3–45, never high
- Sightline Proxies (sky columns) 30%: empty cells on the top Z slice of the bounds → 42–99

Passage cells are walkable empties above a floor flag, not rays. Sky columns are “the roof slice is not solid.” Pearson with Open Volume is 0.26, so it is not a rename of the revised Open Volume. Pearson with Sequential is 0.91 and with Circulation Activated is 0.90, because all three are driven by `passageShare` (`passageShare` correlates 0.93 with porosity).

Recommended: deterministic rays between occupied zones, mean unobstructed sight length, and fraction of zone pairs that see each other. Weights 0.4 / 0.3 / 0.3. Stop using passage share here so Sequential and Circulation can keep route metrics.

## Surreal

Range 39–61 after the bugfix (pre-fix 56–77, only the repeated values 56, 65, 71, 77). Still only 5 distinct scores. Spearman with Hierarchical is 0.985.

- Unexpected Projection 35%: same `projection / 12` ladder as Sculptural and Hierarchical → 0, 17, or 33
- Non-orthogonal Massing Proxy 35%: `abs(planAspect - 1.4) * 40 + recessNorm * 40`, capped. After the fix this is 53–56 for every form, because every plan is square and every recess is capped
- Stacked Level Ambiguity 30%: the same `levelNorm` as Hierarchical and Vertically Integrated → 100 for 14 forms, 50 for G3

The repeated scores are those three discrete inputs. Surreal does not read orientation entropy, asymmetry, scale jumps, or cantilever.

Recommended: share of face area whose normal is neither axis-aligned nor horizontal, centroid offset between the lower and upper halves, component-size variance, and cantilever (occupied plan area with nothing below). Weights 0.3 / 0.25 / 0.25 / 0.2. Remove `levelNorm` and `projectionNorm` so it stops tracking Hierarchical.

## Hierarchical

Range 55–80. Only 4 distinct scores: driven by the same two ladders as Surreal.

- Floor Level Differentiation 40%: `levelNorm` → 100 or 50
- Vertical Enclosure 30%: `verticalShare * 160` → 100 for every form (vertical share is 0.66–0.99; the cap is 0.625)
- Projection Hierarchy 30%: same projection ladder → 0, 17, or 33

There is no primary/secondary/tertiary ratio.

Recommended: rank connected components or floor plates by area, then primary/secondary area ratio and secondary/tertiary area ratio, plus a dominance index (largest piece / total). Weights 0.4 / 0.35 / 0.25. Do not use level count, vertical-cell share, or silhouette projection.

## Sequential

Range 28–55 after the fix (pre-fix 58–85). The drop is the linear-plan term leaving 100.

- Passage Chain Density 45%: `passageShare * 150` → 7–68, the only term that varies
- Linear Plan Bias 30%: `(planAspect - 1) * 35` → 0–2. These plans are square, so this is correctly low, and it no longer separates anyone
- Connection Port Terminals 25%: `min(1, portCount / 8) * 100` → 100 for every form (13–32 ports)

Sequential is passage density plus two constants. It rewards a high passage-cell ratio, not an ordered sequence.

Recommended: graph depth of the circulation graph, count of zones in the longest simple path, and ordered changes in enclosure or elevation along that path. Weights 0.4 / 0.35 / 0.25. Cap ports so 8 ports is not a perfect score, or drop ports from this descriptor. A long wiggling path should not outscore a short clear sequence.

## Circulation Activated

Range 54–85. Std dev 10.3. Pearson with Sequential is 0.90.

- Passage Ratio 40%: `passageShare * 160` (Sequential uses `* 150`)
- Floor Continuity 30%: `floorShare * 140` → 58–100
- Clear Route Openings 30%: the same `portCount / 8` cap → 100 for every form

The two descriptors share passage share and the port cap. Circulation’s extra term is floor-cell ratio, which is not reachable-space percentage, intersections, or dead ends.

Recommended: reachable empty-cell percentage from entries, route continuity (largest connected passage component / all passage), intersection count, and dead-end ratio. Weights 0.35 / 0.25 / 0.2 / 0.2. Keep passage out of Sequential’s depth metric so the two can diverge.

## Monumental

Range 37–58. Std dev 6.9. All 15 meshes are about 20 ft cubes, so absolute height cannot separate them, and the normalizers throw away the little difference that exists.

- Vertical Extent 40%: `aspectTall * 55` → 51–57. This is height/width, not height in feet
- Occupied Mass 35%: `occupiedVolume / 40` → 40–100, the only moving term
- Plan Footprint 25%: `(bboxX * bboxY) / 80` → 5 for every form. A 20 × 20 ft plan is 400 / 80 = 5. A footprint reaches 100 only near an 89 ft square

File units are feet and are valid. The footprint divisor and the aspect ratio erase that.

Recommended: height in feet against a stated scale (for example 0 at 8 ft, 100 at 40 ft), occupied volume in cubic feet on that same scale, and vertical dominance (height vs the larger plan side) only as a secondary term. Weights 0.4 / 0.35 / 0.25. Do not divide a 20 ft plan by 80.

## Luminous

Range 39–77. Std dev 10.4. Pearson with Open Volume is 0.15, so it is not Open Volume renamed. Pearson with Visually Connected is 0.84 because both use sky-open ratio and porosity.

- Sky Exposure 45%: same top-slice emptiness as Visually Connected → 42–99
- Open Boundary Light Access 30%: `porosity * 120` → 3–41
- Horizontal Plate Openness 25%: `areaBalance * 110` → 32–78

This is roof openness plus horizontal-area share. It is not hemispherical exposure, opening area, or penetration depth.

Recommended: upward hemisphere exposure of exterior faces, opening area facing the sky, and how far an upward ray travels into unoccupied cells before a solid. Weights 0.4 / 0.3 / 0.3. Remove the shared sky-column and porosity terms.

## Highly correlated pairs

| Pair | Pearson | Spearman | Why |
|---|---:|---:|---|
| Surreal ↔ Hierarchical | 0.99 | 0.99 | Same `levelNorm` and same `projectionNorm`. The third component is nearly constant on this set |
| Convergent ↔ Centralized | 0.92 | 0.84 | Both are dominated by plan-centroid offset. Recess, edge, compact plan, and void core do not vary here |
| Visually Connected ↔ Sequential | 0.91 | — | Shared `passageShare` |
| Visually Connected ↔ Circulation Activated | 0.90 | — | Shared `passageShare` |
| Sequential ↔ Circulation Activated | 0.90 | 0.87 | `passageShare * 150` vs `* 160`, plus the same port cap |
| Open Volume ↔ Monumental | −0.88 | — | Inverse mass: open space/low mass vs occupied volume. Related geometry, not copied components |
| Visually Connected ↔ Luminous | 0.84 | — | Shared sky-column ratio and porosity. Just under the 0.85 flag |
| Open Volume ↔ Visually Connected | 0.26 | 0.43 | No longer the same metric after the Open Volume revision |

Raw-metric drivers behind those links: `passageShare` correlates 0.93 with `porosity`; `passageCells` correlates 0.98 with `openBoundary`; `projection` is only 0, 2, or 4 and is identical to `projectionNorm`; `levelNorm` is 1.0 for 14 forms.

## What is functioning reasonably

Open Volume now separates the 15 forms (38–73) for a reason that matches the revised definition, with enclosed void near zero on the open plates. Visually Connected, Luminous, Circulation Activated, and Monumental’s occupied-mass term have real numeric spread. Sculptural’s mix term moves. None of those spreads should be remapped onto 0–100.

## What needs recalibration

Vertically Integrated, Convergent, Centralized, Surreal, Hierarchical, and the passage-shared trio (Visually Connected, Sequential, Circulation Activated). Monumental’s height and footprint normalizers. Luminous’s sky proxy. Sculptural’s recess and projection caps.

Do not percentile-rank the current scores. A later UI can show absolute score and rank separately, for example `72 / 100` and `4 / 15`.

## Bug fixed in this audit

`normalizedDescriptorTerms` plan aspect. Before: denominator `Math.min(bboxX, bboxY, 0.01)` = 0.01, aspect ≈ 2000. After: `Math.max(0.01, Math.min(bboxX, bboxY))`. On these square plans the aspect is about 1. That removed four fake constants. It did not, and was not meant to, unsaturate Vertically Integrated.
