# VUL Letter Grid

Next.js app with an interactive grid of randomly placed **V**, **U**, and **L** letters.

## Features

- Random letter at every grid node
- Random rotation per letter
- Adjustable grid spacing (shrink to overlap)
- Adjustable columns, rows, and letter size
- Optional 3D letter volume with 2–8 independently generated Z layers and adjustable spacing between layers
- Adjustable extrusion thickness for built-in letters in the 3D volume
- Optional per-letter Y-axis rotation with an adjustable random angle range
- Boolean-fused export as one closed OBJ mesh, or one closed Rhino `.3dm` polysurface when all letters touch
- Live non-destructive section plane with X/Y/Z translation and rotation controls
- A separate automatically centered section viewport with highlighted cut surfaces and boundaries
- Independent orbit, zoom, pan, and camera reset controls for the model and section

Enable **3D layers**, adjust the grid, Z spacing, thickness, and rotations, choose
**Closed mesh (OBJ)** or **Closed polysurface (3DM)**, then click **Export fused volume**.
The app saves one object in the project's `exports` folder and shows its full path.
Letters that overlap are Boolean-unioned. The OBJ can contain multiple disconnected
closed shells within that one mesh object. A solid Rhino polysurface requires all
letter shells to touch; adjust Gap, Z gap, Size, and Thickness until they do.
For **Letters**, the cyan bounding box is a preview guide and is not exported.

Choose **Void inside box** to preview the negative space bounded by the cyan box.
Exporting this mode creates one closed OBJ object by subtracting the complete letter
volume from that box; the box becomes the outer boundary and the letter faces become
the interior cavity surfaces.
- Upload custom **images** or **3D models** (`.glb`, `.gltf`, `.obj`) per letter
- Interactive 3D view (orbit / zoom) when any 3D model is uploaded
- Shuffle letters / random rotate / regenerate controls

## Parametric spatial optimizer

Open `/composition` to generate seeded alternatives inside a locked X/Y/Z orthogonal
grid. The optimizer provides separate target and importance controls for 12 spatial
descriptors, Letter Space, Void Space, Combined, and common-basis Auto-Select modes,
hard geometric constraints, comparison views, presets, saved configurations, history,
and JSON/CSV/OBJ export. Use **Apply selected to Slide** to make an optimized result
the active Slide geometry for letter or bounded-void export.

Enable **Selection volume** to search for the best fixed-size subsection inside the
overall solution. Set the selection X/Y/Z dimensions and search steps, then generate.
The comparison views show the full composition as faded context and outline the chosen
subsection. The final pass evaluates every aligned position when the search contains at
most 1,200 positions. The selected subsection is recentered for Slide letter or bounded
void export, while its original overall coordinates remain in the analysis JSON.

Letter and void measurements are reported separately with raw and normalized values.
Visibility, circulation connectivity, unobstructed volume, and sky exposure use a
coarse voxel model. Luminous is explicitly reported as a geometric daylight proxy.
Surreal uses editable manual assessments. These proxies support design comparison;
they are not code, accessibility, or daylight-performance simulations.

## Stepped Amphitheater prototype

The **Prototype Demonstration** panel at the bottom of `/composition` converts the
current source arrangement into a proto-architectural Stepped Amphitheater. It uses a
20′ × 20′ horizontal registration lattice with 20′ vertical registration increments.

1. Choose **Letters**, **Voids**, or **Letters + Voids**.
2. Set the existing descriptor targets. Convergent, Sequential, Visually Connected,
   Circulation Activated, Vertically Integrated, Open Volume, and Sculptural have
   direct geometric effects on the amphitheater.
3. Click **Generate Architectural Space**.
4. Use the nine numbered stages to inspect the source solids, bounded inter-letter
   void field, source-to-architecture transformation, interlocking tile, aggregations,
   comparison, and evaluation record.
5. Switch between isometric, plan, and section views. **White model** hides the
   analytical colors and **Grid hidden** removes the registration overlay. Use the
   Slide page for the existing adjustable cut plane and separate live section result.
6. At the Aggregations stage, select 2, 4, or 8 tiles and review the computed connector,
   circulation, void-alignment, and cross-tile intersection checks.
7. Enter criteria from the existing Assignment 1 Part 3 matrix, choose a preferred
   variation, and record the selection rationale.
8. Export selected or aggregated OBJ geometry, the active view PNG, an 11 × 22
   comparison PNG, or the complete parameter and evaluation JSON record.

Architectural OBJ coordinates are written in feet with Z as the vertical axis. Import
them into a Rhino 8 document whose model units are **Feet**. The generator samples
vertices from the transformed V/U/L meshes, reconstructs bounded low-density regions
between those meshes, and uses the resulting directional field to deform continuous
polygonal terrace, stage, ramp, shell, and connector meshes. Individual letter
openings and space outside the arrangement are not substituted as source voids.
The displayed, measured, aggregated, and exported geometry comes from the same mesh
definition.

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).
