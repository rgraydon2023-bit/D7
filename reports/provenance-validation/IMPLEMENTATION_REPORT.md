# Source-to-architecture provenance correction

## Result and scope

Implemented the approved provenance and organizer-input correction for G4, O3 and L1. The typology constructors, continuous reconstruction, organic deformation, camera tools, OBJ format, Rhino units, interlocking and aggregation systems remain in place. No expansion to the other twelve typologies was made.

The controlled fixture now supports explicit source-to-feature tracing and targeted geometric response. This is not a claim of construction readiness, accessible circulation, or exhaustive validation of every saved source.

Checkpoint: `../../checkpoints/2026-09-28-before-provenance/`. Original source copies use `.checkpoint.txt` to prevent compilation of backups.

## 1. Functions and sections changed

- `src/components/amphitheaterPrototype.ts`: new `placementIdentity` and `lineageKey`; provenance types on architectural elements; identity added in `letterBoundaries`, `extractInterLetterVoids`, `voidBoundaries`, `connectCenters`, and `analyzeSourceGeometry`.
- `buildDomainOrganization`: local source assignments, source-group outlines, cluster ranking, shortest-path circulation, assigned courtyards, vertical-chain selection and sectional boundaries. Existing three typology branches are retained.
- `domainStats`: actual distinct assigned-ID counts replace automatic used=available counts.
- `generateProtoArchitecture`: source graph included in returned records; preserved tile geometry explicitly marked fallback; unsupported L1 source reported without a generic atrium.
- `PrototypeDemonstration.tsx`: existing diagnostic text now distinguishes local assignments, envelope influence and fallback elements. Unsupported-source message is visible. Empty unsupported geometry cannot be exported as OBJ. No UI layout redesign.

## 2. Source identity

Placement identity combines original cell ID, source index and layer index. Slice records retain that identity; merged letter regions retain the union of member IDs. Region IDs are deterministic hashes of sorted members, so deleting unrelated array entries does not renumber surviving regions.

Void IDs use their normalized sampling-grid coordinates, rather than clearance-sort position. Each proxy retains nearby bounding-member IDs. Graph edges retain stable endpoint region IDs and an edge ID. Additional local vertical void links are created only for the three scoped organizers, when elevation and plan-proximity thresholds support them.

Void identity is persistent within a fixed normalized sampling domain. Changing the full source extent or sampling resolution can change what a grid ID represents; this is not a cross-document geometric tracking system. Clearance proxies remain approximate, and nearby member IDs are support candidates rather than exact Boolean boundary ownership.

## 3. Assignment storage

Every generated element in the three scoped results has a `provenance` record containing:

- architectural element ID and source mode;
- source letter/member IDs, region IDs, void IDs and relationship IDs;
- typology operation and descriptor influences;
- assignment role: `local`, `envelope`, or `fallback`;
- an explanation; envelope-region IDs where a locally assigned opening shares a broader occupied surface.

`sourceGraph` supplies the complete region and edge records needed to resolve those IDs. Existing Parameters + evaluation JSON includes the variation and its assignments. OBJ geometry and its units are unchanged; OBJ triangles do not carry this JSON provenance.

## 4–5. G4 room and interstitial space

The outer source envelope is retained. The inner room is no longer a scaled copy of it. Candidate neighborhoods are ranked by interior position/enclosure potential, source adjacency, local coherence, footprint scale and—in Voids/Combined—nearby void relationships.

Letters and Combined select letter neighborhoods for the occupied room. Voids selects a local negative-space neighborhood. The selected neighborhood supplies the actual footprint and position. Walls and roof retain the same source assignment as the room.

Adjacent void groups outside the room establish recorded interstitial openings. Letters prioritizes one neighboring opening; Combined and Voids can retain two. The main outer floor/enclosure remains an envelope interpretation and is excluded from local-use coverage. Moving/removing a room's assigned cluster may move/deform the room or cause a different cluster to win ranking; both cases are recorded as reorganization, not asserted to be rigid translation.

## 6. O3 opening assignments

The broad plate envelope and weighted datum are preserved. Each courtyard uses a named local void group at its source XY location, with a modest descriptor-controlled boundary margin. There is no anonymous global opening hull. One courtyard is prioritized in Letters, up to three in Voids/Combined. Removing an assigned group removes/replaces or reorganizes that corresponding courtyard.

The source field still does not need to become 192 separate occupied pieces. The plate is intentionally continuous and broad; opening provenance is local while its outer boundary is whole-field influence.

## 7. L1 vertical-chain assignments

L1 selects a connected ascending chain of extracted voids using elevation separation, plan proximity and recorded graph edges. Each level uses its assigned chain section and local neighboring voids. The section outline can change between elevations. Letters additionally derives occupied level outlines from nearby letter regions; Combined retains the broad letter envelope with locally void-derived sections; Voids works inside its negative-space-derived envelope.

