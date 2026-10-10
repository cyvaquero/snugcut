#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Guy Heckman. Licensed under the GNU Affero General Public License v3.0 or later (see LICENSE).
"""Generate the export QA workbooks in qa/ (one Word .docx per target app).

Each workbook holds the setup, the app's own notes and every test of the export compatibility suite, with a results
table and boxes to paste screenshots into. Testers fill one in and attach it to the app's QA issue. Edit the tests here,
not in the .docx files, and run the script again. The output is byte-for-byte the same on every run.

    python3 tools/qa_workbooks.py           # write qa/*.docx
    python3 tools/qa_workbooks.py --check   # fail if a workbook is out of date

Python 3, standard library only.
"""
import io, os, re, sys, zipfile
from xml.sax.saxutils import escape

VERSION = "1.4.0-beta"   # the release under test: the tag whose source zip testers download
REPO = "https://github.com/cyvaquero/snugcut"

APPS = [
    # slug, name, issue, where colors are compared, notes
    ("lightburn", "LightBurn", 49, "the Cuts/Layers list", [
        "Import SVG and DXF with **File → Import** (or drag the file onto the workspace).",
        "LightBurn assigns shapes to layers by color, using its fixed palette (00 black, 01 blue, 02 red, …). Colors "
        "outside the palette are mapped to the nearest layer. Record the **layer number and color** shown in the "
        "Cuts/Layers list for each shape.",
        "In **Settings → Import**, note whether \"Auto-group imported objects\" and the SVG DPI/unit options are at "
        "their defaults. If you change anything, write it down.",
        "For DXF files, record whether LightBurn keeps the DXF layer names or only maps by color.",
        "Measure with the **Width/Height** fields in the numeric edit toolbar (select a shape first).",
        "Kerf tests: make sure the layer's **Kerf Offset** is 0, so LightBurn doesn't offset the already compensated "
        "file again.",
    ]),
    ("bambu-suite", "Bambu Suite", 50, "the layer/process panel", [
        "Create or open a project for your machine (laser or cutting module), then import with the **Import** button "
        "or by dragging the file onto the canvas.",
        "Note how Bambu Suite maps colors: separate layers or processing settings per color, or one object. Record "
        "what each shape is assigned to.",
        "DXF import: if Bambu Suite can't open DXF files, mark the DXF export tests **N/A** and say so in the notes.",
        "Measure with the object's size fields in the properties panel.",
        "Kerf tests: make sure any kerf or offset compensation in Bambu Suite is off, so the already compensated file "
        "isn't offset again.",
    ]),
    ("xtool-studio", "xTool Studio", 51, "the layer/processing panel", [
        "Create a project for your machine, then import SVG and DXF with **Import** (or drag the file onto the canvas).",
        "Note how xTool Studio maps colors: separate layers or processing settings per color, or one object. Record "
        "what each shape is assigned to.",
        "For DXF files, record whether xTool Studio keeps the DXF layers or only maps by color.",
        "Measure with the object's W/H fields in the properties panel.",
        "Kerf tests: make sure xTool Studio's kerf offset is off, so the already compensated file isn't offset again.",
    ]),
    ("silhouette-studio", "Silhouette Studio", 52, "the Send panel's Line Color list", [
        "**SVG import needs Designer Edition or higher.** Basic Edition can't open SVG files. Note your edition and "
        "version.",
        "DXF files open in every edition, Basic included, so the DXF export tests (19–22) can be run on Basic.",
        "Open files with **File → Open**, or **File → Merge** to add them to the current design.",
        "Silhouette doesn't use layers by color by default. Check whether the colors survive (Line Style / Fill "
        "panels), and whether **Send → Action by: Line Color** shows separate entries for red, blue and black.",
        "Measure with the **Transform** panel or the dimension labels shown on the selected object.",
        "Silhouette Studio has a history of importing SVGs at the wrong scale. The scale tests (1 and 19) matter most "
        "here.",
        "Kerf tests: the Cameo's blade offset is handled by the machine, not by Silhouette Studio, so nothing needs "
        "turning off. A drag blade cuts almost no kerf: use the kerf tests to check that the sizes come through, not "
        "to tune a kerf value.",
    ]),
    ("creality-print", "Creality Print", 132, "the layer/processing panel", [
        "Use Creality Print's laser/cutting workspace for your machine (for example a Falcon laser or a laser module). "
        "Record the Creality Print version, the workspace or mode and the machine profile.",
        "Import SVG and DXF with the import button or by dragging the file onto the canvas.",
        "If your version can't import SVG or DXF at all, mark those tests **N/A** and say so in the notes.",
        "Note how Creality Print maps colors: separate layers or processing settings per color, or one object. Record "
        "what each shape is assigned to.",
        "Measure with the object's size fields in the properties panel.",
        "Kerf tests: make sure any kerf or offset compensation in Creality Print is off, so the already compensated "
        "file isn't offset again.",
    ]),
    ("cricut-design-space", "Cricut Design Space", 133, "the Layers panel", [
        "Upload with **Upload → Upload Image → Browse**, then select the uploaded image and **Add to Canvas**. Design "
        "Space takes both SVG and DXF.",
        "Design Space splits an upload into layers, usually by color. Record the layers it creates, their colors and "
        "the operation it assigns to each (Basic Cut, Pen, Score…).",
        "Measure with the **Size** W/H fields in the top toolbar (select the shape or group first). Read sizes in mm, "
        "or convert from inches.",
        "Design Space has a history of importing SVGs at the wrong scale. The scale tests (1 and 19) matter most here.",
        "The 300 × 300 mm plate outline (tests 1 and 19) is larger than the cut area of a 12 × 12 in mat. Check it on "
        "the canvas only; you don't have to cut it.",
        "Kerf tests: a Cricut blade cuts almost no kerf and Design Space has no kerf offset to turn off. Use the kerf "
        "tests to check that the sizes come through, not to tune a kerf value.",
    ]),
]

