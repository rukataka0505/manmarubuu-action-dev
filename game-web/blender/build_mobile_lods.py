"""Generate lightweight mobile GLB LODs under public/models/mobile/ for low-tier devices.

Preserves desktop assets under public/models/ completely untouched while:
1. Decimating Plush mesh and capping textures to 1024px on manmarubuu_animated_mobile.glb
   (preserving 20 NLA animations, 25 Face_* parts, KHR_node_visibility, and ear attachment fix).
2. Decimating & resizing textures (max 512px) for ai/ enemy & boss & cushion GLBs.
3. Decimating heavy diorama/toybox props while preserving MODEL_CONTRACT protected nodes
   (Cap, Coil, FlagCloth, SlabBody, BoxLid, Bow) and stripping overridden TEX_IMAGE blobs from
   pure MAT_* diorama GLBs so DioramaMaterialBinder binds them with zero wasted GLB image payload.
"""

import json
import struct
from pathlib import Path

import bpy

GAME_ROOT = Path(r"C:\Users\rukat\muse\manmarubuu-action\game-web")
MODELS_DIR = GAME_ROOT / "public" / "models"
MOBILE_DIR = MODELS_DIR / "mobile"

MANMARU_BLEND = GAME_ROOT / "blender" / "manmarubuu_animated.blend"
PRESETS_JSON = MODELS_DIR / "expressions_presets.json"

VISIBILITY_EXT = "KHR_node_visibility"
BONE_NAMES = ["Root", "Belly", "Head", "Ear.L", "Ear.R", "Arm.L", "Foot.L", "Arm.R", "Foot.R", "Tail"]
EXPECTED_ANIMS = [
    "Idle", "Walk", "Dash", "Brake", "Turn",
    "JumpStart", "DoubleJump", "StompBounce", "Fall", "Land", "TrampolineFly",
    "HipDropStart", "HipDropSlam", "RollCharge", "RollSpin", "WallBounce",
    "FeverBurst", "Damage", "Recover", "VictoryDance",
]

# Relative paths under public/models/ -> (decimate_ratio, max_image_dim, strip_mat_images)
PROP_LOD_SPECS = {
    # Heavy AI / Boss / Enemy / Cushion assets (preserve their textures, resize <= 512)
    "ai/boss_king.glb": (0.26, 512, False),
    "ai/windup_tank.glb": (0.28, 512, False),
    "ai/propeller_balloon.glb": (0.30, 512, False),
    "ai/cushion.glb": (0.35, 512, False),
    "ai/gift_box.glb": (1.0, 256, False),
    "clockwork_toy_king.glb": (0.35, 512, False),

    # Heavy multi-instance or dense diorama props (MAT_* textures are stripped because binder replaces them)
    "diorama/boss_arena_deck.glb": (0.26, 256, True),
    "diorama/boss_baluster_section.glb": (0.22, 256, True),
    "diorama/wood_domino_bevel.glb": (0.20, 256, True),
    "diorama/bowling_pin_smooth.glb": (0.28, 256, True),
    "diorama/castle_arch_gate.glb": (0.34, 256, True),
    "diorama/patchwork_rug.glb": (0.32, 256, True),
    "diorama/trampoline_red_coil.glb": (0.34, 256, True),
    "diorama/trampoline_wood_coil.glb": (0.34, 256, True),
    "diorama/trampoline_mini_pastel.glb": (0.36, 256, True),
    "diorama/checkpoint_flag_felt.glb": (0.36, 256, True),
    "diorama/star_gate_clockwork.glb": (0.38, 256, True),
    "diorama/castle_tower_blue.glb": (0.38, 256, True),
    "diorama/castle_tower_round.glb": (0.38, 256, True),
    "diorama/castle_keep_center.glb": (0.40, 256, True),
    "diorama/castle_stairs_wood.glb": (0.40, 256, True),
    "diorama/toy_tree_felt.glb": (0.30, 256, True),
    "diorama/toy_fence_wood.glb": (0.34, 256, True),
    "diorama/toy_house_blue.glb": (0.40, 256, True),
    "diorama/toy_house_red.glb": (0.40, 256, True),
    "diorama/daisy_white.glb": (0.32, 256, True),
    "diorama/boss_gear_large.glb": (0.38, 256, True),
    "diorama/boss_gear_medium.glb": (0.40, 256, True),
    "diorama/boss_gear_small.glb": (0.42, 256, True),
    "diorama/boss_lantern_post.glb": (0.42, 256, True),
    "diorama/boss_arena_glass.glb": (0.45, 256, True),
    "diorama/wood_crate_bevel.glb": (0.48, 256, True),
    "diorama/wood_rail_bridge.glb": (0.55, 256, True),
    "diorama/toy_platform_slab.glb": (0.55, 256, True),
    "diorama/alphabet_block_bevel.glb": (1.0, 256, True),
    "diorama/bevel_cube_wood.glb": (1.0, 256, True),
    "diorama/bevel_cylinder_wood.glb": (1.0, 256, True),
    "diorama/castle_wall_crenel.glb": (1.0, 256, True),
    "diorama/stepping_stone_plank.glb": (1.0, 256, True),
    "diorama/stepping_stone_round.glb": (1.0, 256, True),

    # Toybox smooth extras
    "toybox_smooth/fence_wood_round.glb": (0.34, 256, False),
    "toybox_smooth/flower_daisy_blue.glb": (0.35, 256, False),
    "toybox_smooth/flower_daisy_pink.glb": (0.35, 256, False),
    "toybox_smooth/flower_daisy_yellow.glb": (0.35, 256, False),
    "toybox_smooth/mushroom_spotted.glb": (0.32, 256, False),
}

