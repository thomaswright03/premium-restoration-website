"""Makes the PDF fonts in fonts/pdf/ from the site's own web fonts.

The customer PDFs use the website's typefaces (Inter for text, Playfair
Display for the business name). jsPDF can only embed TrueType fonts at a
fixed weight, so this cuts fixed-weight .ttf copies from the variable .woff2
files the pages already use. The results are committed; this only needs
running again if the web fonts in fonts/ change.

    pip install fonttools brotli
    python3 scripts/make-pdf-fonts.py

Both typefaces are under the SIL Open Font License (fonts/OFL-*.txt), which
allows this.
"""

from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

FONTS = Path(__file__).resolve().parent.parent / "fonts"

OUTPUTS = [
    ("inter-latin.woff2", 400, "inter-regular.ttf"),
    ("inter-latin.woff2", 600, "inter-semibold.ttf"),
    ("playfair-display-latin.woff2", 700, "playfair-display-bold.ttf"),
]

for source, weight, target in OUTPUTS:
    font = instantiateVariableFont(TTFont(FONTS / source), {"wght": weight}, updateFontNames=True)
    font.flavor = None  # plain TrueType, which jsPDF reads
    (FONTS / "pdf").mkdir(exist_ok=True)
    font.save(FONTS / "pdf" / target)
    print("wrote fonts/pdf/" + target)