SHOT_CANVAS = "the imported plate on the canvas, with a shape selected so its size shows"
SHOT_LAYERS = "the layers or colors panel ({colors})"

# group heading, intro paragraph or None, tests: (number, title, issues, steps, expected, screenshots)
TESTS = [
    ("SVG export", None, [
        (1, "Scale", "", [
            "Tick **Plate outline in export**.",
            "Add `geometry/cad-lines.svg`, download the plate and import it.",
            "Untick **Plate outline in export** afterwards.",
        ], [
            "A red 300 × 300 mm square (the plate), and a red 38 × 28 mm rectangle with a blue 20 mm line inside.",
            "The rectangle is **one closed shape**, not four separate lines.",
        ], [SHOT_CANVAS, SHOT_LAYERS]),
        (2, "Line styles", "#14, #46", [
            "Add `geometry/stroke-styles.svg`, download the plate and import it.",
        ], [
            "A black rounded frame (59 × 39 mm), a red corner path, a green V, a purple chevron, and a **blue dashed** "
            "line.",
            "Note whether dashes, round caps and joins are shown or simply ignored. Ignored is acceptable for cutting; "
            "record it.",
        ], [SHOT_CANVAS, SHOT_LAYERS]),
        (3, "currentColor", "#44", [
            "Switch your OS to **dark mode** and reload SnugCut.",
            "Add `css/current-color.svg`, download the plate and import it.",
            "Switch back to light mode if you like.",
        ], [
            "A black rounded rectangle and a blue circle.",
        ], [SHOT_CANVAS, SHOT_LAYERS]),
        (4, "CSS support, direct (baseline)", "", [
            "Import `makeit/makeit-css-support.svg` **directly** into {app}, without SnugCut.",
            "Then import `makeit/makeit-css-universal.svg` directly.",
        ], [
            "Record which of squares 1, 2, 4, 5, 6, 7, 8 are red. The \"ref black\" square must stay black.",
            "Record whether the square in `makeit-css-universal.svg` is red.",
            "No result is \"wrong\" here: this shows what {app} does with raw `<style>`. Mark it **N/A** and write "
            "the red squares in the notes.",
        ], ["makeit-css-support.svg imported directly", "makeit-css-universal.svg imported directly"]),
        (5, "CSS support, via SnugCut", "#38, #42", [
            "Add `makeit/makeit-css-support.svg`, download the plate and import it.",
        ], [
            "Squares 1–8 are **all red**, and \"ref black\" is black.",
        ], [SHOT_CANVAS, SHOT_LAYERS]),
        (6, "Selector leak", "#38", [
            "Add `css/selector-leak-a.svg` and `css/selector-leak-b.svg` together, download the plate and import it.",
        ], [
            "A is a red rectangle with small text. B is a **black** rectangle with large text.",
        ], [SHOT_CANVAS, SHOT_LAYERS]),
        (7, "Ids that look like colors", "#13", [
            "Add `makeit/makeit-id-colors.svg`, download the plate and import it.",
        ], [
            "Squares 1, 2, 3 and \"ctrl red\" are red; \"ref black\" is black.",
        ], [SHOT_CANVAS, SHOT_LAYERS]),
        (8, "Class clash", "#12", [
            "Add `css/class-clash-a.svg` and `css/class-clash-b.svg` together, download the plate and import it.",
        ], [
            "A's rectangle is **red** with a blue \"A\". B's circle is blue with a blue outlined \"B\".",
        ], [SHOT_CANVAS, SHOT_LAYERS]),
        (9, "UI class names", "#63", [
            "Add `css/ui-class-names.svg`, download the plate and import it.",
        ], [
            "A red 99.8 × 49.8 mm outline, with a black circle and a black square inside.",
        ], [SHOT_CANVAS, SHOT_LAYERS]),
        (10, "Text and gradient fallback", "", [
            "Add `geometry/text.svg` and `geometry/gradient.svg` together, download the plate and import it.",
        ], [
            "The text \"Nest\" inside its frame.",
            "A rounded square with a red-to-blue gradient fill, or a solid fill if {app} doesn't do gradients. Record "
            "which.",
        ], [SHOT_CANVAS, SHOT_LAYERS]),
        (11, "Attributes on the root <svg>", "#64", [
            "Add `geometry/root-attrs-stroke.svg`, `geometry/root-attrs-stroke-only.svg` and "
            "`geometry/root-attrs-font-size.svg` together, download the plate and import it.",
        ], [
            "From `root-attrs-stroke`: a red 99.8 × 49.8 mm outline and a red 20 mm circle, **no filled areas**.",
            "From `root-attrs-stroke-only`: a red 99 × 49 mm outline.",
            "From `root-attrs-font-size`: a small red square and large blue \"Hello World\" text (about 197 mm wide), "
            "not overlapping the other parts.",
        ], [SHOT_CANVAS, SHOT_LAYERS]),
        (12, "viewBox aspect ratio", "#65", [
            "Add `geometry/viewbox-aspect-meet.svg`, `geometry/viewbox-aspect-none.svg` and "
            "`geometry/viewbox-aspect-slice.svg` together, download the plate and import it.",
        ], [
            "All red: a 50 mm circle (meet), a 100 × 50 mm ellipse (none) and a 100 mm circle (slice).",
            "The slice circle is whole: SnugCut doesn't crop to the viewBox.",
        ], [SHOT_CANVAS, SHOT_LAYERS]),
        (13, "Hidden shapes", "#17", [
            "Add `geometry/hidden-shapes.svg`. A notice says 7 hidden shapes were left out.",
            "Download the plate and import it.",
        ], [
            "Only a red 40 × 30 mm frame and a small blue 5 mm square inside it. Nothing else.",
        ], [SHOT_CANVAS, SHOT_LAYERS]),
    ]),
    ("Kerf compensation", None, [
        (14, "Kerf, SVG", "#36", [
            "Set **Kerf** to 0.2 mm and tick **Compensate kerf on objects**.",
            "Add `test-cuts/kerf-test.svg`.",
            "Download the plate and import it. The download says kerf compensation is built in, and that a hole is "
            "narrower than the kerf and was left as drawn: that's the pin hole.",
            "Leave kerf and compensation as they are for test 22.",
        ], [
            "A red 20.2 × 20.2 mm outline, a red 9.8 mm square hole and a red 5.8 mm round hole.",
            "Unchanged: the blue 14 mm score line, the black 4 × 2 mm filled mark and the tiny pin hole.",
        ], [SHOT_CANVAS, SHOT_LAYERS]),
    ]),
    ("DXF import, SVG export", "Set kerf back to 0.1 mm and untick **Compensate kerf on objects** for tests 15–21.", [
        (15, "mm DXF", "#31", [
            "Add `dxf/dxf-mm-bracket.dxf`. Two notices: 3 items on frozen, off, non-plotting or Defpoints layers were "
            "left out, and 1 text was skipped.",
            "Download the plate and import it.",
        ], [
            "An 80 × 50 mm bracket, every line, arc and hole present, in the DXF's colors.",
        ], [SHOT_CANVAS, SHOT_LAYERS]),
        (16, "Inch DXF", "#31", [
            "Add `dxf/dxf-inch-plate.dxf`, download the plate and import it.",
        ], [
            "A 101.6 × 92.0 mm (4 × 3.62 in) plate.",
        ], [SHOT_CANVAS, SHOT_LAYERS]),
        (17, "Blocks", "#31", [
            "Add `dxf/dxf-blocks.dxf`, download the plate and import it.",
        ], [
            "A 100 × 60 mm part with every block copy present (scaled, rotated, mirrored and arrayed copies).",
        ], [SHOT_CANVAS, SHOT_LAYERS]),
        (18, "No units", "#31, #90", [
            "Add `dxf/dxf-r12-unitless.dxf`. A notice says it doesn't say what units it's drawn in, so it was read as "
            "millimeters. The part's row in the parts list shows a **Drawn in** menu set to mm; leave it there.",
            "Download the plate and import it.",
        ], [
            "A 30 × 26 mm part.",
        ], [SHOT_CANVAS, SHOT_LAYERS]),
    ]),
    ("DXF export", "Set **Export format** to **DXF (R12, mm)**. The plate button now reads **Download DXF**.", [
        (19, "Scale, DXF", "#32", [
            "Tick **Plate outline in export**.",
            "Add `geometry/cad-lines.svg`, download the plate and import it.",
            "Untick **Plate outline in export** afterwards.",
        ], [
            "A 300 × 300 mm plate square, and a 38 × 28 mm rectangle (**one closed shape**) with a 20 mm line inside, "
            "in separate colors or layers.",
        ], [SHOT_CANVAS, SHOT_LAYERS]),
        (20, "Layers that share a color", "#66", [
            "Add `dxf/dxf-same-color-layers.dxf`, download the plate and import it.",
        ], [
            "A 60 × 40 mm part, with layers **CUT**, **SCORE** and **0** kept separate, even though they share one "
            "color.",
            "Lines are not joined across layers: the CUT line at y = 30 mm ends where a SCORE line starts, and the "
            "SCORE diagonal meets two corners of the CUT outline.",
        ], [SHOT_CANVAS, SHOT_LAYERS]),
        (21, "Layer names", "#32", [
            "Add `dxf/dxf-mm-bracket.dxf`, download the plate and import it.",
        ], [
            "An 80 × 50 mm bracket on layers **CUT**, **ENGRAVE** and **SCORE**.",
        ], [SHOT_CANVAS, SHOT_LAYERS]),
        (22, "Kerf, DXF", "#36, #32", [
            "Set **Kerf** to 0.2 mm and tick **Compensate kerf on objects** again.",
            "Add `test-cuts/kerf-test.svg`, download the plate and import it. The download says kerf compensation is "
            "built in, that filled areas are written as their outlines, and that a hole in `kerf-test.svg` is narrower "
            "than the kerf, so it was left as drawn (the pin hole).",
            "Afterwards set kerf back to 0.1 mm, untick compensation and set **Export format** back to SVG.",
        ], [
            "The same sizes as test 14: a 20.2 × 20.2 mm outline, a 9.8 mm square hole and a 5.8 mm round hole.",
            "The 4 × 2 mm mark comes through as an outline (DXF has no fills).",
        ], [SHOT_CANVAS, SHOT_LAYERS]),
    ]),
]

