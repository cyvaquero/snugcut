# Fixtures

Files for manual testing: open `snugcut.html`, add them, and check the preview and exports (see each issue or
CHANGELOG entry for what to expect). Red `#ff0000` = cut, blue `#0000ff` = score/engrave unless a file says otherwise.

| Folder | Contents |
|---|---|
| `geometry/` | Shape and transform handling: nested transforms, skew, arcs, hidden groups, gradient and text parts (kept as original markup), CAD-style separate `<line>` outlines (#46), stroke caps/joins/dashes (#14), shapes hidden by visibility, opacity 0 or no paint (#17), fill/stroke/font-size set on the root `<svg>` (#64), a viewBox with another aspect ratio than width/height under `preserveAspectRatio` meet (default), none and slice (#65) |
| `css/` | `<style>` handling: CSS classes, ids that look like colors (#13), clashing class names between files (#12), element/universal selector leaks (#38), `currentColor` (#44), class names that match the app's own UI classes (#63) |
| `makeit/` | WeCreat MakeIT checks: `<style>` support (#38/#42; red = applied) and ids that look like colors (#13) |
| `security/` | `external-refs.svg`: links to outside files that must never be fetched (#10, #11); `dollar-id.svg`: ids with `$` sequences that must export well-formed (#76); `data-svg-image.svg`: `data:` SVG images removed, PNG kept (#78) |
| `dxf/` | DXF import (#31): mm with layers/bulges/splines/ellipse, inches (R2000 POLYLINE), blocks (scale, rotation, mirror, arrays, nesting), R12 without units; DXF export: layers CUT and SCORE with the same color plus layer 0 stay separate layers, layer 0 listed once (#66) |
| `test-cuts/` | Pieces to cut: kerf compensation check (#36), in-plane finger joint pair, 3 mm box corner pair, 2.8–3.2 mm slot gauge |
