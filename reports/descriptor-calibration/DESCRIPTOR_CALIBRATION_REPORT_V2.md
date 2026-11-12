# Descriptor Calibration Report V2

Absolute geometric scores for the 15 Lattice source OBJs after descriptor calibration V2. Scores are not percentile-normalized and were not forced across this set. Rank and percentile are stored beside the absolute score and are not the score.

The V1 diagnostic is unchanged: `DESCRIPTOR_CALIBRATION_REPORT.md`. The V1 numeric export used for this comparison is `descriptor-calibration-v1.json`. This run overwrote `descriptor-calibration.json`, `descriptor-calibration.csv`, and `descriptor-calibration-components.csv`.

Algorithm version: `v2.2`. Analysis is cached by that version plus a hash of occupied cells, cell size, bounds, and mesh area.

## What changed

Open Volume keeps the architectural reading. Low mass is no longer the same ratio as open space. The other eleven descriptors no longer use plan centroid, recess, edge softening, floor-stack count, `spanCellsZ * 10`, height/plan, passage share, port count, level norm, or projection norm as scoring inputs.

A convex hull was not used for low mass. On a thin plate the hull is the plate, so the plate would read as solid. On full-span slabs the hull is the occupied box, so low mass would again equal open space. Low mass is `1 - mean 26-neighbor solidity`. A thin plate has few neighbors. A solid block has many.

## V2 formulas

Each term is normalized to 0–100 on a fixed scale, then combined by weight. Enclosed void has weight 0. Explain Score shows raw value, raw unit, normalized value, weight, and contribution.

### Open Volume

`0.35 open space + 0.30 permeability + 0.25 interstitial + 0.10 low mass`

- Architectural open space: free cells inside the occupied bounds / bounds volume
- Permeability: mean of the six axis pass rates
- Interstitial space: exterior-connected free cells that sit between surfaces
- Low mass: 1 − mean share of the 26-neighborhood that is solid
- Enclosed void: informational only

### Convergent

`0.45 destination agreement + 0.35 approach diversity + 0.20 path continuity`

Routes are thin walkable chains. The edge of a large open floor is not a route. A compact floor with no corridor scores 0.

- Destination agreement: share of entries that reach the dominant junction
- Approach diversity: unique 45° approach sectors / 8
- Path continuity: mean straight-line distance / path length for those approaches

### Centralized

`0.40 center concentration + 0.35 radial occupancy falloff + 0.25 inner-zone dominance`

- Center concentration: 1 − plan-centroid offset from the bounding-box center
- Radial falloff: inner-third occupancy compared with equal-area expectation, against the outer third
- Inner-zone dominance: extra share of cells inside half the plan radius, above the 25% a uniform disk would have

### Vertically Integrated

`0.45 reachable level fraction + 0.35 adjacent-level connections + 0.20 shared vertical void`

A level is a walkable plate of at least 30% of the largest plate. A level counts only if it can be reached from the lowest plate through a step, ramp, or walled vertical passage. Geometry at a Z does not count by itself. A shared void needs a gap of at least three cells and lateral walls. This is not a building-code check. Fewer than two substantial plates scores 0.

### Sculptural

`0.30 adjacent normal variation + 0.25 normal entropy + 0.25 sectional variation + 0.20 plan asymmetry`

- Adjacent normal variation: area-weighted mean angle between triangles that share an edge, / 90°
- Normal entropy: Shannon entropy of orientation bins / log(26)
- Sectional variation: coefficient of variation of occupied area along Z / 0.75
- Plan asymmetry: share of cells whose mirror across the plan axes is empty

### Visually Connected

`0.40 zone-to-zone visibility + 0.30 mean clear sightline + 0.30 visible zone-pair fraction`

Deterministic rays between zone centers on a 4-cell grid. No random samples.

### Surreal

`0.30 non-axis surface + 0.25 upper/lower centroid shift + 0.25 component scale variance + 0.20 cantilever`

Geometric unconventionality only.

- Non-axis surface: mesh area whose largest normal component is below 0.85
- Centroid shift: plan distance between the lower and upper halves / plan diagonal
- Scale variance: coefficient of variation of plate areas / 1.2
- Cantilever: upper cells with no occupied cell beneath within one cell in plan

### Hierarchical

`0.40 primary/secondary + 0.35 secondary/tertiary + 0.25 largest-region dominance`