# ---- WordprocessingML -------------------------------------------------------------------------------------------------

W = 9360                                    # text width in twips (Letter, 1 in margins)
GRAY = "595959"                             # placeholder text, 7:1 on white


def runs(text, **kw):
    """Inline **bold** and `code` to runs."""
    out = []
    for i, part in enumerate(re.split(r"(\*\*[^*]+\*\*|`[^`]+`)", text)):
        if not part:
            continue
        rpr = ""
        if part.startswith("**"):
            part, rpr = part[2:-2], "<w:b/>"
        elif part.startswith("`"):
            part, rpr = part[1:-1], '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>'
        if kw.get("color"):
            rpr += f'<w:color w:val="{kw["color"]}"/>'
        if kw.get("bold") and "<w:b/>" not in rpr:
            rpr = "<w:b/>" + rpr
        out.append(f'<w:r>{"<w:rPr>" + rpr + "</w:rPr>" if rpr else ""}<w:t xml:space="preserve">{escape(part)}</w:t></w:r>')
    return "".join(out)


def para(text="", style=None, num=None, keep=False, raw=None, **kw):
    ppr = ""
    if style:
        ppr += f'<w:pStyle w:val="{style}"/>'
    if keep:
        ppr += "<w:keepNext/>"
    if num:
        ppr += f'<w:numPr><w:ilvl w:val="0"/><w:numId w:val="{num}"/></w:numPr>'
    return f'<w:p>{"<w:pPr>" + ppr + "</w:pPr>" if ppr else ""}{raw if raw is not None else runs(text, **kw)}</w:p>'


