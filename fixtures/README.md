# Fixtures

Files for manual testing: open `plate-nester.html`, add them, and check the preview and exports (see each issue or
CHANGELOG entry for what to expect). Red `#ff0000` = cut, blue `#0000ff` = score/engrave unless a file says otherwise.

| Folder | Contents |
|---|---|
| `geometry/` | Shape and transform handling: nested transforms, skew, arcs, hidden groups, gradient and text parts (kept as original markup), CAD-style separate `<line>` outlines (#46), stroke caps/joins/dashes (#14) |
| `css/` | `<style>` handling: CSS classes, ids that look like colours (#13), clashing class names between files (#12), element/universal selector leaks (#38), `currentColor` (#44) |
| `makeit/` | WeCreat MakeIT checks: `<style>` support (#38/#42; red = applied) and ids that look like colours (#13) |
| `security/` | `external-refs.svg`: links to outside files that must never be fetched (#10, #11) |
| `dxf/` | DXF import (#31): mm with layers/bulges/splines/ellipse, inches (R2000 POLYLINE), blocks (scale, rotation, mirror, arrays, nesting), R12 without units |
| `test-cuts/` | Pieces to cut: kerf compensation check (#36), in-plane finger joint pair, 3 mm box corner pair, 2.8–3.2 mm slot gauge |