Plates are ranked by area. A missing secondary or tertiary term is 0. It is not invented.

### Sequential

`0.40 graph depth + 0.35 zones on the longest path + 0.25 ordered transition`

Depth is zone hops on the longest path, / 6. Ordered transition counts elevation or scale changes along that path, not turns.

### Circulation Activated

`0.35 reachable occupiable space + 0.25 largest connected route + 0.20 intersection density + 0.20 dead-end quality`

Dead-end quality is `1 − dead-end zone ratio`. A high dead-end share lowers the score.

### Monumental

`0.40 calibrated height + 0.35 calibrated volume + 0.25 vertical dominance`

Fixed scales, not this dataset:

- Height: 8 ft → 0, 40 ft → 100, clamped
- Volume: 400 cu ft → 0, 12,000 cu ft → 100, clamped
- Vertical dominance: height / max(plan width, plan depth), from 0.4 → 0 to 2.5 → 100

### Luminous

Daylight potential only. Not lux, sDA, ASE, or a climate run.

`0.40 upward hemispherical exposure + 0.30 sky-facing opening + 0.30 daylight penetration`

Nine fixed upward directions. Penetration is the mean distance of every ray until it hits geometry or leaves the form, including blocked rays.

## V1 vs V2 scores

Columns are Open Volume, Convergent, Sculptural, Visually Connected, Surreal, Monumental, Hierarchical, Sequential, Circulation Activated, Centralized, Vertically Integrated, Luminous.

| Slot | File | V1 | V2 |
| --- | --- | --- | --- |
| G1 | Gathering, Linear.obj | 38, 90, 59, 47, 50, 58, 70, 40, 74, 74, 88, 66 | 38, 73, 46, 18, 33, 38, 12, 93, 99, 62, 80, 52 |
| G2 | Gathering, Plate.obj | 53, 93, 62, 37, 50, 52, 70, 30, 55, 76, 88, 61 | 51, 47, 56, 20, 26, 31, 6, 92, 98, 68, 90, 53 |
| G3 | Gathering, Room within Volume.obj | 57, 90, 68, 40, 39, 52, 55, 48, 68, 74, 67, 42 | 55, 0, 55, 31, 30, 31, 22, 92, 98, 43, 80, 76 |
| G4 | Gathering, Stepped.obj | 63, 93, 58, 65, 50, 46, 70, 51, 85, 75, 88, 77 | 60, 40, 64, 24, 26, 29, 11, 100, 89, 78, 85, 68 |
| G5 | Gathering, Void Field.obj | 65, 90, 59, 54, 50, 42, 70, 47, 81, 70, 88, 67 | 61, 57, 61, 18, 27, 28, 30, 74, 96, 90, 90, 68 |
| O1 | void workspace.obj | 67, 79, 60, 57, 50, 39, 70, 50, 71, 60, 88, 58 | 62, 47, 64, 32, 36, 27, 28, 52, 93, 80, 100, 75 |
| O2 | undulating workspace.obj | 58, 98, 71, 61, 61, 54, 80, 50, 80, 77, 87, 73 | 55, 45, 50, 15, 32, 32, 4, 96, 96, 93, 80, 55 |
| O3 | open hall workspace.obj | 66, 96, 73, 68, 61, 43, 80, 55, 85, 75, 87, 71 | 64, 0, 61, 28, 34, 28, 10, 63, 73, 65, 23, 75 |
| O4 | flat deep-plate workspace.obj | 59, 99, 70, 67, 61, 54, 80, 55, 84, 79, 87, 74 | 58, 38, 52, 26, 32, 32, 6, 88, 100, 38, 80, 66 |
| O5 | cascaded workspace.obj | 42, 89, 60, 48, 50, 58, 70, 41, 73, 73, 88, 64 | 40, 54, 47, 17, 26, 35, 13, 96, 95, 75, 83, 58 |
| L1 | Lobby, Vertical Void.obj | 55, 93, 64, 16, 55, 57, 75, 28, 54, 75, 88, 39 | 53, 44, 48, 22, 20, 34, 11, 94, 98, 69, 90, 39 |
| L2 | Lobby, Ground Field.obj | 50, 94, 64, 52, 55, 56, 75, 48, 75, 75, 87, 61 | 47, 48, 46, 15, 23, 32, 9, 96, 98, 87, 80, 64 |
| L3 | Lobby, Linear.obj | 55, 99, 74, 38, 61, 53, 80, 36, 59, 79, 87, 54 | 52, 65, 48, 19, 28, 31, 6, 84, 97, 65, 80, 49 |
| L4 | Lobby, Sequential.obj | 53, 97, 75, 48, 60, 56, 80, 40, 62, 81, 87, 62 | 50, 75, 50, 15, 29, 32, 6, 97, 98, 82, 80, 47 |
| L5 | Lobby, Cont Hall.obj | 73, 94, 72, 40, 61, 37, 80, 34, 64, 73, 88, 64 | 67, 32, 66, 34, 35, 27, 37, 84, 96, 90, 0, 83 |

