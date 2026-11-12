# LUV typology implementation and verification

Date: 2026-09-28

## Checkpoint

The preimplementation source is preserved in `checkpoints/2026-09-28-before-complete-typology-spec`.

## Removed universal stepped bias

The earlier common path coupled three operations that made unrelated results read as variations of an amphitheater:

- `amphitheaterBand` created open radial bands.
- `primaryRows` and the shared platform loop created repeated elevated rings or plates.
- `continuousSurface` reconstructed the already stepped element collection, so smoothing changed its surface without changing its topology.

`generateProtoArchitecture` now runs the selected typology recipe before descriptor and organic modification. `amphitheaterBand` is called only by **Stepped Amphitheater**. Source-derived local rows are greater than one only when the selected recipe activates `TERRACE`, or when a topographic type needs one local continuous elevation transition.

## Shared operation system

All types use the same extraction, connection, SDF reconstruction, interlocking, export, and validation pipeline. Their topology changes through reusable organizers: `PLATE`, `VOID`, `EDGE`, `FOLD`, `TERRACE`, `ENCLOSE`, `LINEARIZE`, `BRIDGE`, `FIELD`, `VERTICALIZE`, `TOPOGRAPH`, `CONVERGE`, `SEQUENCE`, `OVERLOOK`, `PROJECT`, `CONTAIN`, `OPENNESS`, `CONTINUITY`, and `DEPTH`.

Descriptors modify the active topology. Organic controls run after topology and circulation: Organic Influence, Boundary Curvature, Blend Radius, Surface Relaxation, Branching Influence, and Source Preservation.

## Recipes

| Category | Typology | Primary | Secondary | Optional | Disabled behavior summary |
|---|---|---|---|---|---|
| Gathering | Stepped Amphitheater | TERRACE, CONVERGE | SEQUENCE, OVERLOOK, BRIDGE | PLATE, VOID | Edge, fold, enclosure, linear, field, vertical, topographic, projection, containment |
| Gathering | Void-Field Gathering | VOID, FIELD | BRIDGE, EDGE, OVERLOOK | PLATE, SEQUENCE | Terrace, convergence, enclosure, linear, vertical, topographic, projection, containment |
| Gathering | Inserted Horizontal Plate | PLATE, PROJECT | VOID, BRIDGE, OVERLOOK | FOLD | Terrace, convergence, field, containment, verticalization, linearization |
| Gathering | Contained Room-Within-Volume | CONTAIN, ENCLOSE | VOID, OVERLOOK, BRIDGE | PLATE | Terrace, convergence, field, projection, topography, linearization |
| Gathering | Linear Edge Gallery | LINEARIZE, EDGE | SEQUENCE, OVERLOOK, BRIDGE | VOID, PLATE | Terrace, convergence, field, containment, verticalization, topography |
| Office | Open Hall Workspace | PLATE | OPENNESS, CONTINUITY | VOID, EDGE, BRIDGE | Terrace, convergence, fold, field, verticalization, projection, containment |
| Office | Cascaded / Terraced Plates | TERRACE, PLATE | OVERLOOK, BRIDGE, SEQUENCE | VOID, PROJECT | Convergence, field, enclosure, containment, topography, linearization |
| Office | Flat Deep-Plan Plate | PLATE, DEPTH | CONTINUITY | VOID, EDGE | Terrace, convergence, fold, field, verticalization, projection, containment |
| Office | Void-Edge Workspace | VOID, EDGE | PLATE, BRIDGE, OVERLOOK | PROJECT, VERTICALIZE | Terrace, convergence, field, enclosure, containment, topography, linearization |
| Office | Folded / Undulating Work Surface | FOLD, TOPOGRAPH, PLATE | CONTINUITY | BRIDGE, SEQUENCE | Terrace, convergence, field, enclosure, containment, verticalization |
| Lobby | Vertical Void Lobby | VOID, VERTICALIZE | OVERLOOK, BRIDGE, SEQUENCE | PLATE, EDGE | Terrace, convergence, fold, field, enclosure, containment, projection |
| Lobby | Compressed Sequential Lobby | SEQUENCE | LINEARIZE, ENCLOSE, OPENNESS | VOID, FOLD | Terrace, convergence, field, verticalization, projection, containment |
| Lobby | Continuous Hall Lobby | LINEARIZE, CONTINUITY | PLATE, SEQUENCE | VOID, EDGE | Terrace, convergence, field, verticalization, topography, containment |
| Lobby | Topographic / Ground-Field Lobby | TOPOGRAPH, FIELD | SEQUENCE, BRIDGE, PLATE | VOID, FOLD | Global terrace, convergence, enclosure, containment, projection, verticalization |
| Lobby | Linear Gallery Lobby | LINEARIZE, SEQUENCE | EDGE, OVERLOOK | VOID, BRIDGE | Terrace, convergence, field, enclosure, containment, topography |