class Doc:
    def __init__(self):
        self.body, self.rels, self.nums = [], [], []

    def link(self, url, text):
        rid = f"rId{len(self.rels) + 10}"
        self.rels.append(f'<Relationship Id="{rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/'
                         f'relationships/hyperlink" Target="{escape(url)}" TargetMode="External"/>')
        return (f'<w:hyperlink r:id="{rid}"><w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr>'
                f'<w:t xml:space="preserve">{escape(text)}</w:t></w:r></w:hyperlink>')

    def p(self, *a, **kw):
        self.body.append(para(*a, **kw))

    def bullets(self, items):
        for t in items:
            self.p(t, style="ListParagraph", num=1)

    def steps(self, items):
        self.nums.append(len(self.nums) + 2)  # a numbering instance per list, so each restarts at 1
        for t in items:
            self.p(style="ListParagraph", num=self.nums[-1], raw=t[1]) if isinstance(t, tuple) else \
                self.p(t, style="ListParagraph", num=self.nums[-1])

    def table(self, rows, widths, header=False, height=None, borders=True):
        grid = "".join(f'<w:gridCol w:w="{w}"/>' for w in widths)
        b = "".join(f'<w:{s} w:val="single" w:sz="8" w:space="0" w:color="808080"/>'
                    for s in ("top", "left", "bottom", "right", "insideH", "insideV"))
        out = [f'<w:tbl><w:tblPr><w:tblW w:w="{sum(widths)}" w:type="dxa"/>'
               f'{"<w:tblBorders>" + b + "</w:tblBorders>" if borders else ""}<w:tblLayout w:type="fixed"/>'
               f'<w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/>'
               f'<w:bottom w:w="60" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar>'
               f'<w:tblLook w:val="0000" w:firstRow="{1 if header else 0}" w:lastRow="0" w:firstColumn="0" '
               f'w:lastColumn="0" w:noHBand="1" w:noVBand="1"/></w:tblPr><w:tblGrid>{grid}</w:tblGrid>']
        for i, row in enumerate(rows):
            trpr = "<w:cantSplit/>"
            if header and i == 0:
                trpr += "<w:tblHeader/>"
            if height:
                trpr += f'<w:trHeight w:val="{height}" w:hRule="atLeast"/>'
            out.append(f"<w:tr><w:trPr>{trpr}</w:trPr>")
            for w, cell in zip(widths, row):
                shade = '<w:shd w:val="clear" w:color="auto" w:fill="E7EBF0"/>' if header and i == 0 else ""
                content = cell if cell.startswith("<w:p>") or cell.startswith("<w:p ") else para(cell, bold=header and i == 0)
                out.append(f'<w:tc><w:tcPr><w:tcW w:w="{w}" w:type="dxa"/>{shade}</w:tcPr>{content}</w:tc>')
            out.append("</w:tr>")
        out.append("</w:tbl>")
        self.body.append("".join(out))
        self.p()

    def shot(self, label):
        self.table([[para(f"Paste screenshot here: {label}", color=GRAY)]], [W], height=4320)

    def package(self, title):
        body = "".join(self.body)
        sect = ('<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" '
                'w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>')
        document = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document {NS}><w:body>{body}{sect}'
                    f'</w:body></w:document>')
        rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.'
                'openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.'
                'openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship '
                'Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" '
                f'Target="numbering.xml"/>{"".join(self.rels)}</Relationships>')
        nums = "".join(f'<w:num w:numId="{n}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0">'
                       f'<w:startOverride w:val="1"/></w:lvlOverride></w:num>' for n in self.nums)
        numbering = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:numbering {NS}>'
                     + ABSTRACT.format(0, "bullet", "•") + ABSTRACT.format(1, "decimal", "%1.")
                     + f'<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>{nums}</w:numbering>')
        core = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.'
                'openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" '
                'xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
                f'<dc:title>{escape(title)}</dc:title><dc:creator>SnugCut</dc:creator><dc:language>en-US</dc:language>'
                '</cp:coreProperties>')
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            for name, data in (("[Content_Types].xml", CONTENT_TYPES), ("_rels/.rels", PKG_RELS),
                               ("docProps/core.xml", core), ("word/document.xml", document),
                               ("word/_rels/document.xml.rels", rels), ("word/styles.xml", STYLES),
                               ("word/numbering.xml", numbering)):
                info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))   # fixed date: same bytes on every run
                info.compress_type = zipfile.ZIP_DEFLATED
                z.writestr(info, data)
        return buf.getvalue()