## V2 statistics

| Descriptor | Min | Max | Mean | Median | Std dev | Unique |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Open Volume | 38 | 67 | 54.20 | 55 | 8.03 | 14 |
| Convergent | 0 | 75 | 44.33 | 47 | 21.00 | 13 |
| Sculptural | 46 | 66 | 54.27 | 52 | 6.98 | 10 |
| Visually Connected | 15 | 34 | 22.27 | 20 | 6.31 | 12 |
| Surreal | 20 | 36 | 29.13 | 29 | 4.43 | 12 |
| Monumental | 27 | 38 | 31.13 | 31 | 2.96 | 8 |
| Hierarchical | 4 | 37 | 14.07 | 11 | 9.88 | 11 |
| Sequential | 52 | 100 | 86.73 | 92 | 13.25 | 11 |
| Circulation Activated | 73 | 100 | 94.93 | 97 | 6.41 | 9 |
| Centralized | 38 | 93 | 72.33 | 75 | 15.79 | 13 |
| Vertically Integrated | 0 | 100 | 74.73 | 80 | 25.78 | 7 |
| Luminous | 39 | 83 | 61.87 | 64 | 12.21 | 13 |

## Correlation

Pearson, descriptor order: Open Volume, Convergent, Sculptural, Visually Connected, Surreal, Monumental, Hierarchical, Sequential, Circulation Activated, Centralized, Vertically Integrated, Luminous.

```
 OV   1.000 -0.546  0.849  0.685  0.390 -0.909  0.493 -0.560 -0.441  0.130 -0.456  0.644
 CV  -0.546  1.000 -0.449 -0.678 -0.224  0.439 -0.219  0.266  0.544  0.357  0.459 -0.641
 SC   0.849 -0.449  1.000  0.713  0.446 -0.872  0.656 -0.565 -0.473  0.204 -0.400  0.751
 VC   0.685 -0.678  0.713  1.000  0.534 -0.583  0.616 -0.533 -0.306 -0.316 -0.470  0.734
 SU   0.390 -0.224  0.446  0.534  1.000 -0.337  0.352 -0.560 -0.284 -0.083 -0.455  0.573
 MO  -0.909  0.439 -0.872 -0.583 -0.337  1.000 -0.538  0.620  0.449 -0.292  0.370 -0.692
 HI   0.493 -0.219  0.656  0.616  0.352 -0.538  1.000 -0.484 -0.005  0.262 -0.339  0.674
 SE  -0.560  0.266 -0.565 -0.533 -0.560  0.620 -0.484  1.000  0.505 -0.041  0.189 -0.500
 CA  -0.441  0.544 -0.473 -0.306 -0.284  0.449 -0.005  0.505  1.000 -0.064  0.471 -0.398
 CE   0.130  0.357  0.204 -0.316 -0.083 -0.292  0.262 -0.041 -0.064  1.000 -0.116  0.004
 VI  -0.456  0.459 -0.400 -0.470 -0.455  0.370 -0.339  0.189  0.471 -0.116  1.000 -0.511
 LU   0.644 -0.641  0.751  0.734  0.573 -0.692  0.674 -0.500 -0.398  0.004 -0.511  1.000
```

Pairs at or above 0.85:

- Open Volume and Monumental: −0.909
- Sculptural and Monumental: −0.872

V1 Surreal–Hierarchical was 0.99. V2 is 0.352. V1 Convergent–Centralized was 0.92. V2 is 0.357. V1 Visually Connected–Sequential was 0.91 and Sequential–Circulation was 0.90. V2 Visually Connected no longer shares passage share with those two. Sequential–Circulation is 0.505.

