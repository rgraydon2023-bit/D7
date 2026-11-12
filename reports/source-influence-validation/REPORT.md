# Source-to-architecture validation

## A. Overall result: FAIL against the requested source-traceability standard

The generator is **source-responsive at the envelope and aggregate-statistic level, but predominantly typology-prescribed at the architectural-organization level**. It is not completely source-independent. However, consuming every region, obtaining different mesh hashes, and reconstructing one connected component do not establish meaningful source-to-zone correspondence.

The earlier “100% used” figures were input-accounting counts. They should not have been presented as demonstrated meaningful source coverage. This diagnostic supersedes that interpretation.

No application code, settings, or live source arrangement was modified. Only this diagnostic harness and report artifacts were added. Before/after hashes for the three relevant application files are recorded in `results.json`.

## Method and controls

The test uses the same reproducible 192-letter full-field fixture as the preceding implementation review. It does not claim to reproduce the screenshot's seven-letter selection or the browser's current saved transforms. Seed 2041, descriptors, organic controls, extent normalization, camera projection and drawing scale are fixed across G4/O3/L1 and all three modes.

Full final generation, including reconstruction, runs for baseline, a twelve-letter perturbation, and removal of that same cluster in all nine cases. Six further final runs remove one extracted void in Voids and Combined modes. This is an extraction-boundary ablation, not deletion of physical empty space from the original letters. The removed void's incident relationships are also removed. Letters mode does not consume voids, so that ablation is inapplicable there.

The perturbation shifts source indices **66, 67, 68, 74, 75, 76, 114, 115, 116, 122, 123, 124** by **(+0.35, +0.15, +0.20) source units** and adds **30° to rz**. These are twelve neighboring interior letters across two elevations. The source's outer placement bounds remain unchanged, avoiding a global rescaling confound. The removal test deletes those twelve letters. The void ablation removes the largest extracted volume proxy, `void-component-0`.

See `MEASUREMENTS.md` for all nine numerical comparisons and extents; `inputs.json` for exact inputs; `results.json` for numerical evidence; and the per-case `*-trace.json` files for every primary and connector element.

## Pipeline and earliest information loss

1. `normalizedPlacements` (`amphitheaterPrototype.ts:152`) recenters the XY placement bounds, scales the longest plan dimension to 16 ft, and rebases minimum Z. Absolute source scale is therefore intentionally normalized. A different crop can change normalization globally.
2. `letterBoundaries` (`:403`) transforms letter meshes, constructs three elevation slices, forms convex outlines, and merges nearby slices. `letter-component-*` IDs do **not** retain the original member IDs. Exact cluster lineage is first lost here.
3. `extractInterLetterVoids` (`:178`) finds low-density candidates on a 9 × 9 XY grid and 4–12 Z slices using distances to sampled mesh vertices. `voidBoundaries` (`:441`) represents each accepted seed as a 24-point circular boundary. These are source-conditioned clearance proxies, **not extracted exact negative-space contours**.
4. `analyzeSourceGeometry` (`:449`) creates proximity/MST links and nearest solid–void relationships. Edges contain coordinates and kinds, not persistent source endpoint IDs.
5. `buildDomainOrganization` (`:726`) combines region points and graph endpoints into **one convex envelope**, reduces region distribution to an angular density statistic, and reduces edge directions to an arithmetic mean of angles. Opening outlines are another global convex hull, rescaled and relocated within the outer envelope. Individual void arrangement, multiple void identities and local adjacency topology are largely lost here.
6. The typology branch prescribes an inner room, one plate, or repeated atrium levels. Raw architecture has no explicit source cluster assignment.
7. Predetermined routes, organic deformation and `continuousSurface` reconstruction modify that organization. They do not restore provenance or local spatial relationships lost upstream.

The decisive source-to-architecture bottleneck is **the global-envelope reduction and prescribed organization in `buildDomainOrganization`, before connectors and SDF**. Caching is not the cause: the diagnostic calls generation directly with freshly analyzed changed inputs.

## B. Letters-mode assessment

| Source property | Actual influence | Assessment |
|---|---|---|
| Positions / overall XY extents | Convex envelope, centroid, directional density | Real, strongest at outer boundaries |
| Elevations | Min/max, weighted datum, elevation quantiles | Partial; minimum heights and two-level endpoint rules can suppress local elevation changes |
| Orientations | Transformed mesh outlines affect convex boundaries | Real but largely absorbed for interior letters |
| Adjacency / relative distances | Extractor merging, graph endpoints and mean edge angle | Does not route architecture through corresponding graph paths |
| Clustering | Nearby slices merge during extraction | No meaningful internal cluster is selected for the inner room or occupied zones |
| Architectural orientation | Envelope shape plus boundary entry index | No explicit dominant source-axis or local cluster frame assignment |

