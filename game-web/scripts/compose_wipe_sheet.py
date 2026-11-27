from pathlib import Path
from PIL import Image, ImageDraw

WIPE_DIR = Path(r"C:\Users\rukat\muse\manmarubuu-action\game-web\qa-shots\_wipe_8")
OUT_IMG = Path(r"C:\Users\rukat\muse\manmarubuu-action\game-web\qa-shots\10_expressions_8pack_wipe.png")
EXPRS = ["Sleep", "Happy", "Damage", "Pien", "Ganbaru", "Panic", "Pout", "Fever"]

w, h = 204, 204
sheet = Image.new("RGB", (w * 4, h * 2), (255, 248, 235))
draw = ImageDraw.Draw(sheet)

for idx, name in enumerate(EXPRS):
    p = WIPE_DIR / f"{name}.png"
    if not p.exists():
        continue
    im = Image.open(p).convert("RGB")
    col = idx % 4
    row = idx // 4
    sheet.paste(im, (col * w, row * h))
    draw.rectangle([col * w + 6, row * h + 6, col * w + 106, row * h + 28], fill=(55, 32, 22))
    draw.text((col * w + 12, row * h + 11), name, fill=(255, 245, 215))

sheet.save(OUT_IMG)
print(f"Saved 8-expression wipe sheet: {OUT_IMG}")
