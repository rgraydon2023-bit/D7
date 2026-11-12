# Temporary presentation board

Open `/?board=7407x2160` (or append that parameter to any application route).
The board is a real 7407 x 2160 CSS-pixel element. The preview scales uniformly
and centers inside the browser; browser dimensions never become layout dimensions.
Navigation retains board mode. The Board mode / Exit board control switches
presentation in place, without remounting the page or invoking a solver.

For capture, append `&capture=1`. This renders the same board unscaled at the
origin, hides the editing toggle, and gives the document the full board extent.
Capture the complete board element or a 7407 x 2160 rectangle with browser
screenshot tooling. This is a capture view, not a monitor-size preview. Remove
`capture=1` to return to the scaled preview, or remove `board` for normal mode.
No physical monitor resolution change is required. Internal scrolling panels
retain their current scroll positions: arrange them before capture as desired.

Board styles are scoped in src/app/board.css. BoardMode supplies the frame and
presentation context. BoardCanvas measures untransformed logical dimensions
and uses device-pixel ratio 1 in board mode; original canvas options apply in
normal mode. BoardOrthographicCamera scales only existing fixed-zoom diagram
cameras to their board panels. Lattice's camera/framing implementation is unchanged.

The checkout had no Evaluations route. /evaluations exposes the existing Crops
criteria and evaluation grid through the same GridStore and evaluation engine.
It does not introduce another evaluation model or independent saved state.

All solver, importer, port, connector, source identity, and geometry algorithms
remain unchanged. Production builds require no new packages or deployment settings.