PROTECTED_NODES_BY_REL = {
    "diorama/toy_platform_slab.glb": ["SlabBody"],
    "diorama/trampoline_red_coil.glb": ["Cap", "Coil"],
    "diorama/trampoline_wood_coil.glb": ["Cap", "Coil"],
    "diorama/trampoline_mini_pastel.glb": ["Cap", "Coil"],
    "diorama/checkpoint_flag_felt.glb": ["FlagCloth"],
    "ai/gift_box.glb": ["BoxLid", "Bow"],
}


def collect_objects_recursive(col):
    out = []
    for ob in col.objects:
        if ob is not None:
            out.append(ob)
    for child in col.children:
        out.extend(collect_objects_recursive(child))
    return out


def downscale_images(max_dim: int):
    for img in list(bpy.data.images):
        if img.type in ("RENDER_RESULT", "COMPOSITING"):
            continue
        w, h = img.size[0], img.size[1]
        if w <= 0 or h <= 0:
            continue
        if max(w, h) > max_dim:
            if w >= h:
                nw = max_dim
                nh = max(16, int(round(h * (max_dim / w))))
            else:
                nh = max_dim
                nw = max(16, int(round(w * (max_dim / h))))
            try:
                img.scale(nw, nh)
                img.pack()
            except Exception as exc:
                print(f"WARN image scale {img.name} ({w}x{h}): {exc}")


