import json
import shutil
import time
from pathlib import Path
from gradio_client import Client, handle_file

ROOT = Path(r"C:\Users\rukat\muse\manmarubuu-action\game-web\ai-pipeline")
CROPS_DIR = ROOT / "crops"
RAW_DIR = ROOT / "raw"
RAW_DIR.mkdir(parents=True, exist_ok=True)
REPORT_PATH = ROOT / "generation_report.json"

TARGETS = [
    ("boss_king", CROPS_DIR / "boss_king.png"),
    ("windup_tank", CROPS_DIR / "windup_tank.png"),
    ("propeller_balloon", CROPS_DIR / "propeller_balloon.png"),
    ("cushion", CROPS_DIR / "cushion.png"),
    ("gift_box", CROPS_DIR / "gift_box.png"),
]


def extract_filepath(obj) -> Path | None:
    if isinstance(obj, str) and Path(obj).exists():
        return Path(obj)
    if isinstance(obj, dict):
        for k in ("path", "url", "value"):
            v = obj.get(k)
            if isinstance(v, str) and Path(v).exists():
                return Path(v)
    if isinstance(obj, (list, tuple)):
        for item in obj:
            p = extract_filepath(item)
            if p and p.suffix.lower() in (".glb", ".gltf"):
                return p
        for item in obj:
            p = extract_filepath(item)
            if p:
                return p
    return None


def try_trellis2(client: Client, name: str, img_path: Path, out_path: Path) -> str:
    client.predict(api_name="/start_session")
    prep = client.predict(input=handle_file(str(img_path)), api_name="/preprocess_image")
    prep_path = extract_filepath(prep)
    img_arg = handle_file(str(prep_path)) if prep_path else handle_file(str(img_path))

    client.predict(
        image=img_arg,
        seed=42,
        resolution="1024",
        ss_guidance_strength=7.5,
        ss_guidance_rescale=0.7,
        ss_sampling_steps=12,
        ss_rescale_t=5,
        shape_slat_guidance_strength=7.5,
        shape_slat_guidance_rescale=0.5,
        shape_slat_sampling_steps=12,
        shape_slat_rescale_t=3,
        tex_slat_guidance_strength=1,
        tex_slat_guidance_rescale=0,
        tex_slat_sampling_steps=12,
        tex_slat_rescale_t=3,
        api_name="/image_to_3d",
    )
    ext = client.predict(decimation_target=100000, texture_size=1024, api_name="/extract_glb")
    glb_path = extract_filepath(ext)
    if not glb_path or not glb_path.exists():
        raise RuntimeError(f"TRELLIS.2 returned no GLB path for {name}: {ext!r}")
    shutil.copyfile(glb_path, out_path)
    return "microsoft/TRELLIS.2"


def try_hunyuan21(client: Client, name: str, img_path: Path, out_path: Path) -> str:
    res = client.predict(
        image=handle_file(str(img_path)),
        mv_image_front=None,
        mv_image_back=None,
        mv_image_left=None,
        mv_image_right=None,
        steps=25,
        guidance_scale=5,
        seed=1234,
        octree_resolution=256,
        check_box_rembg=True,
        num_chunks=8000,
        randomize_seed=False,
        api_name="/generation_all",
    )
    glb_path = extract_filepath(res)
    if not glb_path or not glb_path.exists():
        raise RuntimeError(f"Hunyuan3D-2.1 returned no GLB path for {name}: {res!r}")
    shutil.copyfile(glb_path, out_path)
    return "tencent/Hunyuan3D-2.1"


def try_hunyuan20(client: Client, name: str, img_path: Path, out_path: Path) -> str:
    res = client.predict(
        caption="",
        image=handle_file(str(img_path)),
        mv_image_front=None,
        mv_image_back=None,
        mv_image_left=None,
        mv_image_right=None,
        steps=25,
        guidance_scale=5.5,
        seed=1234,
        octree_resolution=256,
        check_box_rembg=True,
        num_chunks=8000,
        randomize_seed=False,
        api_name="/generation_all",
    )
    glb_path = extract_filepath(res)
    if not glb_path or not glb_path.exists():
        raise RuntimeError(f"Hunyuan3D-2 returned no GLB path for {name}: {res!r}")
    shutil.copyfile(glb_path, out_path)
    return "tencent/Hunyuan3D-2"


def is_quota_or_auth_error(err_str: str) -> bool:
    low = err_str.lower()
    return any(
        k in low
        for k in ("quota", "zerogpu", "exceeded", "429", "rate limit", "log in", "login", "sign in", "unauthorized")
    )


def main() -> None:
    report = {"results": {}}
    backends = [
        ("microsoft/TRELLIS.2", try_trellis2),
        ("tencent/Hunyuan3D-2.1", try_hunyuan21),
        ("tencent/Hunyuan3D-2", try_hunyuan20),
    ]
    clients: dict[str, Client] = {}
    blocked_backends: set[str] = set()

    for name, img_path in TARGETS:
        out_path = RAW_DIR / f"{name}_raw.glb"
        if out_path.exists() and out_path.stat().st_size > 10000:
            print(f"[SKIP] {name} already exists ({out_path.stat().st_size} bytes)")
            report["results"][name] = {
                "status": "existing",
                "file": str(out_path),
                "bytes": out_path.stat().st_size,
            }
            continue

        t0 = time.time()
        errors = []
        succeeded = False

        for space_id, fn in backends:
            if space_id in blocked_backends:
                errors.append(f"{space_id}: skipped (quota/blocked)")
                continue
            try:
                if space_id not in clients:
                    print(f"[CONNECT] Connecting to {space_id}...")
                    clients[space_id] = Client(space_id)
                print(f"[RUN] Generating {name} via {space_id}...")
                used = fn(clients[space_id], name, img_path, out_path)
                elapsed = round(time.time() - t0, 2)
                sz = out_path.stat().st_size
                print(f"[OK] {name} via {used} in {elapsed}s -> {sz} bytes")
                report["results"][name] = {
                    "status": "ok",
                    "backend": used,
                    "elapsedSec": elapsed,
                    "bytes": sz,
                    "file": str(out_path),
                }
                succeeded = True
                break
            except Exception as exc:
                msg = f"{type(exc).__name__}: {exc}"
                print(f"[WARN] {name} failed on {space_id}: {msg}")
                errors.append(f"{space_id}: {msg}")
                if is_quota_or_auth_error(msg):
                    blocked_backends.add(space_id)

        if not succeeded:
            elapsed = round(time.time() - t0, 2)
            report["results"][name] = {
                "status": "fallback_blender",
                "elapsedSec": elapsed,
                "errors": errors,
            }

        REPORT_PATH.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

        if len(blocked_backends) == len(backends):
            print("[STOP] All Hugging Face Spaces backends hit quota/limit; remaining assets will use Blender.")
            break

    print("Generation report saved to:", REPORT_PATH)


if __name__ == "__main__":
    main()
