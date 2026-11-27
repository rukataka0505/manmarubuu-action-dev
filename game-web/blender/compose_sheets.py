from pathlib import Path
from PIL import Image, ImageDraw

root = Path(r"C:\Users\rukat\muse\manmarubuu-action\game-web\blender")

# 1. Manmarubuu 6-pose sheet
shots = [
    ("Idle", "Sleep"),
    ("Dash", "Ganbaru"),
    ("DoubleJump", "Happy"),
    ("HipDropSlam", "Ganbaru"),
    ("RollSpin", "Ganbaru"),
    ("VictoryDance", "Fever"),
]
tmp_anim = root / "_tmp_anim"
w, h = 480, 480
sheet = Image.new("RGB", (w * 3, h * 2), (245, 240, 230))
draw = ImageDraw.Draw(sheet)
for idx, (anim_name, expr) in enumerate(shots):
    p = tmp_anim / f"{anim_name}_{expr}.png"
    if p.exists():
        im = Image.open(p).convert("RGB")
        cx = (idx % 3) * w
        cy = (idx // 3) * h
        sheet.paste(im, (cx, cy))
        draw.rectangle([cx + 12, cy + 12, cx + 290, cy + 52], fill=(40, 34, 48))
        draw.text((cx + 22, cy + 22), f"{anim_name} ({expr})", fill=(255, 245, 210))
sheet.save(root / "anim_preview_sheet.png")

# 2. Boss front/back sheet
tmp_boss = root / "_tmp_boss"
bsheet = Image.new("RGB", (1280, 640), (240, 234, 220))
bdraw = ImageDraw.Draw(bsheet)
for i, (fname, label) in enumerate([("FRONT.png", "FRONT"), ("BACK.png", "BACK (Weak Windup Key)")]):
    p = tmp_boss / fname
    if p.exists():
        im = Image.open(p).convert("RGB")
        bsheet.paste(im, (i * 640, 0))
        bdraw.rectangle([i * 640 + 16, 16, i * 640 + 360, 58], fill=(35, 30, 42))
        bdraw.text((i * 640 + 28, 28), f"CLOCKWORK TOY KING - {label}", fill=(255, 240, 195))
bsheet.save(root / "boss_preview.png")
print("SHEETS_COMPOSED_OK")