def apply_decimate(obj, ratio: float, min_polys: int = 80):
    if obj.type != "MESH" or ratio >= 0.999:
        return
    if len(obj.data.polygons) <= min_polys:
        return

    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)

    # Clear parent inverse / keep transform intact, insert DECIMATE before ARMATURE if skinned
    mod = obj.modifiers.new("MobileDecimate", "DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = ratio
    mod.use_collapse_triangulate = False

    arm_idx = next((i for i, m in enumerate(obj.modifiers) if m.type == "ARMATURE"), None)
    if arm_idx is not None:
        # Move MobileDecimate to index 0 so weights interpolate properly cleanly before deformation
        bpy.ops.object.modifier_move_to_index(modifier=mod.name, index=0)

    bpy.ops.object.modifier_apply(modifier=mod.name)


def count_glb_stats(glb_path: Path):
    raw = glb_path.read_bytes()
    json_len = struct.unpack_from("<I", raw, 12)[0]
    doc = json.loads(raw[20:20 + json_len])
    tris = 0
    has_uv = False
    for mesh in doc.get("meshes", []):
        for prim in mesh.get("primitives", []):
            attrs = prim.get("attributes", {})
            if "TEXCOORD_0" in attrs:
                has_uv = True
            if "indices" in prim:
                tris += doc["accessors"][prim["indices"]]["count"] // 3
            else:
                pos = attrs.get("POSITION")
                if pos is not None:
                    tris += doc["accessors"][pos]["count"] // 3
    nodes = [n.get("name", "") for n in doc.get("nodes", [])]
    mats = [m.get("name", "") for m in doc.get("materials", [])]
    return len(raw), tris, nodes, mats, has_uv


def build_mobile_hero():
    out_path = MOBILE_DIR / "manmarubuu_animated_mobile.glb"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.open_mainfile(filepath=str(MANMARU_BLEND))
    presets = json.loads(PRESETS_JSON.read_text(encoding="utf-8"))
    all_parts = sorted({p for parts in presets.values() for p in parts})
    for name in all_parts:
        ob = bpy.data.objects[name]
        for prop in ("hide_viewport", "hide_render"):
            try:
                ob.driver_remove(prop)
            except Exception:
                pass
        ob.hide_viewport = False
        ob.hide_render = False
        ob.hide_set(False)

    rig = bpy.data.objects["Manmarubuu"]
    plush = bpy.data.objects["Plush"]
    bpy.context.view_layer.update()

    orig_tris = sum(len(p.vertices) - 2 for p in plush.data.polygons)
    apply_decimate(plush, ratio=0.24, min_polys=200)
    new_tris = sum(len(p.vertices) - 2 for p in plush.data.polygons)
    print(f"MOBILE_HERO_PLUSH: tris {orig_tris} -> {new_tris}")

    # Downscale hero textures (4096x2048 plush maps -> 1024x512, keeping aspect ratio)
    downscale_images(max_dim=1024)

    cast = bpy.data.collections["Manmarubuu | Character"]
    cast_objs = collect_objects_recursive(cast)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.select_all(action="DESELECT")
    for ob in cast_objs:
        ob.hide_viewport = False
        ob.hide_render = False
        ob.hide_set(False)
        ob.select_set(True)
    bpy.context.view_layer.objects.active = rig

    export_fmt = "WEBP" if any(e.identifier == "WEBP" for e in bpy.ops.export_scene.gltf.get_rna_type().properties["export_image_format"].enum_items) else "AUTO"

    bpy.ops.export_scene.gltf(
        filepath=str(out_path),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_skins=True,
        export_influence_nb=4,
        export_morph=False,
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_bake_animation=True,
        export_optimize_animation_size=False,
        export_tangents=False,
        export_image_format=export_fmt,
        export_image_quality=85,
        export_rest_position_armature=True,
    )

    # Apply KHR_node_visibility & verify contracts
    raw = out_path.read_bytes()
    json_len = struct.unpack_from("<I", raw, 12)[0]
    doc = json.loads(raw[20:20 + json_len])

    active = set(presets["Sleep"])
    found_parts = set()
    for node in doc.get("nodes", []):
        nname = node.get("name")
        if nname in all_parts:
            found_parts.add(nname)
            node.setdefault("extensions", {})[VISIBILITY_EXT] = {"visible": nname in active}

    assert not (set(all_parts) - found_parts), f"Missing face parts: {set(all_parts) - found_parts}"
    if VISIBILITY_EXT not in doc.setdefault("extensionsUsed", []):
        doc["extensionsUsed"].append(VISIBILITY_EXT)

    anim_names = [a.get("name") for a in doc.get("animations", [])]
    assert not (set(EXPECTED_ANIMS) - set(anim_names)), f"Missing anims: {set(EXPECTED_ANIMS) - set(anim_names)}"
    node_names = {n.get("name") for n in doc.get("nodes", [])}
    assert not (set(BONE_NAMES) - node_names), f"Missing bones: {set(BONE_NAMES) - node_names}"

    doc["scenes"][doc.get("scene", 0)].setdefault("extras", {})["defaultExpression"] = "Sleep"
    chunk = json.dumps(doc, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    chunk += b" " * (-len(chunk) % 4)
    rest = raw[20 + json_len:]
    total_len = 20 + len(chunk) + len(rest)
    out_path.write_bytes(struct.pack("<4sIIII", b"glTF", 2, total_len, len(chunk), 0x4E4F534A) + chunk + rest)

    sz, tris, _, _, hero_uv = count_glb_stats(out_path)
    assert hero_uv, "Mobile hero lost TEXCOORD_0 UVs!"
    print(f"MOBILE_HERO_OK: {out_path.name} fmt={export_fmt} bytes={sz} ({sz/1024/1024:.2f}MB) tris={tris} anims={len(anim_names)} faces={len(found_parts)}")


def render_mobile_hero_qa():
    """Import exported mobile hero GLB cleanly and render a verification closeup (cheek alpha + ear attachment)."""
    out_glb = MOBILE_DIR / "manmarubuu_animated_mobile.glb"
    qa_out = GAME_ROOT / "blender" / "_tmp_ear_qa" / "mobile_hero_qa.png"
    qa_out.parent.mkdir(parents=True, exist_ok=True)
    presets = json.loads(PRESETS_JSON.read_text(encoding="utf-8"))

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(out_glb))

    # Show Happy expression meshes so blush alpha transparency + attached ears are visible
    happy_set = set(presets["Happy"])
    for ob in bpy.data.objects:
        if ob.name.startswith("Face_"):
            vis = ob.name in happy_set
            ob.hide_render = not vis
            ob.hide_viewport = not vis

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in [e.identifier for e in scene.render.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE"
    scene.render.resolution_x = 640
    scene.render.resolution_y = 640
    if scene.world is None:
        scene.world = bpy.data.worlds.new("QAWorld")
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.36, 0.48, 0.62, 1.0)
        bg.inputs[1].default_value = 0.9

    from mathutils import Vector
    import math
    cam_data = bpy.data.cameras.new("MobQACam")
    cam_data.lens = 45
    cam_obj = bpy.data.objects.new("MobQACam", cam_data)
    scene.collection.objects.link(cam_obj)
    cam_obj.location = (0.95, -1.75, 1.05)
    cam_obj.rotation_euler = (Vector((0.0, 0.0, 0.62)) - cam_obj.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam_obj

    sun_data = bpy.data.lights.new("MobQASun", type="SUN")
    sun_data.energy = 1.6
    sun_obj = bpy.data.objects.new("MobQASun", sun_data)
    scene.collection.objects.link(sun_obj)
    sun_obj.rotation_euler = (math.radians(48), math.radians(15), math.radians(-30))

    scene.render.filepath = str(qa_out)
    bpy.ops.render.render(write_still=True)
    print("MOBILE_HERO_QA_IMG:", qa_out)


def strip_mat_images_from_scene():
    """Remove unused TEX_IMAGE nodes from MAT_* materials so DioramaMaterialBinder binds clean PBR without GLB bloat."""
    for mat in list(bpy.data.materials):
        if not mat.name.startswith("MAT_") or not mat.use_nodes or not mat.node_tree:
            continue
        nt = mat.node_tree
        for node in list(nt.nodes):
            if node.type == "TEX_IMAGE":
                nt.nodes.remove(node)


def build_mobile_prop(rel_path: str, ratio: float, max_img: int, strip_mat_imgs: bool):
    src_path = MODELS_DIR / rel_path
    out_path = MOBILE_DIR / rel_path
    out_path.parent.mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(src_path))

    # Clear duplicate suffix checks and decimate meshes
    for obj in list(bpy.data.objects):
        if obj.type == "MESH":
            apply_decimate(obj, ratio=ratio, min_polys=60)

    if strip_mat_imgs:
        all_mat_prefixed = all(
            m.name.startswith("MAT_") for m in bpy.data.materials if m.users > 0
        )
        if all_mat_prefixed:
            strip_mat_images_from_scene()

    if max_img > 0:
        downscale_images(max_dim=max_img)

    has_anims = len(bpy.data.actions) > 0
    has_armature = any(o.type == "ARMATURE" for o in bpy.data.objects)
    export_fmt = "WEBP" if any(e.identifier == "WEBP" for e in bpy.ops.export_scene.gltf.get_rna_type().properties["export_image_format"].enum_items) else "AUTO"
    bpy.ops.export_scene.gltf(
        filepath=str(out_path),
        export_format="GLB",
        use_selection=False,
        export_yup=True,
        export_animations=has_anims,
        export_skins=has_armature,
        export_tangents=False,
        export_image_format=export_fmt,
        export_image_quality=82,
    )

    src_sz, src_tris, _, _, src_uv = count_glb_stats(src_path)
    dst_sz, dst_tris, dst_nodes, dst_mats, dst_uv = count_glb_stats(out_path)
    if src_uv:
        assert dst_uv, f"Lost TEXCOORD_0 UV on {rel_path}"

    # Check MODEL_CONTRACT protected nodes preserved
    req_prefixes = PROTECTED_NODES_BY_REL.get(rel_path, [])
    for pref in req_prefixes:
        assert any(pref in n for n in dst_nodes), f"Protected node '{pref}' missing in {rel_path}: {dst_nodes}"

    print(
        f"MOBILE_LOD {rel_path}: size {src_sz//1024}KB->{dst_sz//1024}KB | "
        f"tris {src_tris}->{dst_tris} | mats={dst_mats[:4]}{'...' if len(dst_mats)>4 else ''}"
    )
    return src_sz, dst_sz, src_tris, dst_tris


def main():
    MOBILE_DIR.mkdir(parents=True, exist_ok=True)
    build_mobile_hero()
    render_mobile_hero_qa()

    total_src_b = 0
    total_dst_b = 0
    total_src_t = 0
    total_dst_t = 0
    for rel, (ratio, max_img, strip_mat) in sorted(PROP_LOD_SPECS.items()):
        sb, db, st, dt = build_mobile_prop(rel, ratio, max_img, strip_mat)
        total_src_b += sb
        total_dst_b += db
        total_src_t += st
        total_dst_t += dt

    print(
        f"===MOBILE_LODS_DONE=== props: {total_src_b/1024/1024:.2f}MB -> {total_dst_b/1024/1024:.2f}MB | "
        f"tris sum: {total_src_t} -> {total_dst_t}"
    )


if __name__ == "__main__":
    main()