NS = ('xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"')
ABSTRACT = ('<w:abstractNum w:abstractNumId="{0}"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0">'
            '<w:start w:val="1"/><w:numFmt w:val="{1}"/><w:lvlText w:val="{2}"/><w:lvlJc w:val="left"/>'
            '<w:pPr><w:ind w:left="360" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>')
CONTENT_TYPES = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/'
    '2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+'
    'xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" '
    'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override '
    'PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+'
    'xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.'
    'wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.'
    'openxmlformats-package.core-properties+xml"/></Types>')
PKG_RELS = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/'
    'package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/'
    'relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.'
    'openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
    '</Relationships>')


def style(sid, name, ppr="", rpr="", kind="paragraph", extra=""):
    return (f'<w:style w:type="{kind}" w:styleId="{sid}"><w:name w:val="{name}"/>{extra}'
            f'{"<w:pPr>" + ppr + "</w:pPr>" if ppr else ""}{"<w:rPr>" + rpr + "</w:rPr>" if rpr else ""}</w:style>')


HEAD = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:color w:val="1F3864"/>'
STYLES = (
    f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:styles {NS}><w:docDefaults><w:rPrDefault><w:rPr>'
    '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/>'
    '<w:szCs w:val="22"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr>'
    '<w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'
    + style("Normal", "Normal", extra='<w:qFormat/>')
    + style("Title", "Title", '<w:spacing w:after="240"/>', HEAD + '<w:sz w:val="40"/>', extra='<w:basedOn w:val="Normal"/><w:qFormat/>')
    + style("Heading1", "heading 1", '<w:keepNext/><w:spacing w:before="360" w:after="120"/><w:outlineLvl w:val="0"/>',
            HEAD + '<w:sz w:val="32"/>', extra='<w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>')
    + style("Heading2", "heading 2", '<w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="1"/>',
            HEAD + '<w:sz w:val="26"/>', extra='<w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>')
    + style("Heading3", "heading 3", '<w:keepNext/><w:spacing w:before="160" w:after="60"/><w:outlineLvl w:val="2"/>',
            HEAD + '<w:sz w:val="22"/>', extra='<w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>')
    + style("ListParagraph", "List Paragraph", '<w:spacing w:after="60"/><w:ind w:left="360"/>',
            extra='<w:basedOn w:val="Normal"/><w:qFormat/>')
    + style("Hyperlink", "Hyperlink", rpr='<w:color w:val="0B5394"/><w:u w:val="single"/>', kind="character")
    + '</w:styles>')