**FAIL for local organizational traceability; partial pass for envelope response.** A broad plate can legitimately retain its topology when an interior letter moves. The failure is the lack of a corresponding local architectural interpretation, not merely an unchanged plate count.

## C. Voids-mode assessment

Actual letter geometry affects clearance samples and therefore the detected negative-space proxy set. All detected proxies enter the envelope and opening aggregation. However, no particular source void is selected as the atrium or associated with an interstitial architectural zone.

The main opening is a scaled convex hull of all proxy circles, moved close to the domain center. Disconnected voids at different elevations can become one vertical opening without a source-derived vertical continuity test. Circulation follows a shrunken outer envelope rather than paths through the void graph.

**FAIL for actual void-to-architectural-condition correspondence.** Large changes in this mode show sensitivity to extraction and aggregate bounds, not proof that the response is proportional or spatially logical. Grid thresholds and seed ordering can change discontinuously.

## D. Combined-mode assessment

Letters dominate the occupied envelope; voids influence the global opening outline, focus offset, some statistics and mean relationship direction. This is one integrated model, not an overlap of two completed models. Nevertheless, the two systems are integrated mainly through summaries.

A single meaningful void can disappear from the analysis while the main architectural opening remains almost unchanged. Letters and Combined retain very similar outer occupied systems. **FAIL for balanced, traceable local contribution**, although both systems mathematically affect the result.

## E–G. Architectural element trace

IDs below use `<mode>` = `letters`, `voids`, or `combined`. Per-case trace JSON lists all actual IDs. Final reconstruction unions these elements, so final triangles do not retain element or source IDs.

| Element ID / type | Source elements and relationships actually used | Source voids | Operation | Main descriptor effects |
|---|---|---|---|---|
| `<mode>-primary-space-interstitial`, G4 floor | Aggregate envelope of applicable regions and graph endpoints | Aggregate contribution in Voids/Combined | CONTAIN / ENCLOSE support | Monumental, Sculptural, Surreal, Hierarchical; organic perimeter modulation |
| `<mode>-outer-containing-shell-*`, G4 outer enclosure | Three prescribed boundary spans starting relative to averaged entry direction; whole-field height statistic | No individual void correspondence | ENCLOSE | Visually Connected, Monumental, Sequential |
| `<mode>-outer-containing-canopy`, G4 canopy | Outer envelope and a scaled copy for its aperture | Aperture is **not** a selected source void | ENCLOSE | Luminous, Monumental |
| `<mode>-contained-room`, `contained-enclosure-*`, `contained-room-roof`, G4 inner room | Scaled copy of outer envelope, with aggregate focus offset; **no selected internal letter cluster** | Global offset only; interstitial space is residual geometry | CONTAIN | Hierarchical, Open Volume, Vertically Integrated; Centralized/Convergent affect offset |
| `<mode>-domain-route-room-approach`, G4 route | Outer entry to matching index of scaled room outline | No void-graph route | BRIDGE / approach | Sequential, Circulation Activated, Vertically Integrated |
| `<mode>-primary-space-deep-field`, O3 plate | Full envelope; depth from envelope; area-weighted region Z datum | One scaled aggregate opening, no void-specific cut | PLATE / DEPTH | Monumental, Sculptural, Hierarchical, Vertically Integrated; Luminous/Open Volume/Visually Connected change opening |
| `<mode>-domain-route-work-loop-*`, O3 circulation | Four prescribed perimeter connections at quarter-boundary indices | No specific void route | CONTINUITY | Circulation Activated, Vertically Integrated; organic deformation |
| `<mode>-primary-space-arrival`, `<mode>-void-overlook-*`, L1 levels | Same outer footprint repeated at two to four elevations; source Z statistics affect height/possible intermediate quantiles | Same aggregate aperture through all levels | VOID / VERTICALIZE | Open Volume, Luminous, Visually Connected, Hierarchical, Monumental, Vertically Integrated |
| `<mode>-domain-route-atrium-*`, L1 ascent | Sixteen prescribed perimeter segments per level transition | Path does not traverse a selected void-link chain | BRIDGE / vertical circulation | Sequential, Circulation Activated, Vertically Integrated |

### G4 verdict

The outer envelope derives from the broader field. The inner room **does not derive from a meaningful internal cluster**: `roomFactor` scales the outer outline. Interstitial space is the remainder between these prescribed shapes, not a chosen void network. Source-derived boundary shape is insufficient to pass the requested containment trace.

### O3 verdict

This is the strongest of the three for its main occupied geometry: the plate genuinely spans the aggregate source envelope and its boundary/depth respond to that field. It is not a fixed rectangle. But its central opening is a rescaled global hull; local source void removal does not remove a corresponding cut. The plate passes broad extent interpretation and fails opening/local traceability.

### L1 verdict

