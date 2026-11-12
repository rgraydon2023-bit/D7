# O3 Full-Form Source Generation Correction

## Scope

This proof of concept changes only the **Office / Flat Deep-Plan Plate (O3)** organizer and its diagnostic presentation. The remaining fourteen typologies, shared source synchronization, saved settings, interlocking tiles, aggregation, camera views, OBJ/Rhino export, and the existing continuous SDF/Marching Cubes reconstruction remain in place.

The checkpoint created before editing is stored at `checkpoints/2026-09-28-before-o3-full-form/`.

## Validation fixture

The focused test uses the existing deterministic 192-letter full-domain fixture, the same seed, descriptors, and continuity controls for Letters, Voids, and Letters + Voids. A second pass perturbs every seventeenth source placement in X, Y, Z, and rotation to verify that source changes alter the **pre-connector, pre-SDF primary geometry**.

Commands completed successfully:

```text
node node_modules\typescript\bin\tsc --noEmit --incremental false
node node_modules\typescript\bin\tsc -p tsconfig.typology-matrix.json
node reports\o3-full-form-validation\run.cjs
```

The machine-readable measurements are in `results.json`.

## Required implementation report

### 1. Exact functions changed

- `letterVolumeSlices` was added to reconstruct transformed, elevation-aware volumetric slices from every selected letter placement.
- `fullLetterVolumes` was added to group those slices by source placement and merge overlapping slices into one source volume per placement where possible.
- `fullVoidVolumes` was added to sample bounded three-dimensional clearance, cluster face-adjacent negative-space cells, and convert those clusters into coherent void volumes.
- `buildDomainOrganization` now receives the source placements. Its `flat-deep-plan-plate` branch uses the full letter and void volumes before it builds architectural links.
- `route` accepts an optional architectural width and straight-routing flag. Existing callers retain their previous defaults.
- `generateProtoArchitecture` now exposes unified source geometry and O3 full-form diagnostics. Its existing continuous-surface/SDF stage is retained.
- `PrototypeDemonstration` now shows unified source volumes as a distinct stage and displays the O3 source-to-architecture diagnostic.

### 2. How overlapping letter meshes are unified

Each letter placement is converted into transformed slice prisms using its actual position, X/Y/Z rotation, nonuniform scale, source scale, and letter outline. Slices belonging to the same placement are envelope-merged when their XY and Z ranges overlap. The full occupied collection then enters the existing continuous signed-distance union, which removes internal overlap faces in the finished mesh.

The validation fixture contains 192 spatially distinct placements, so its measured count remains **192 before and 192 after per-placement overlap grouping**. This unchanged count is a property of this fixture, not a skipped union stage.

### 3. How disconnected letter groups are detected

The O3 organizer clusters source volumes by three-dimensional overlap and proximity, then synthesizes the complete set into a bounded number of major source-derived zones. The validation fixture produced **12 architectural source groups** from its 192 letter placements. Every source volume is assigned to a zone; none are discarded because they are outside the largest component.

### 4. How void volumes are represented

Voids are represented as connected three-dimensional negative-space volumes. The extractor samples a bounded 13 × 13 XY field across 5–14 Z slices, rejects occupied clearance cells, groups face-adjacent cells, and converts each significant group to a smoothed footprint with a vertical extent. These are volumetric opening fields rather than centerlines.

For the fixture, **32 sampled void regions became 2 connected void volumes**.

### 5. How void volumes are linked into one system

In Voids mode, occupied architectural rings are built around the actual connected void boundaries. A minimum spanning network links their occupied nodes with broad plate and circulation bands. These links are unioned with the occupied regions before continuous reconstruction. The resulting final mesh has **1 connected component**.

### 6. How Combined mode is integrated

Combined mode builds one plate field influenced by both systems. Letter-derived occupied zones establish the workplace field, while the connected negative-space volumes become scaled, source-shaped apertures inside that field. The voids are applied before reconstruction and participate in the same organizer and SDF, rather than overlaying a completed Letters model with a completed Voids model.

The aperture interpretation is intentionally scaled to preserve a continuous deep-plan workplace plate while retaining the source void locations and shapes.

### 7. Role of the relationship graph

The relationship graph records source adjacency, provenance, and candidate circulation links. It prioritizes which full-form occupied regions should connect and annotates the generated link elements.

### 8. Is the graph still the primary form generator?