Open Volume still moves opposite Monumental because a more open form has less occupied volume on a fixed height scale. The formulas do not share a term.

## L1 Open Volume

Lobby, Vertical Void.obj stays open. It does not return to 1.

| | V1 | V2 |
| --- | ---: | ---: |
| Score | 55 | 53 |
| Architectural open space | 64 | 64 |
| Permeability | 37 | 37 |
| Interstitial space | 59 | 59 |
| Low mass | 64 | 44 |
| Enclosed void | 0 | 0 |

Open space, permeability, interstitial space, and enclosed void are unchanged. Low mass dropped because it is no longer a copy of the open-space ratio. Its weight also moved from 15% to 10%, and interstitial space moved from 20% to 25%.

## Vertically Integrated

V1: 14 of 15 forms sat at 87–88. G3 was 67. The cause was `spanCellsZ * 10` and a floor-count term that saturated together.

V2 scores: 0, 23, 80, 80, 80, 80, 80, 80, 80, 83, 85, 90, 90, 90, 100.

Seven forms score 80: their major plates are reachable and linked, and they do not have a multi-cell shared void. O3, the open hall, scores 23. L5, Cont Hall, scores 0 because the voxel model does not find two substantial plates. O1 scores 100 because it also has a shared void. The old 87–88 band is gone. The remaining 80s are the same connection result, not a reused height constant.

## Convergent

V1: every form sat between 79 and 99, because centroid, recess, and edge softening saturated on these centered masses.

V2 scores: 0, 0, 32, 38, 40, 44, 45, 47, 47, 48, 54, 57, 65, 73, 75.

G3 and O3 score 0. They do not have a thin route network. The highest score is 75, not 99.

## Synthetic tests

`src/components/evaluations/descriptorV2.test.ts` and `openVolume.test.ts`: 17 tests, all passing.

- Connected levels score more than 25 points above disconnected slabs on Vertically Integrated.
- A four-arm approach scores more than 20 points above a compact floor on Convergent, and the compact floor stays under 25.
- A primary/secondary/tertiary stack scores more than 20 points above equal plates on Hierarchical.
- A folded mesh scores above an orthogonal cube on Sculptural.
- A stepped pyramid scores above a hollow ring on Centralized.
- A linear run has more graph depth than a single room.
- A branched plan has a higher intersection term than a line.
- A cantilevered shifted mass scores above a supported cube on Surreal.
- An open floor scores more than 20 points above the same floor under a roof on Luminous.
- Repeated runs match.
- Monumental height is 0 at 8 ft and 100 at 40 ft. Volume is 0 at 400 cu ft and 100 at 12,000 cu ft.

## Remaining narrow results

These are absolute results. They were not stretched.

- Monumental is 27–38. Every form is about 20 ft tall and about 20 ft in plan, so the 8–40 ft height scale and the vertical-dominance scale barely move. Height itself only runs 37–40.
- Surreal is 20–36. These meshes are still mostly axis-aligned. Centroid shift is 1–16 and cantilever is 0–14.
- Circulation Activated is 73–100, with 12 of 15 forms from 95 to 100. Reachable walkable space and the largest route are at or near 100 because the 2 ft model is one connected field. Intersection density also sits at 100 for open grids, because interior zones have three or more neighbors.
- Sequential graph depth is 100 for 10 of 15 forms. The absolute cap is 6 zone hops, and these multilevel graphs reach it.
- Shared vertical void is 0 for 9 of 15 forms. A one-cell terrace is not counted as an atrium.
- Adjacent normal variation is 4–19. Most faces are orthogonal, so the mean edge angle stays small. Section and asymmetry carry the rest of Sculptural.
- Enclosed void remains near 0. These forms are not closed boxes.

## Known limitations

- The walkable model is a 2 ft voxel with a cell of floor beneath it. A stair thinner than one cell can be missed, and a 2 ft step can be read as a connection.
- Sight and daylight rays march through that same grid. They are not mesh-accurate and they are not a lighting simulation.
- Corridor detection ignores the skirt of a large open floor. A very wide gallery can therefore score 0 on Convergent even if people can walk across it.
- Hierarchical plates are horizontal connected areas. A single carved object can read as one plate and score low.
- Relative rank is competition rank within the current cohort. Percentile is `(n − rank) / (n − 1)`. It is shown under the absolute score in Explain Score.
- Nothing was committed or pushed.