def workbook(app, issue, colors, notes):
    sub = lambda t: t.replace("{app}", app).replace("{colors}", colors)
    issue_url = f"{REPO}/issues/{issue}"
    zip_url = f"{REPO}/archive/refs/tags/{VERSION}.zip"
    d = Doc()
    d.p(f"SnugCut export QA: {app}", style="Title")
    d.p(raw=runs(f"Release under test: **SnugCut {VERSION}**. Results go to ") + d.link(issue_url, f"issue #{issue}")
        + runs(". If that issue names a newer version, download the workbook linked there instead."))
    d.p(f"Goal: confirm that plates exported by SnugCut import into {app} at the right size, with the right colors "
        "(and so the right layers or operations), and with nothing dropped.")

    d.p("How to use this workbook", style="Heading1")
    d.steps([
        "Fill in the tester details below.",
        "Do the setup once, then run the tests in order. Each test lists its steps, what to expect, a results table "
        "and boxes for screenshots.",
        "Mark each result by replacing ☐ with ☒ next to Pass, Fail or N/A, and write what you measured.",
        "Paste a screenshot into each box: click in the box and paste (Ctrl+V or ⌘V). The box grows to fit.",
        "Fill in the results summary at the end.",
        f"Save the file and attach it to a comment on issue #{issue}: drag the .docx into the comment box. If it is "
        "too big to attach (GitHub allows 25 MB), save it as PDF and attach that, or paste the screenshots straight "
        "into the comment under each test number.",
        "Say in the comment which tests failed. Each failure becomes its own bug issue.",
    ])
    d.p("The workbook opens in Microsoft Word, Google Docs, Apple Pages and LibreOffice.")

    d.p("Tester details", style="Heading1")
    d.table([["Item", "Your answer"]] + [[k, ""] for k in (
        "Name or GitHub user name", "Date tested", f"{app} version", "Edition (if it has one)",
        "Operating system and version", "Machine model", "Import settings you changed from the defaults")],
        [3400, W - 3400], header=True)

    d.p("Setup", style="Heading1")
    d.steps([
        ("raw", runs("Download the release source, ") + d.link(zip_url, zip_url) + runs(", and unzip it. It holds "
                "`snugcut.html` and the `fixtures/` folder used below.")),
        f"Open `snugcut.html` in a browser (double-click is fine). **The footer must show v{VERSION}.**",
        "In SnugCut, set **Rotation: None** so the labels stay readable. Keep the other defaults: True shape mode, "
        "300 × 300 mm plate, mm units, kerf 0.1 mm, **Compensate kerf on objects** off, **Export format: SVG**.",
        "For every test, click **Remove all** first, add only the files listed and wait until the plates are no longer "
        f"dimmed. Then click **Download SVG** (or **Download DXF**) on the plate and import that file into {app}.",
    ])
    d.bullets([
        f"\"Direct\" tests import the fixture itself, without SnugCut. They show what {app} supports on its own.",
        "A notice may appear after adding a file (hidden shapes, skipped text, missing units). The tests say which ones "
        "to expect.",
    ])
    d.p(f"Files are in subfolders of `fixtures/` (see `fixtures/README.md`). \"Red\" means `#ff0000` and \"blue\" "
        f"means `#0000ff`. Compare colors in {colors}, not only on the canvas.")

    d.p(f"{app} notes", style="Heading1")
    d.bullets(notes)

    for group, intro, tests in TESTS:
        d.p(group, style="Heading1")
        if intro:
            d.p(intro)
        for n, title, refs, steps, expect, shots in tests:
            d.p(f"Test {n}: {title}" + (f" ({refs})" if refs else ""), style="Heading2")
            d.p("Steps", style="Heading3")
            d.steps([sub(s) for s in steps])
            d.p("Expected", style="Heading3")
            d.bullets([sub(e) for e in expect])
            d.p("Result", style="Heading3")
            d.table([["Item", "Result"], ["Outcome", "☐ Pass    ☐ Fail    ☐ N/A"], ["Sizes measured", ""],
                     ["Colors, layers or operations", ""], ["Notes (what differed)", ""]], [3000, W - 3000], header=True)
            d.p("Screenshots", style="Heading3")
            for s in shots:
                d.shot(sub(s))

    d.p("Results summary", style="Heading1")
    d.p("Copy the outcome of each test here. You can also paste this table into your comment on the issue.")
    rows = [["#", "Test", "Pass / Fail / N/A", "Notes"]]
    for _, _, tests in TESTS:
        rows += [[str(n), title, "", ""] for n, title, *_ in tests]
    d.table(rows, [600, 3600, 1800, W - 6000], header=True)
    return d.package(f"SnugCut export QA: {app}")


def contents(data):
    # a workbook's parts, unzipped: compared instead of the zip's bytes, which differ between zlib builds (zlib-ng
    # deflates the same input differently), so --check and a rebuild don't flag or rewrite unchanged workbooks (#291)
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            return [(i.filename, z.read(i)) for i in z.infolist()]
    except (zipfile.BadZipFile, TypeError):
        return None


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    check = "--check" in sys.argv[1:]
    stale = []
    os.makedirs(os.path.join(root, "qa"), exist_ok=True)
    for slug, *rest in APPS:
        path = os.path.join(root, "qa", slug + ".docx")
        data = workbook(*rest)
        old = open(path, "rb").read() if os.path.exists(path) else None
        same = old is not None and contents(old) == contents(data)
        if check:
            if not same:
                stale.append(path)
        elif not same:
            open(path, "wb").write(data)
            print("wrote", os.path.relpath(path, root))
    if check:
        if stale:
            sys.exit("out of date (run python3 tools/qa_workbooks.py): " + ", ".join(os.path.relpath(p, root) for p in stale))
        print("qa workbooks are up to date")


if __name__ == "__main__":
    main()
