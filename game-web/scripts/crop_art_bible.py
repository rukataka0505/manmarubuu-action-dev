from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(r"C:\Users\rukat\muse\manmarubuu-action")
OUT = ROOT / "game-web" / "ai-pipeline" / "crops"
OUT.mkdir(parents=True, exist_ok=True)

img02 = Image.open(ROOT / "art-bible" / "02_enemies_props.jpg").convert("RGB")
img03 = Image.open(ROOT / "art-bible" / "03_boss_clockwork_toy_king.jpg").convert("RGB")


def sample_bg(img: Image.Image, sx: int, sy: int) -> tuple[int, int, int]:
    return img.getpixel((sx, sy))


def place_square(crop: Image.Image, bg: tuple[int, int, int], size: int = 768, pad_ratio: float = 0.08) -> Image.Image:
    w, h = crop.size
    canvas_dim = int(max(w, h) * (1.0 + pad_ratio * 2))
    canvas = Image.new("RGB", (canvas_dim, canvas_dim), bg)
    canvas.paste(crop, ((canvas_dim - w) // 2, (canvas_dim - h) // 2))
    return canvas.resize((size, size), Image.Resampling.LANCZOS)


# 1. Boss King Front (wider crop so right arm & crown are never clipped; clean removal of Manmarubuu & labels)
bg03 = sample_bg(img03, 745, 70)
boss_crop = img03.crop((170, 15, 792, 725)).copy()
d = ImageDraw.Draw(boss_crop)
# Local origin is (170, 15)
# Top-left "CLOCKWORK TOY KING" title
d.rectangle((0, 0, 235, 175), fill=bg03)
# Middle-left "1:6 SCALE"
d.rectangle((0, 440, 120, 540), fill=bg03)
# Bottom-left Manmarubuu (stop cleanly before boss right fist & boot!)
d.polygon([(0, 495), (125, 495), (150, 560), (156, 710), (0, 710)], fill=bg03)
place_square(boss_crop, bg03, 768, 0.06).save(OUT / "boss_king.png")

# 2. Boss King Back (inside white frame card without rounded border corner or overflow clip)
bg03_back = sample_bg(img03, 1265, 220)
boss_back = img03.crop((845, 170, 1295, 705)).copy()
db = ImageDraw.Draw(boss_back)
# Mask thin card frame edge at very left/bottom
db.rectangle((0, 0, 12, boss_back.size[1]), fill=bg03_back)
db.rectangle((0, boss_back.size[1] - 12, boss_back.size[0], boss_back.size[1]), fill=bg03_back)
place_square(boss_back, bg03_back, 768, 0.08).save(OUT / "boss_king_back.png")

# 3. Windup Tank (02 top-left)
bg02 = sample_bg(img02, 470, 50)
tank_crop = img02.crop((85, 30, 455, 385)).copy()
place_square(tank_crop, bg02, 768, 0.10).save(OUT / "windup_tank.png")

# 4. Propeller Balloon (02 top-right)
balloon_crop = img02.crop((980, 25, 1255, 385)).copy()
place_square(balloon_crop, bg02, 768, 0.12).save(OUT / "propeller_balloon.png")

# 5. Patchwork Cushion (wider crop 445..755 so right tip is preserved; mask red spring cap & coils on upper-right)
cushion_crop = img02.crop((445, 415, 755, 705)).copy()
dc = ImageDraw.Draw(cushion_crop)
# Spring red cap enters around global x=700..755, y=450..690 -> local x=255..310
dc.polygon([(252, 0), (310, 0), (310, 290), (262, 290), (254, 210)], fill=bg02)
place_square(cushion_crop, bg02, 768, 0.10).save(OUT / "cushion.png")

# 6. Gift Box (mask top-left star point & lower-left coin edge completely)
gift_crop = img02.crop((1115, 435, 1308, 705)).copy()
dg = ImageDraw.Draw(gift_crop)
# Star arm at upper-left (local x=0..65, y=0..150)
dg.rectangle((0, 0, 58, 152), fill=bg02)
# Coin edge at lower-left (local x=0..56, y=130..270)
dg.polygon([(0, 125), (48, 125), (56, 200), (54, 270), (0, 270)], fill=bg02)
place_square(gift_crop, bg02, 768, 0.12).save(OUT / "gift_box.png")

print("Re-cropped 6 clean images.")
