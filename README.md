# VUL Letter Grid

Next.js app with an interactive grid of randomly placed **V**, **S**, and **L** letters.

## Features

- Random letter at every grid node
- Random rotation per letter
- Adjustable grid spacing (shrink to overlap)
- Adjustable columns, rows, and letter size
- Optional 3D letter volume with 2–8 independently generated Z layers and adjustable spacing between layers
- Adjustable extrusion thickness for built-in letters in the 3D volume
- Optional per-letter Y-axis rotation with an adjustable random angle range
- Boolean-fused export as one closed OBJ mesh, or one closed Rhino `.3dm` polysurface when all letters touch

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

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).