Level elevations preserve relative chain elevations. A minimum architectural vertical span of 8.5 ft remains an explicit typology scaling rule; it does not create source connectivity. A chain must have at least two members and 2.5 ft of source-derived normalized vertical span. If no adequate chain exists, the result is empty with **UNSUPPORTED SOURCE FOR VERTICAL VOID LOBBY**.

Stress testing exposed disconnected Voids-mode results when grouped openings reached the outer occupied boundary. The corrected grouping retains a continuous rim by excluding distant neighboring proxies from that section, and circulation endpoints are placed on the rim. The omitted proxies are not counted as assigned to that section.

## 8. Source-graph circulation

G4 and O3 use shortest paths over recorded source edges to connect approach regions to the assigned room or courtyards. O3 approaches opening boundaries rather than targeting their centers. L1 routes between assigned chain-section anchors; its edge assignments retain the actual vertical chain relationships.

Fixed quarter-boundary circulation loops and averaged edge angles no longer organize these routes. A missing G4 approach path can produce a clearly labeled fallback approach. Preserved tile interface arms/connectors are also labeled fallback rather than falsely attributed to source regions.

Routes are still geometric candidates. Recorded source edges and a connected mesh do not certify walking slopes, headroom, width compliance, or collision-free circulation through all enclosing surfaces.

## 9–10. Controlled validation

All comparisons use the same deterministic 192-letter full-field fixture, seed 2041, descriptor settings, organic controls, normalization and camera. This is the prior validation fixture, not a claimed capture of the screenshot's seven-letter selection.

For each typology and mode:

1. Baseline final reconstruction.
2. Previous twelve-letter translation/rotation test.
3. Previous twelve-letter removal test.
4. Targeted movement of the actual assigned feature.
5. Removal of that assigned feature.

G4 Letters/Combined targeted tests modify original member placements. G4 Voids, O3 and L1 targeted tests operate at the extracted-void boundary and update/remove incident edges. The separate original-letter perturbation/removal tests still rerun extraction. These two intervention levels are distinguished in the records.

The final matrix contains 45 reconstructed results. See `MEASUREMENTS.md` for all component counts, assignments and geometry-response checks. `causal-checks.json` separately verifies all 18 targeted movement/removal responses using geometry with **IDs and provenance removed**, so renaming a source or element cannot cause a false pass.

The unconnected-chain guard passes in all three modes. Source member/endpoint integrity checks pass. Open Volume changes actual geometry in all nine cases. Representative legacy Stepped Amphitheater, Void-Field Gathering and Open Hall Workspace preview meshes match the checkpoint exactly. TypeScript no-emit validation passes.

## 11. Coverage interpretation

Coverage is now **assignment coverage**, not an automatic declaration of meaningful use. Denominators are the available full extracted graph: 192 original members, 224 regions (192 letter regions plus 32 void proxies), and 333 edges in this fixture. The increased edge count includes explicit neighboring vertical-void links.

Local coverage counts distinct IDs attached to local architectural features or routes. Envelope-only assignments are recorded but excluded. Void-support members count as supporting original letters; they are not necessarily occupied letter geometry. No claim is made that every recorded support member has individually passed a causal ablation.

Per-mode counts and percentages are in `MEASUREMENTS.md`. These are deliberately below 100%. The model can use the full domain to locate architecture without assigning every source region to a local occupied object.

## 12. Remaining fallback logic and limitations

- Four preserved tile-interface elements are generic/fallback in the tested baselines. A source-path failure can also produce a labeled G4 fallback approach.
- Outer shells, canopy span pattern, slab thicknesses, local boundary margins and minimum architectural heights remain typology construction rules. Their overall envelope influence is not counted as local source coverage.
- Void extraction remains sampled clearance geometry. It is not exact inter-letter negative-space reconstruction; grouped outlines still use local convex synthesis.
- Cluster/chain selection is discrete. Source changes can cause a different candidate to win. The report distinguishes this from proportional deformation of the same feature.
- Final mesh triangles do not retain individual source labels after union; provenance is retained on the input architectural elements and graph records exported alongside the model.
- Geometric connectivity, traceability and architectural usability remain separate. These tests establish the first two for the controlled cases, not full architectural or code-compliance approval.

## Review artifacts

- **[Source Influence Map](SOURCE_INFLUENCE_MAP.html)**: all nine baseline cases, matching highlighted source/target assignments, targeted before/after geometry and full JSON traces.
- **[Measurements](MEASUREMENTS.md)**: coverage, final component counts and target-response results.
- `results.json`: final reconstruction test records.
- `causal-checks.json`: geometry-only targeted checks.
- `integrity.json`: lineage, descriptor, unsupported-chain and legacy preservation checks.

The remaining twelve typologies have not been expanded. No production build was run into the live development server's `.next` directory.