No. The occupied source volumes, negative-space volumes, and the O3 plate field exist before graph links are generated. The graph is a **secondary organizer**. Removing graph edges would remove or reduce connections, but it would not erase the primary plate geometry.

### 9. Volumetric representation used

The pipeline uses transformed letter slice prisms, connected void-cell volumes, raster-unioned concave occupied plate fields, and the existing continuous SDF/Marching Cubes reconstruction. It does not use a convex hull of the source and does not reduce the source to centroid lines.

### 10. Does the primary architecture derive from the full source volume?

Yes for O3. Every selected letter volume or significant connected void volume enters the organizer before connectors and SDF. The diagnostic flag reports `fullVolumetricSourceUsed: true` in all three modes. The perturbation test also confirms that changing source X/Y/Z/rotation changes the primary pre-connector geometry in all modes.

### 11. Links generated

| Source mode | Source graph edges | Architectural connector elements | Final components |
|---|---:|---:|---:|
| Letters | 191 | 41 | 1 |
| Voids | 110 | 11 | 1 |
| Letters + Voids | 333 | 41 | 1 |

The connector count is lower than the graph-edge count because the graph contains analytical relationships while the architectural network uses a selected set of broad routes and bridge bands.

### 12. Geometry before SDF reconstruction

| Source mode | Unified source elements | Primary architectural elements before connections | Source groups |
|---|---:|---:|---:|
| Letters | 192 | 15 | 12 |
| Voids | 2 | 5 | 2 |
| Letters + Voids | 194 | 17 | 12 |

This stage is available in the demonstration as **Components + full source field** and **Typology interpretation + primary geometry**. It allows inspection before the final continuous reconstruction.

### 13. Source extent versus architectural extent

All measurements are in feet.

| Source mode | Source X × Y × Z | Architecture X × Y × Z | Finished horizontal area |
|---|---|---|---:|
| Letters | 16.72 × 12.28 × 7.72 | 19.78 × 17.35 × 1.35 | 480.74 ft² |
| Voids | 12.00 × 8.27 × 7.09 | 19.01 × 17.50 × 1.26 | 155.40 ft² |
| Letters + Voids | 16.72 × 12.28 × 7.72 | 19.78 × 17.35 × 1.32 | 335.12 ft² |

The reduced architectural Z extent is expected for Flat Deep-Plan Plate: the complete source elevation field affects grouping, datum, thickness, and organization, while this typology intentionally resolves it into a predominantly horizontal workplace.

### 14. Remaining limitations

- Letter union uses transformed slice-prism envelopes followed by SDF union, not an exact triangle-mesh Boolean of the font meshes.
- Void extraction is a bounded clearance-field approximation. It identifies coherent inter-letter negative volumes but does not compute an exact analytic complement.
- The Combined openings are scaled typological interpretations of the full voids so they do not sever the workplace plate. The full void volumes remain visible in the unified-source diagnostic and remain linked to provenance.
- The focused fixture has no overlapping letter placements after per-placement grouping, so a fixture with intentional intersections should be added before claiming exact overlap-count coverage.
- Marching Cubes emitted 10–29 removable degenerate triangles, below the O3 cleanup tolerance of 0.5%. Clean indices are used in the final mesh; all three runs report no structural or architectural validation failures.
- Continuous circulation is verified geometrically. Code compliance, accessible slopes, structural feasibility, and detailed program performance require downstream architectural evaluation.
- Visual resemblance to the reference images still requires review in the app; the automated test establishes source dependence, full-field use, connectivity, and mode differentiation.

### 15. Does the result read as transformation of the full source geometry?

Computationally, yes. The full selected source is present in the unified-volume stage, all regions feed the O3 organizer, the primary geometry changes when the source is perturbed, and the relationship graph is secondary. The generated result is therefore no longer a form reconstructed primarily from centroid edges.

Architecturally, the current output should be reviewed in the isometric, plan, and section views against the supplied Flat Deep-Plan Plate reference. This implementation stops at the requested O3 proof-of-concept boundary so that review can decide whether its plate depth, openings, and source influence are visually strong enough before the same strategy is propagated to the other fourteen typologies.

## Final validation status

- TypeScript application compile: **pass**
- Typology matrix build: **pass**
- Letters full-form validation: **pass**
- Voids full-form validation: **pass**
- Letters + Voids full-form validation: **pass**
- Source perturbation changes pre-SDF primary geometry in all modes: **pass**
- Final connected mesh components in all modes: **1**
- Reported structural failures: **0**
- Reported architectural failures: **0**