The interface debug panel lists the complete disabled set for the current recipe.

## Contrast results

Every run used the same 12-object source arrangement, seed 2041, scale 0.72, descriptor profile, and reconstruction controls.

### Gathering

| Typology | Distinguishing result | Criterion result |
|---|---|---|
| Stepped Amphitheater | Convergent multi-level terraces | 10 connected occupied levels |
| Void-Field Gathering | Distributed void-first nodes and edges | 20 meaningful voids |
| Inserted Horizontal Plate | Projecting plates within a larger open volume | 2 explicit projections |
| Contained Room-Within-Volume | Inner enclosure plus surrounding occupied/open field | 12.39 ft² identifiable inner room |
| Linear Edge Gallery | Long edge occupation and directional network | 2.62 linear ratio |

### Office

| Typology | Distinguishing result | Criterion result |
|---|---|---|
| Open Hall Workspace | One low-fragmentation horizontal field | 151.09 ft² continuous horizontal area |
| Cascaded / Terraced Plates | Differentiated connected work levels | 10 occupied levels |
| Flat Deep-Plan Plate | Deep horizontal occupation with compressed elevations | 148.51 ft² horizontal area |
| Void-Edge Workspace | Occupied rings and bridges generated from void boundaries | 3 principal occupied void edges |
| Folded / Undulating Work Surface | Continuous sloped and folded bands | 12.05 ft continuous rise |

### Lobby

| Typology | Distinguishing result | Criterion result |
|---|---|---|
| Vertical Void Lobby | Multilevel occupation around one vertical opening | 13.03 ft vertical extent |
| Compressed Sequential Lobby | Alternating compressed and expanded thresholds | 9 transitions |
| Continuous Hall Lobby | One uninterrupted directional hall | 28.23 ft path |
| Topographic / Ground-Field Lobby | Circulation embedded in a continuous elevation field | 13.52 ft continuous rise |
| Linear Gallery Lobby | Longitudinal events connected along one direction | 2.64 linear ratio |

## Source-mode, connectivity, and architectural validation

| Source mode | Typologies tested | Typology criteria passed | Architecturally valid | One connected final component |
|---|---:|---:|---:|---:|
| Letters | 15 | 15 | 15 | 15 |
| Voids | 15 | 15 | 15 | 15 |
| Letters + Voids | 15 | 15 | 15 | 15 |

The modes share a generator but preserve different source semantics: Letters supply occupied boundaries, Voids supply actual extracted negative-space boundaries, and Combined resolves both through one mixed source graph before reconstruction.

## Interlocking and scale

The existing 20 ft × 20 ft horizontal tile registration, 20 ft vertical registration, complementary edge connectors, 90-degree rotations, translation, mirroring, aggregation, and OBJ export in feet remain in the common post-typology pipeline.

Representative Gathering, Office, and Lobby results were each assembled into 2-tile, 4-tile, and 8-tile aggregations. All nine aggregation validations passed with complementary connector dimensions and elevations.

## Machine-readable evidence

- `typology-matrix-results.json` — Letters + Voids
- `typology-matrix-letters.json` — Letters
- `typology-matrix-voids.json` — Voids
- `interlocking-gathering.json`, `interlocking-office.json`, and `interlocking-lobby.json` — 2/4/8 tile validation

All 45 tested combinations passed. No typology remains flagged for refinement by the current geometric and architectural validation suite.
