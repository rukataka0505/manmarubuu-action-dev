from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(r"C:\Users\rukat\muse\manmarubuu-action\game-web\blender")
TMP = ROOT / "_tmp_qa_panels"


def compose(grid, cols, out_path: Path):
    w, h = 640, 480
    rows = (len(grid) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * w, rows * h), (245, 240, 230))
    draw = ImageDraw.Draw(sheet)
    for idx, (fname, label) in enumerate(grid):
        r, c = divmod(idx, cols)
        x0, y0 = c * w, r * h
        p = TMP / fname
        if p.exists():
            im = Image.open(p).convert("RGB").resize((w, h))
            sheet.paste(im, (x0, y0))
        draw.rectangle((x0 + 8, y0 + 8, x0 + 360, y0 + 38), fill=(35, 25, 20))
        draw.text((x0 + 18, y0 + 15), label, fill=(255, 244, 210))
    sheet.save(out_path)
    print("Saved QA sheet:", out_path)


compose(
    [
        ("p1_boss_front.png", "1. CLOCKWORK TOY KING Front (+Z vs 1.0m Buu)"),
        ("p2_boss_back.png", "2. CLOCKWORK TOY KING Back Windup Key"),
        ("p3_windup_tank.png", "3. Windup Tank vs 1.0m Buu"),
        ("p4_propeller_balloon.png", "4. Propeller Balloon vs 1.0m Buu"),
        ("p5_cushion.png", "5. Quilted 4-Color Cushion vs 1.0m Buu"),
        ("p6_gift_box.png", "6. Silk-Ribbon Gift Box vs 1.0m Buu"),
    ],
    3,
    ROOT / "qa_sheet_ai_hero_enemies.png",
)

compose(
    [
        ("s1_smooth_props.png", "1. Blender Smooth Flowers / Shrooms / Grass / Fence"),
        ("s2_kaykit_medieval.png", "2. KayKit Medieval Buildings & Trees vs Buu"),
        ("s3_kaykit_dungeon.png", "3. KayKit Dungeon Chest / Barrel / Crates / Banner"),
        ("s4_kaykit_city_furn.png", "4. KayKit City & Furniture Props vs Buu"),
    ],
    2,
    ROOT / "qa_sheet_kaykit_smooth.png",
)