The opening shape has aggregate source influence, but its continuous vertical extension is prescribed. At two levels, the endpoints are explicitly `base` and `base + height`; intermediate source quantiles are never used. Local interior elevation changes can therefore have no effect on level elevations. There is no verified continuous source-void chain generating the atrium, and the ascent is a perimeter loop rather than source-graph routing. This fails the requested vertical-relationship trace.

## H. Source influence maps

Open **[SOURCE INFLUENCE MAP](SOURCE_INFLUENCE_MAP.html)**. Nine result sections show original source, extracted regions, relationships, voids, raw topology, baseline final geometry, perturbation, cluster removal and applicable void removal. Camera and scale are fixed.

Gold represents extracted letter regions, teal void proxies, and purple relationships. The map deliberately does **not** invent matching source-cluster → architectural-zone labels: that mapping is absent in the generator. Extractor IDs and architectural IDs are provided separately. Lack of a defensible local mapping is a validation finding.

## I–J. Perturbation and removal interpretation

See `MEASUREMENTS.md` for measured changes. All tests keep the typology's raw element family, floor count and principal-opening count unchanged. A stable topology alone is not failure, but here there is also no assignment that could remove or relocate an associated occupied zone when its source cluster disappears.

Removal can rotate the averaged entry direction and move shell spans or entry geometry globally. This is not evidence that architecture corresponding to the removed cluster disappeared. The simple arithmetic mean of edge angles also depends on directed edge conventions and angle wrap; it is not a robust spatial routing rule.

The diagnostic surface-bin difference is a **sensitivity metric**, not occupied-volume change or an architectural quality score. It compares sets of mesh-vertex cells at 0.5 ft resolution; threshold crossings and remeshing affect it. Raw matched-boundary displacements are reported alongside it to avoid mistaking tessellation change for spatial response.

## K–L. Extents and coverage

`MEASUREMENTS.md` includes source, raw and final XYZ extents for every baseline result. XY source extents in the generator's diagnostic include relevant graph endpoints; Z is its region span. They are normalized architectural feet, not the unnormalized solution box.

| Mode | Relevant extracted regions consumed | Relevant graph edges consumed | Detected voids consumed | Meaningful organizational coverage |
|---|---:|---:|---:|---|
| Letters | 192/192 = 100% | 191/191 = 100% | 0/32 = 0%, by mode design | **Not established** |
| Voids | 32/32 = 100% | 31/31 = 100% | 32/32 = 100% | **Not established** |
| Combined | 224/224 = 100% | 254/254 = 100% | 32/32 = 100% | **Not established** |

These are consumption percentages only. The requested meaningful-use percentages cannot honestly be calculated from current diagnostics. `domainStats` (`:872`) simply sets used = available; it does not measure individual causal effects, retain assignments, or test semantic contribution. Explicit source-member-to-architectural-zone provenance coverage is **0% recorded**, which does not mean zero geometric influence. “Meaningful voids” are not independently validated by the clearance extractor, so meaningful-void coverage remains unknown rather than 100%.

## M. Source-influence failures

1. Internal letter cluster membership is discarded during extraction.
2. Global hulls erase interior void distribution and source concavities.
3. G4's inner room is a scaled outer outline, not a cluster interpretation.
4. O3's opening is not associated with any selected void.
5. L1 lacks a real source-derived vertical void chain; two-level elevations are largely prescribed.
6. Circulation uses fixed perimeter patterns instead of meaningful paths in the source graph.
7. All-used counters overstate what has been demonstrated.
8. SDF reconstruction loses element provenance, preventing final-triangle tracing.

## N. Smallest adequate corrective changes — proposal only

Keep current typology branches, continuous-boundary builders, organic deformation, SDF, exports, cameras, interlocking and controls. Correct the organizer's input interpretation and assignments rather than redesigning those systems:

1. Preserve member placement IDs through letter grouping and endpoint IDs on relationships. Add explicit source-region/edge/void assignments to primary and circulation elements.
2. G4: select a meaningful interior cluster as the room footprint/location; retain the broad outer envelope, and derive interstitial openings from adjacent void groups.
3. O3: retain its broad plate envelope/datum; associate one or more openings with spatially meaningful source void groups, preserving their location and scale instead of rescaling a global void hull.
4. L1: identify a connected void chain with actual vertical overlap/proximity; derive its changing sectional outline, occupied levels and route anchors from that chain. Report an unsupported source when no adequate chain exists.
5. Route circulation between assigned occupied zones using source relationships; do not use averaged edge angle as the main substitute for topology.
6. Replace used=available coverage with explicit assignment counts and causal validation. Treat generic typology-required fallback elements as such.

Faithful negative-space boundaries would additionally require improving the current circular clearance proxies. Provenance alone cannot turn those circles into actual inter-letter void contours. That is a supporting extraction correction, not a camera, UI or reconstruction rewrite.

No fixes have been applied. **Approval is required before changing application code.**
