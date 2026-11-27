"""Generate 20 curated actions on Manmarubuu and export manmarubuu_animated.glb."""
import json
import math
import struct
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Euler, Quaternion, Vector
from mathutils.bvhtree import BVHTree

SOURCE_BLEND = Path(r"C:\Users\rukat\muse\manmarubuu-action\model-astra-max\manmarubuu_game.blend")
PRESETS_JSON = Path(r"C:\Users\rukat\muse\manmarubuu-action\model-astra-max\expressions_presets.json")
GAME_ROOT = Path(r"C:\Users\rukat\muse\manmarubuu-action\game-web")
OUT_BLEND = GAME_ROOT / "blender" / "manmarubuu_animated.blend"
OUT_GLB = GAME_ROOT / "public" / "models" / "manmarubuu_animated.glb"
OUT_SHEET = GAME_ROOT / "blender" / "anim_preview_sheet.png"

VISIBILITY_EXT = "KHR_node_visibility"
BONE_NAMES = ["Root", "Belly", "Head", "Ear.L", "Ear.R", "Arm.L", "Foot.L", "Arm.R", "Foot.R", "Tail"]


def rad3(deg_tuple):
    return tuple(math.radians(a) for a in deg_tuple)


def set_bone_world_pose(pb, angles_deg=(0, 0, 0), loc=(0, 0, 0), scale=(1, 1, 1)):
    frame = pb.bone.matrix_local.to_quaternion()
    world_q = Euler(rad3(angles_deg), "XYZ").to_quaternion()
    pb.rotation_mode = "QUATERNION"
    pb.rotation_quaternion = frame.inverted() @ world_q @ frame

    # Location in world space -> bone local space
    pb.location = pb.bone.matrix_local.to_3x3().inverted() @ Vector(loc)

    # Axial/radial scale helper matching model-astra-max/scripts/poses.py
    if scale != (1, 1, 1):
        radial, axial, _ = scale
        direction = (pb.bone.tail_local - pb.bone.head_local).normalized()
        axes = pb.bone.matrix_local.to_quaternion().inverted() @ direction
        axis = max(range(3), key=lambda i: abs(axes[i]))
        xyz = [radial, radial, radial]
        xyz[axis] = axial
        pb.scale = tuple(xyz)
    else:
        pb.scale = (1, 1, 1)


def reset_rig(rig):
    for pb in rig.pose.bones:
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = Quaternion()
        pb.location = (0, 0, 0)
        pb.scale = (1, 1, 1)


def key_all(rig, frame):
    for pb in rig.pose.bones:
        pb.keyframe_insert(data_path="rotation_quaternion", frame=frame)
        pb.keyframe_insert(data_path="location", frame=frame)
        pb.keyframe_insert(data_path="scale", frame=frame)


def apply_pose_frame(rig, frame, bone_map, root_loc=(0, 0, 0), scales=None):
    reset_rig(rig)
    scales = scales or {}
    for bname, ang in bone_map.items():
        loc = root_loc if bname == "Root" else (0, 0, 0)
        sc = scales.get(bname, (1, 1, 1))
        set_bone_world_pose(rig.pose.bones[bname], ang, loc=loc, scale=sc)
    if "Root" not in bone_map and root_loc != (0, 0, 0):
        set_bone_world_pose(rig.pose.bones["Root"], (0, 0, 0), loc=root_loc, scale=scales.get("Root", (1, 1, 1)))
    elif "Root" not in bone_map and "Root" in scales:
        set_bone_world_pose(rig.pose.bones["Root"], (0, 0, 0), loc=(0, 0, 0), scale=scales["Root"])
    for bname, sc in scales.items():
        if bname not in bone_map and bname != "Root":
            set_bone_world_pose(rig.pose.bones[bname], (0, 0, 0), loc=(0, 0, 0), scale=sc)
    key_all(rig, frame)


def set_root_spin_frame(rig, frame, spin_x_deg, body_map, root_loc=(0, 0, 0), scales=None):
    """Apply continuous multi-angle X rotation without quaternion flip by keeping short steps."""
    reset_rig(rig)
    scales = scales or {}
    # Use Root for forward roll (positive X tilts -Y forward/down)
    set_bone_world_pose(rig.pose.bones["Root"], (spin_x_deg, 0, 0), loc=root_loc, scale=scales.get("Root", (1, 1, 1)))
    for bname, ang in body_map.items():
        sc = scales.get(bname, (1, 1, 1))
        set_bone_world_pose(rig.pose.bones[bname], ang, loc=(0, 0, 0), scale=sc)
    key_all(rig, frame)


def make_smooth_action(rig, name, frames_data, loop=True):
    act = bpy.data.actions.new(name=name)
    rig.animation_data.action = act

    for f, kwargs in frames_data:
        if "spin_x" in kwargs:
            set_root_spin_frame(
                rig,
                f,
                kwargs["spin_x"],
                kwargs.get("bones", {}),
                root_loc=kwargs.get("loc", (0, 0, 0)),
                scales=kwargs.get("scales"),
            )
        else:
            apply_pose_frame(
                rig,
                f,
                kwargs.get("bones", {}),
                root_loc=kwargs.get("loc", (0, 0, 0)),
                scales=kwargs.get("scales"),
            )

    # Ensure quaternion continuity along each F-curve
    # Blender 5.2 slotted actions or legacy fcurves
    fcurves = []
    if hasattr(act, "layers") and len(act.layers) > 0:
        for layer in act.layers:
            for strip in layer.strips:
                if hasattr(strip, "channelbags"):
                    for cb in strip.channelbags:
                        fcurves.extend(cb.fcurves)
    if hasattr(act, "fcurves") and len(fcurves) == 0:
        fcurves.extend(act.fcurves)

    # Fix quaternion sign flips across frames
    quat_groups = {}
    for fc in fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = "BEZIER"
            kp.handle_left_type = "AUTO_CLAMPED"
            kp.handle_right_type = "AUTO_CLAMPED"
        if fc.data_path.endswith("rotation_quaternion"):
            quat_groups.setdefault(fc.data_path, {})[fc.array_index] = fc

    for path, comps in quat_groups.items():
        if len(comps) == 4:
            nkeys = len(comps[0].keyframe_points)
            prev = None
            for i in range(nkeys):
                q = Quaternion((
                    comps[0].keyframe_points[i].co[1],
                    comps[1].keyframe_points[i].co[1],
                    comps[2].keyframe_points[i].co[1],
                    comps[3].keyframe_points[i].co[1],
                ))
                if prev is not None and prev.dot(q) < 0.0:
                    q = -q
                    for idx in range(4):
                        comps[idx].keyframe_points[i].co[1] = q[idx]
                prev = q

    start_f = frames_data[0][0]
    end_f = frames_data[-1][0]
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name=name, start=start_f, action=act)
    strip.frame_start = start_f
    strip.frame_end = end_f
    return act, start_f, end_f


def measure_plush_bbox(depsgraph):
    plush = bpy.data.objects["Plush"]
    ob_eval = plush.evaluated_get(depsgraph)
    mesh = ob_eval.to_mesh()
    try:
        mw = ob_eval.matrix_world
        xs, ys, zs = [], [], []
        for v in mesh.vertices:
            w = mw @ v.co
            xs.append(w.x)
            ys.append(w.y)
            zs.append(w.z)
        min_v = Vector((min(xs), min(ys), min(zs)))
        max_v = Vector((max(xs), max(ys), max(zs)))
        center = (min_v + max_v) * 0.5
        return min_v, max_v, center
    finally:
        ob_eval.to_mesh_clear()


def verify_rollspin_center(rig, target_frames=(1, 5, 9, 13, 17)):
    scene = bpy.context.scene
    prev_action = rig.animation_data.action
    prev_mutes = [t.mute for t in rig.animation_data.nla_tracks]
    prev_frame = scene.frame_current

    rig.animation_data.action = None
    for t in rig.animation_data.nla_tracks:
        t.mute = (t.name != "RollSpin")

    centers = []
    for f in target_frames:
        scene.frame_set(f)
        bpy.context.view_layer.update()
        depsgraph = bpy.context.evaluated_depsgraph_get()
        min_v, max_v, center = measure_plush_bbox(depsgraph)
        centers.append((f, center, min_v, max_v))
        print(
            f"ROLLSPIN_CHECK f={f:02d}: center=({center.x:.4f}, {center.y:.4f}, {center.z:.4f}) "
            f"z=[{min_v.z:.4f}, {max_v.z:.4f}]"
        )

    ref_center = centers[0][1]
    max_drift = max((c - ref_center).length for _, c, _, _ in centers)
    avg_center = sum((c for _, c, _, _ in centers), Vector((0.0, 0.0, 0.0))) / len(centers)
    max_dev_from_avg = max((c - avg_center).length for _, c, _, _ in centers)
    print(
        f"ROLLSPIN_DRIFT_SUMMARY: max_drift_from_f1={max_drift:.5f}m, "
        f"max_dev_from_avg={max_dev_from_avg:.5f}m"
    )

    # Restore NLA state and frame
    for t, m in zip(rig.animation_data.nla_tracks, prev_mutes):
        t.mute = m
    rig.animation_data.action = prev_action
    scene.frame_set(prev_frame)
    bpy.context.view_layer.update()

    assert max_drift < 0.03, f"RollSpin center drift too large: {max_drift:.5f}m (>= 0.03m)"
    return max_drift


def _extract_mesh_islands(bm, matrix_world):
    bm.verts.ensure_lookup_table()
    visited = set()
    islands = []
    for v in bm.verts:
        if v.index in visited:
            continue
        stack = [v]
        comp = []
        visited.add(v.index)
        while stack:
            cur = stack.pop()
            comp.append(cur.index)
            for e in cur.link_edges:
                ov = e.other_vert(cur)
                if ov.index not in visited:
                    visited.add(ov.index)
                    stack.append(ov)
        pts = [matrix_world @ bm.verts[i].co for i in comp]
        c = sum(pts, Vector()) / len(pts)
        islands.append((len(comp), c, set(comp)))
    islands.sort(key=lambda item: -item[0])
    return islands


def _build_head_bvh_and_signed_dist(bm, head_vert_set, matrix_world):
    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    vert_map = {}
    coords = []
    for idx in sorted(head_vert_set):
        vert_map[idx] = len(coords)
        coords.append(matrix_world @ bm.verts[idx].co)
    tris = []
    for f in bm.faces:
        if all(v.index in head_vert_set for v in f.verts):
            fvs = [vert_map[v.index] for v in f.verts]
            for k in range(1, len(fvs) - 1):
                tris.append((fvs[0], fvs[k], fvs[k + 1]))
    bvh = BVHTree.FromPolygons(coords, tris)
    return bvh


def _signed_dist_to_head(bvh, point_world):
    loc, normal, _idx, dist = bvh.find_nearest(point_world)
    if loc is None:
        return dist, Vector(), Vector((0.0, 0.0, 1.0))
    sign = 1.0 if (point_world - loc).dot(normal) >= 0.0 else -1.0
    return sign * dist, loc, normal


def _smoothstep(edge0, edge1, x):
    if edge0 < edge1:
        t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
    elif edge0 > edge1:
        t = max(0.0, min(1.0, (edge0 - x) / (edge0 - edge1)))
    else:
        t = 1.0 if x >= edge1 else 0.0
    return t * t * (3.0 - 2.0 * t)


def fix_ear_attachment(rig, plush):
    """Seat Ear.L / Ear.R attachment bridge cleanly into Head without distorting the outer ear silhouette."""
    mw_p = plush.matrix_world.copy()
    mw_p_inv = mw_p.inverted()
    mw_r = rig.matrix_world.copy()
    mw_r_inv = mw_r.inverted()

    bm = bmesh.new()
    bm.from_mesh(plush.data)
    islands = _extract_mesh_islands(bm, mw_p)

    # Identify Head (ISLAND 1: ~6224 verts, near x=0, z~0.645) and Ear.L / Ear.R (~2234 verts)
    head_island = min(
        [isl for isl in islands if 4500 <= isl[0] <= 8000 and abs(isl[1].x) < 0.05 and 0.55 < isl[1].z < 0.80],
        key=lambda isl: abs(isl[1].x) + abs(isl[1].z - 0.645),
    )
    ear_l_island = min(
        [isl for isl in islands if 1500 <= isl[0] <= 3200 and isl[1].x > 0.20 and isl[1].z > 0.72],
        key=lambda isl: abs(isl[1].z - 0.865),
    )
    ear_r_island = min(
        [isl for isl in islands if 1500 <= isl[0] <= 3200 and isl[1].x < -0.20 and isl[1].z > 0.72],
        key=lambda isl: abs(isl[1].z - 0.865),
    )

    head_verts = head_island[2]
    head_bvh = _build_head_bvh_and_signed_dist(bm, head_verts, mw_p)

    ear_infos = [
        ("Ear.L", +1.0, ear_l_island[2]),
        ("Ear.R", -1.0, ear_r_island[2]),
    ]

    vg_head_idx = plush.vertex_groups["Head"].index

    # Subtle overall shift (+1.5cm closer to skull) & place Ear.L / Ear.R pivot safely inside Head
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    try:
        for bname, sgn, _vert_set in ear_infos:
            eb = rig.data.edit_bones[bname]
            shift_world = Vector((-0.015 * sgn, -0.002, -0.006))
            old_head_w = mw_r @ eb.head
            old_tail_w = mw_r @ eb.tail
            # Hinge slightly deeper inside skull while keeping the tip axis aligned
            new_head_w = old_head_w + shift_world + Vector((-0.022 * sgn, 0.0, -0.010))
            new_tail_w = old_tail_w + shift_world
            eb.head = mw_r_inv @ new_head_w
            eb.tail = mw_r_inv @ new_tail_w
            sd_pivot, _, _ = _signed_dist_to_head(head_bvh, new_head_w)
            print(f"EAR_FIX_BONE {bname}: head={tuple(round(v, 4) for v in new_head_w)} head_sd={sd_pivot:.4f}m")
    finally:
        bpy.ops.object.mode_set(mode="OBJECT")

    # Extend ONLY the topological attachment collar (keyed by original Head vertex weight) into Head,
    # keeping outer ear silhouette (orig_head_w <= 0.22) completely preserved.
    bm.verts.ensure_lookup_table()
    weight_updates = []  # (vert_idx, bname, w_head, w_ear)
    orig_collar_map = {}
    for bname, sgn, vert_set in ear_infos:
        orig_head_w = {}
        for v_idx in vert_set:
            hw = 0.0
            for g in plush.data.vertices[v_idx].groups:
                if g.group == vg_head_idx:
                    hw = g.weight
                    break
            orig_head_w[v_idx] = hw

        shift_world = Vector((-0.015 * sgn, -0.002, -0.006))
        head_center = Vector((0.0, -0.050, 0.645))
        deep_embed_count = 0
        anchored_count = 0
        collar_list = []
        for v_idx in sorted(vert_set):
            v = bm.verts[v_idx]
            hw_orig = orig_head_w[v_idx]
            p = (mw_p @ v.co) + shift_world
            sd, loc, normal = _signed_dist_to_head(head_bvh, p)

            # Slide ONLY the attachment collar straight toward head center (radial shrinkage guarantees zero fold)
            radial_dir = (head_center - p).normalized()
            t_base = _smoothstep(0.28, 0.72, hw_orig)
            if t_base > 0.0 and sd > -0.016:
                push_dist = min(0.115, max(0.0, sd + 0.020) * 1.15) * t_base
                p = p + radial_dir * push_dist
                sd, _, _ = _signed_dist_to_head(head_bvh, p)

            v.co = mw_p_inv @ p

            # Smooth continuous weight curve along ear topology (no discontinuous sd step!)
            w_ear_init = _smoothstep(0.84, 0.16, hw_orig)
            if sd < -0.002 and hw_orig >= 0.65:
                w_ear_init = 0.0

            if sd < -0.001:
                deep_embed_count += 1
            if hw_orig >= 0.72:
                collar_list.append(v_idx)
            orig_head_w[v_idx] = (w_ear_init, sd < -0.003 and hw_orig >= 0.65)

        # Laplacian weight smoothing across connected Ear edges so extreme poses never pinch or streak
        bm.verts.ensure_lookup_table()
        ear_weights = {vi: orig_head_w[vi][0] for vi in vert_set}
        locked_anchors = {vi for vi in vert_set if orig_head_w[vi][1]}
        for _pass in range(6):
            next_w = dict(ear_weights)
            for vi in vert_set:
                if vi in locked_anchors:
                    next_w[vi] = 0.0
                    continue
                v = bm.verts[vi]
                nbrs = [e.other_vert(v).index for e in v.link_edges if e.other_vert(v).index in ear_weights]
                if nbrs:
                    avg = sum(ear_weights[ni] for ni in nbrs) / len(nbrs)
                    next_w[vi] = ear_weights[vi] * 0.45 + avg * 0.55
            ear_weights = next_w

        anchored_count = 0
        for v_idx in sorted(vert_set):
            w_ear = ear_weights[v_idx]
            w_head = 1.0 - w_ear
            if w_head >= 0.999:
                anchored_count += 1
            weight_updates.append((v_idx, bname, w_head, w_ear))

        orig_collar_map[bname] = collar_list
        print(f"EAR_FIX_MESH {bname}: verts={len(vert_set)} embedded(sd<0)={deep_embed_count} anchored(w_head=1)={anchored_count} collar={len(collar_list)}")

    bm.to_mesh(plush.data)
    bm.free()
    plush.data.update()

    vg_head = plush.vertex_groups["Head"]
    for v_idx, bname, w_head, w_ear in weight_updates:
        vg_ear = plush.vertex_groups[bname]
        if w_head > 1e-4:
            vg_head.add([v_idx], w_head, "REPLACE")
        else:
            vg_head.remove([v_idx])
        if w_ear > 1e-4:
            vg_ear.add([v_idx], w_ear, "REPLACE")
        else:
            vg_ear.remove([v_idx])

    for mod in plush.modifiers:
        if mod.type == "ARMATURE":
            mod.use_deform_preserve_volume = True

    bpy.context.view_layer.update()
    return orig_collar_map, sorted(head_verts)


def verify_ear_attachment(rig, plush, ear_collar_map, head_verts):
    """Assert zero root separation on Rest and extreme animated frames across both ears."""
    scene = bpy.context.scene
    prev_action = rig.animation_data.action
    prev_mutes = [t.mute for t in rig.animation_data.nla_tracks]
    prev_frame = scene.frame_current

    rig.animation_data.action = None
    plush_eval_check_frames = [
        ("Idle", 1),
        ("Idle", 16),
        ("JumpStart", 5),
        ("DoubleJump", 9),
        ("Fall", 1),
        ("Fall", 11),
        ("TrampolineFly", 7),
        ("HipDropSlam", 8),
        ("FeverBurst", 8),
        ("VictoryDance", 1),
        ("VictoryDance", 37),
    ]

    worst_gap = -999.0
    worst_case = ""
    head_set = set(head_verts)
    for anim_name, frame_no in plush_eval_check_frames:
        for t in rig.animation_data.nla_tracks:
            t.mute = (t.name != anim_name)
        scene.frame_set(frame_no)
        bpy.context.view_layer.update()
        depsgraph = bpy.context.evaluated_depsgraph_get()
        ob_eval = plush.evaluated_get(depsgraph)
        emesh = ob_eval.to_mesh()
        emw = ob_eval.matrix_world.copy()
        try:
            bm_f = bmesh.new()
            bm_f.from_mesh(emesh)
            bm_f.verts.ensure_lookup_table()
            head_bvh_f = _build_head_bvh_and_signed_dist(bm_f, head_set, emw)
            for bname, collar in ear_collar_map.items():
                gaps = [_signed_dist_to_head(head_bvh_f, emw @ bm_f.verts[vi].co)[0] for vi in collar]
                max_g = max(gaps) if gaps else 0.0
                if max_g > worst_gap:
                    worst_gap = max_g
                    worst_case = f"{anim_name}:f{frame_no}:{bname}"
                assert max_g <= 0.015, f"Ear gap detected in {anim_name} f{frame_no} {bname}: {max_g:.4f}m"
            bm_f.free()
        finally:
            ob_eval.to_mesh_clear()

    for t, m in zip(rig.animation_data.nla_tracks, prev_mutes):
        t.mute = m
    rig.animation_data.action = prev_action
    scene.frame_set(prev_frame)
    bpy.context.view_layer.update()
    collar_summary = {k: len(v) for k, v in ear_collar_map.items()}
    print(f"EAR_VERIFY_OK: collar_sizes={collar_summary} worst_collar_sd={worst_gap:.4f}m ({worst_case})")
    return worst_gap


def build_all_20_animations(rig):
    if rig.animation_data is None:
        rig.animation_data_create()
    # Clear existing actions/tracks
    while len(rig.animation_data.nla_tracks) > 0:
        rig.animation_data.nla_tracks.remove(rig.animation_data.nla_tracks[0])

    specs = {}

    # 1. Idle (60f loop)
    specs["Idle"] = [
        (1,  {"bones": {"Belly": (0, 0, 0), "Head": (0, 2, 0), "Ear.L": (0, 0, 0), "Ear.R": (0, 0, 0), "Arm.L": (0, -4, 0), "Arm.R": (0, 4, 0), "Tail": (0, 0, 8)}, "loc": (0, 0, 0), "scales": {"Belly": (1, 1, 1)}}),
        (16, {"bones": {"Belly": (2, 2, 0), "Head": (-3, -3, 4), "Ear.L": (-6, -8, 4), "Ear.R": (-4, 6, -4), "Arm.L": (4, -8, -4), "Arm.R": (-4, 8, 4), "Tail": (6, 0, -14)}, "loc": (0, 0, -0.012), "scales": {"Belly": (1.02, 0.98, 1.02)}}),
        (31, {"bones": {"Belly": (-2, 0, 0), "Head": (2, 2, -4), "Ear.L": (4, 4, -2), "Ear.R": (4, -4, 2), "Arm.L": (-4, -2, 4), "Arm.R": (4, 2, -4), "Tail": (-4, 0, 14)}, "loc": (0, 0, 0.015), "scales": {"Belly": (0.985, 1.02, 0.985)}}),
        (46, {"bones": {"Belly": (2, -2, 0), "Head": (-2, 4, 5), "Ear.L": (-8, -5, 3), "Ear.R": (-7, 8, -3), "Arm.L": (3, -7, -3), "Arm.R": (-3, 7, 3), "Tail": (5, 0, -10)}, "loc": (0, 0, -0.01), "scales": {"Belly": (1.015, 0.985, 1.015)}}),
        (60, {"bones": {"Belly": (0, 0, 0), "Head": (0, 2, 0), "Ear.L": (0, 0, 0), "Ear.R": (0, 0, 0), "Arm.L": (0, -4, 0), "Arm.R": (0, 4, 0), "Tail": (0, 0, 8)}, "loc": (0, 0, 0), "scales": {"Belly": (1, 1, 1)}}),
    ]

    # 2. Walk (24f loop — cute gentle lean & natural small steps, no torso twist/squash)
    specs["Walk"] = [
        (1,  {"bones": {"Belly": (5, -2.5, 2), "Head": (-3, 1.5, 0), "Ear.L": (-4, 3, 4), "Ear.R": (-4, -3, -4), "Arm.L": (0, -10, -18), "Arm.R": (0, 10, -16), "Foot.L": (-18, 0, 2), "Foot.R": (16, 0, -2), "Tail": (6, 0, 6)}, "loc": (0, 0, 0.008)}),
        (7,  {"bones": {"Belly": (4, 0, 0), "Head": (-2, 0, 0), "Ear.L": (-6, 0, 2), "Ear.R": (-6, 0, -2), "Arm.L": (0, -10, 0), "Arm.R": (0, 10, 0), "Foot.L": (0, 0, 0), "Foot.R": (0, 0, 0), "Tail": (4, 0, 0)}, "loc": (0, 0, -0.004)}),
        (13, {"bones": {"Belly": (5, 2.5, -2), "Head": (-3, -1.5, 0), "Ear.L": (-4, 3, -4), "Ear.R": (-4, -3, 4), "Arm.L": (0, -10, 16), "Arm.R": (0, 10, 18), "Foot.L": (16, 0, 2), "Foot.R": (-18, 0, -2), "Tail": (6, 0, -6)}, "loc": (0, 0, 0.008)}),
        (19, {"bones": {"Belly": (4, 0, 0), "Head": (-2, 0, 0), "Ear.L": (-6, 0, -2), "Ear.R": (-6, 0, 2), "Arm.L": (0, -10, 0), "Arm.R": (0, 10, 0), "Foot.L": (0, 0, 0), "Foot.R": (0, 0, 0), "Tail": (4, 0, 0)}, "loc": (0, 0, -0.004)}),
        (24, {"bones": {"Belly": (5, -2.5, 2), "Head": (-3, 1.5, 0), "Ear.L": (-4, 3, 4), "Ear.R": (-4, -3, -4), "Arm.L": (0, -10, -18), "Arm.R": (0, 10, -16), "Foot.L": (-18, 0, 2), "Foot.R": (16, 0, -2), "Tail": (6, 0, 6)}, "loc": (0, 0, 0.008)}),
    ]

    # 3. Dash (18f loop — cute brisk run with light lean & wind-swept ears, no torso squash)
    specs["Dash"] = [
        (1,  {"bones": {"Belly": (11, -3.5, 3), "Head": (-6, 2, 0), "Ear.L": (-12, 8, 10), "Ear.R": (-12, -8, -10), "Arm.L": (0, -14, -26), "Arm.R": (0, 14, -20), "Foot.L": (-28, 0, 3), "Foot.R": (24, 0, -3), "Tail": (14, 0, 8)}, "loc": (0, 0, 0.020)}),
        (5,  {"bones": {"Belly": (12, 0, 0), "Head": (-5, 0, 0), "Ear.L": (-15, 6, 8), "Ear.R": (-15, -6, -8), "Arm.L": (0, -14, 0), "Arm.R": (0, 14, 0), "Foot.L": (0, 0, 0), "Foot.R": (0, 0, 0), "Tail": (12, 0, 0)}, "loc": (0, 0, -0.006)}),
        (10, {"bones": {"Belly": (11, 3.5, -3), "Head": (-6, -2, 0), "Ear.L": (-12, 8, 10), "Ear.R": (-12, -8, -10), "Arm.L": (0, -14, 20), "Arm.R": (0, 14, 26), "Foot.L": (24, 0, 3), "Foot.R": (-28, 0, -3), "Tail": (14, 0, -8)}, "loc": (0, 0, 0.020)}),
        (14, {"bones": {"Belly": (12, 0, 0), "Head": (-5, 0, 0), "Ear.L": (-15, 6, 8), "Ear.R": (-15, -6, -8), "Arm.L": (0, -14, 0), "Arm.R": (0, 14, 0), "Foot.L": (0, 0, 0), "Foot.R": (0, 0, 0), "Tail": (12, 0, 0)}, "loc": (0, 0, -0.006)}),
        (19, {"bones": {"Belly": (11, -3.5, 3), "Head": (-6, 2, 0), "Ear.L": (-12, 8, 10), "Ear.R": (-12, -8, -10), "Arm.L": (0, -14, -26), "Arm.R": (0, 14, -20), "Foot.L": (-28, 0, 3), "Foot.R": (24, 0, -3), "Tail": (14, 0, 8)}, "loc": (0, 0, 0.020)}),
    ]

    # 4. Brake (14f)
    specs["Brake"] = [
        (1,  {"bones": {"Belly": (10, 0, 0), "Head": (-5, 0, 0), "Arm.L": (0, -18, -30), "Arm.R": (0, 18, 30)}, "loc": (0, 0, 0)}),
        (5,  {"bones": {"Belly": (-22, 0, 0), "Head": (12, 0, 0), "Ear.L": (12, -15, -18), "Ear.R": (12, 15, 18), "Arm.L": (0, -28, 32), "Arm.R": (0, 28, -32), "Foot.L": (-36, -8, -10), "Foot.R": (-36, 8, 10), "Tail": (-16, 0, 0)}, "loc": (0, 0, -0.035), "scales": {"Belly": (1.07, 0.90, 1.07)}}),
        (14, {"bones": {"Belly": (-8, 0, 0), "Head": (5, 0, 0), "Ear.L": (4, -6, -8), "Ear.R": (4, 6, 8), "Arm.L": (0, -10, 8), "Arm.R": (0, 10, -8), "Foot.L": (-10, 0, 0), "Foot.R": (-10, 0, 0)}, "loc": (0, 0, 0)}),
    ]

    # 5. Turn (14f)
    specs["Turn"] = [
        (1,  {"bones": {"Belly": (6, 0, 0), "Head": (0, 0, 0)}, "loc": (0, 0, 0)}),
        (6,  {"bones": {"Belly": (8, -14, 34), "Head": (-4, 8, 48), "Ear.L": (-8, -14, 24), "Ear.R": (-8, 14, -18), "Arm.L": (0, -22, 26), "Arm.R": (0, 22, -45), "Foot.L": (-18, 0, 16), "Foot.R": (16, 0, 16), "Tail": (12, 0, -24)}, "loc": (0, 0, 0.025), "scales": {"Belly": (1.03, 0.97, 1.03)}}),
        (14, {"bones": {"Belly": (0, 0, 0), "Head": (0, 0, 0)}, "loc": (0, 0, 0)}),
    ]

    # 6. JumpStart (12f)
    specs["JumpStart"] = [
        (1,  {"bones": {"Belly": (10, 0, 0), "Head": (8, 0, 0), "Ear.L": (12, 8, 0), "Ear.R": (12, -8, 0), "Arm.L": (0, 18, 0), "Arm.R": (0, -18, 0), "Foot.L": (-15, 0, 0), "Foot.R": (-15, 0, 0)}, "loc": (0, 0, -0.05), "scales": {"Belly": (1.12, 0.84, 1.12)}}),
        (5,  {"bones": {"Belly": (-10, 4, 0), "Head": (-8, -4, 6), "Ear.L": (-18, -26, -8), "Ear.R": (-12, 26, 8), "Arm.L": (0, -42, -16), "Arm.R": (0, 42, 16), "Foot.L": (-42, -16, 4), "Foot.R": (36, 14, -8), "Tail": (26, 0, 10)}, "loc": (0, 0, 0.06), "scales": {"Belly": (0.91, 1.16, 0.91), "Head": (0.97, 1.04, 0.97)}}),
        (12, {"bones": {"Belly": (-8, 3, 0), "Head": (-6, -3, 4), "Ear.L": (-16, -24, -6), "Ear.R": (-12, 24, 6), "Arm.L": (0, -34, -12), "Arm.R": (0, 34, 12), "Foot.L": (-34, -12, 4), "Foot.R": (30, 12, -6), "Tail": (22, 0, 8)}, "loc": (0, 0, 0.04), "scales": {"Belly": (0.94, 1.12, 0.94)}}),
    ]

    # 7. DoubleJump (18f — full 360deg joyful front-flip!)
    specs["DoubleJump"] = [
        (1,  {"spin_x": 0,   "loc": (0, 0, 0.05), "bones": {"Belly": (8, 0, 0), "Arm.L": (0, -30, -20), "Arm.R": (0, 30, 20), "Foot.L": (-35, 0, 0), "Foot.R": (-35, 0, 0)}, "scales": {"Belly": (0.93, 1.12, 0.93)}}),
        (5,  {"spin_x": 90,  "loc": (0, 0, 0.36), "bones": {"Belly": (10, 0, 0), "Head": (12, 0, 0), "Ear.L": (10, 18, 0), "Ear.R": (10, -18, 0), "Arm.L": (0, -35, -35), "Arm.R": (0, 35, 35), "Foot.L": (-48, 0, 0), "Foot.R": (-48, 0, 0)}, "scales": {"Belly": (1.06, 0.92, 1.06)}}),
        (9,  {"spin_x": 180, "loc": (0, 0, 0.56), "bones": {"Belly": (10, 0, 0), "Head": (12, 0, 0), "Ear.L": (12, 20, 0), "Ear.R": (12, -20, 0), "Arm.L": (0, -35, -35), "Arm.R": (0, 35, 35), "Foot.L": (-48, 0, 0), "Foot.R": (-48, 0, 0)}, "scales": {"Belly": (1.08, 0.90, 1.08)}}),
        (13, {"spin_x": 270, "loc": (0, 0, 0.36), "bones": {"Belly": (6, 0, 0), "Head": (6, 0, 0), "Ear.L": (-14, -20, 0), "Ear.R": (-14, 20, 0), "Arm.L": (0, -40, 0), "Arm.R": (0, 40, 0), "Foot.L": (-25, 0, 0), "Foot.R": (25, 0, 0)}}),
        (18, {"spin_x": 360, "loc": (0, 0, 0.02), "bones": {"Belly": (-6, 0, 0), "Head": (-8, 0, 0), "Ear.L": (-18, -24, 0), "Ear.R": (-18, 24, 0), "Arm.L": (0, -36, 0), "Arm.R": (0, 36, 0), "Foot.L": (-24, 0, 0), "Foot.R": (20, 0, 0)}}),
    ]

    # 8. StompBounce (16f)
    specs["StompBounce"] = [
        (1,  {"bones": {"Belly": (4, 0, 0), "Head": (6, 0, 0), "Foot.L": (-10, 0, 0), "Foot.R": (-10, 0, 0)}, "loc": (0, 0, -0.05), "scales": {"Belly": (1.16, 0.78, 1.16)}}),
        (6,  {"bones": {"Belly": (-12, 0, 10), "Head": (-12, -4, -8), "Ear.L": (-20, -30, -10), "Ear.R": (-20, 30, 10), "Arm.L": (0, -52, -14), "Arm.R": (0, 52, 14), "Foot.L": (-36, -12, 0), "Foot.R": (42, 12, 0), "Tail": (28, 0, 12)}, "loc": (0, 0, 0.07), "scales": {"Belly": (0.90, 1.18, 0.90)}}),
        (16, {"bones": {"Belly": (-6, 0, 0), "Head": (-6, 0, 0), "Ear.L": (-14, -20, 0), "Ear.R": (-14, 20, 0), "Arm.L": (0, -34, 0), "Arm.R": (0, 34, 0), "Foot.L": (-24, 0, 0), "Foot.R": (24, 0, 0)}, "loc": (0, 0, 0.03), "scales": {"Belly": (0.96, 1.07, 0.96)}}),
    ]

    # 9. Fall (20f loop, flailing arms & flapping ears)
    specs["Fall"] = [
        (1,  {"bones": {"Belly": (12, 0, 0), "Head": (8, 0, 0), "Ear.L": (-28, -24, 0), "Ear.R": (-22, 24, 0), "Arm.L": (0, -48, 18), "Arm.R": (0, 48, 18), "Foot.L": (24, 0, 0), "Foot.R": (-18, 0, 0), "Tail": (-18, 0, 12)}, "loc": (0, 0, 0)}),
        (11, {"bones": {"Belly": (12, 0, 0), "Head": (8, 0, 0), "Ear.L": (-20, -30, 0), "Ear.R": (-30, 30, 0), "Arm.L": (0, -34, -22), "Arm.R": (0, 34, -22), "Foot.L": (-18, 0, 0), "Foot.R": (24, 0, 0), "Tail": (-18, 0, -12)}, "loc": (0, 0, 0)}),
        (20, {"bones": {"Belly": (12, 0, 0), "Head": (8, 0, 0), "Ear.L": (-28, -24, 0), "Ear.R": (-22, 24, 0), "Arm.L": (0, -48, 18), "Arm.R": (0, 48, 18), "Foot.L": (24, 0, 0), "Foot.R": (-18, 0, 0), "Tail": (-18, 0, 12)}, "loc": (0, 0, 0)}),
    ]

    # 10. Land (12f)
    specs["Land"] = [
        (1,  {"bones": {"Belly": (8, 0, 0), "Head": (8, 0, 0), "Arm.L": (0, -24, 0), "Arm.R": (0, 24, 0)}, "loc": (0, 0, 0.01)}),
        (5,  {"bones": {"Belly": (10, 0, 0), "Head": (10, 0, 0), "Ear.L": (16, 16, 0), "Ear.R": (16, -16, 0), "Arm.L": (0, 20, -14), "Arm.R": (0, -20, 14), "Foot.L": (-16, 0, -8), "Foot.R": (-16, 0, 8)}, "loc": (0, 0, -0.06), "scales": {"Belly": (1.16, 0.78, 1.16), "Head": (1.06, 0.90, 1.06)}}),
        (12, {"bones": {"Belly": (0, 0, 0), "Head": (0, 0, 0)}, "loc": (0, 0, 0), "scales": {"Belly": (1, 1, 1), "Head": (1, 1, 1)}}),
    ]

    # 11. TrampolineFly (24f — ecstatic banzai soar)
    specs["TrampolineFly"] = [
        (1,  {"bones": {"Belly": (6, 0, 0), "Head": (8, 0, 0)}, "loc": (0, 0, -0.05), "scales": {"Belly": (1.14, 0.82, 1.14)}}),
        (7,  {"bones": {"Belly": (-14, 0, 0), "Head": (-18, 0, 0), "Ear.L": (-24, -34, 0), "Ear.R": (-24, 34, 0), "Arm.L": (0, -68, -10), "Arm.R": (0, 68, 10), "Foot.L": (32, -16, 0), "Foot.R": (32, 16, 0), "Tail": (28, 0, 0)}, "loc": (0, 0, 0.08), "scales": {"Belly": (0.89, 1.20, 0.89), "Head": (0.96, 1.06, 0.96)}}),
        (16, {"bones": {"Belly": (-10, 4, 8), "Head": (-14, -4, -6), "Ear.L": (-28, -28, 6), "Ear.R": (-20, 28, -6), "Arm.L": (0, -64, 14), "Arm.R": (0, 64, -14), "Foot.L": (26, -12, 0), "Foot.R": (-18, 12, 0), "Tail": (24, 0, 14)}, "loc": (0, 0, 0.05), "scales": {"Belly": (0.92, 1.14, 0.92)}}),
        (24, {"bones": {"Belly": (-12, 0, 0), "Head": (-15, 0, 0), "Ear.L": (-24, -30, 0), "Ear.R": (-24, 30, 0), "Arm.L": (0, -62, 0), "Arm.R": (0, 62, 0), "Foot.L": (28, -12, 0), "Foot.R": (28, 12, 0)}, "loc": (0, 0, 0.04), "scales": {"Belly": (0.94, 1.10, 0.94)}}),
    ]

    # 12. HipDropStart (16f — snappy midair 360 flip into butt-down poise)
    specs["HipDropStart"] = [
        (1,  {"spin_x": 0,   "loc": (0, 0, 0.04), "bones": {"Belly": (-6, 0, 0), "Arm.L": (0, -32, 0), "Arm.R": (0, 32, 0)}}),
        (5,  {"spin_x": 120, "loc": (0, 0, 0.08), "bones": {"Belly": (14, 0, 0), "Head": (12, 0, 0), "Arm.L": (0, -38, -40), "Arm.R": (0, 38, 40), "Foot.L": (-55, 0, 0), "Foot.R": (-55, 0, 0)}, "scales": {"Belly": (1.07, 0.91, 1.07)}}),
        (10, {"spin_x": 240, "loc": (0, 0, 0.08), "bones": {"Belly": (14, 0, 0), "Head": (12, 0, 0), "Arm.L": (0, -38, -40), "Arm.R": (0, 38, 40), "Foot.L": (-55, 0, 0), "Foot.R": (-55, 0, 0)}}),
        (16, {"spin_x": 360, "loc": (0, 0, 0.02), "bones": {"Belly": (-16, 0, 0), "Head": (18, 0, 0), "Ear.L": (-24, -22, 0), "Ear.R": (-24, 22, 0), "Arm.L": (0, -52, 16), "Arm.R": (0, 52, -16), "Foot.L": (-52, -14, 0), "Foot.R": (-52, 14, 0)}, "scales": {"Belly": (0.95, 1.08, 0.95)}}),
    ]

    # 13. HipDropSlam (14f — vertical plummet then massive puni squash)
    specs["HipDropSlam"] = [
        (1,  {"bones": {"Belly": (-16, 0, 0), "Head": (16, 0, 0), "Ear.L": (-26, -24, 0), "Ear.R": (-26, 24, 0), "Arm.L": (0, -54, 14), "Arm.R": (0, 54, -14), "Foot.L": (-54, -14, 0), "Foot.R": (-54, 14, 0)}, "loc": (0, 0, 0.02), "scales": {"Belly": (0.94, 1.12, 0.94)}}),
        (5,  {"bones": {"Belly": (-12, 0, 0), "Head": (12, 0, 0), "Ear.L": (-28, -20, 0), "Ear.R": (-28, 20, 0), "Arm.L": (0, -58, 12), "Arm.R": (0, 58, -12), "Foot.L": (-58, -14, 0), "Foot.R": (-58, 14, 0)}, "loc": (0, 0, 0.0), "scales": {"Belly": (0.92, 1.14, 0.92)}}),
        (8,  {"bones": {"Belly": (10, 0, 0), "Head": (8, 0, 0), "Ear.L": (18, 26, 0), "Ear.R": (18, -26, 0), "Arm.L": (0, 26, -18), "Arm.R": (0, -26, 18), "Foot.L": (-34, -18, 0), "Foot.R": (-34, 18, 0), "Tail": (-18, 0, 0)}, "loc": (0, 0, -0.02), "scales": {"Belly": (1.24, 0.68, 1.24), "Head": (1.10, 0.84, 1.10)}}),
        (14, {"bones": {"Belly": (4, 0, 0), "Head": (4, 0, 0), "Ear.L": (6, 8, 0), "Ear.R": (6, -8, 0), "Arm.L": (0, 6, 0), "Arm.R": (0, -6, 0)}, "loc": (0, 0, 0.0), "scales": {"Belly": (1.06, 0.92, 1.06), "Head": (1.02, 0.96, 1.02)}}),
    ]

    # 14. RollCharge (12f — tuck into sphere) & 15. RollSpin (16f loop — CoM-centered 360deg spin)
    tucked = {
        "Belly": (18, 0, 0),
        "Head": (16, 0, 0),
        "Ear.L": (12, 22, -8),
        "Ear.R": (12, -22, 8),
        "Arm.L": (-8, 22, -58),
        "Arm.R": (-8, -22, 58),
        "Foot.L": (-48, -10, -6),
        "Foot.R": (-48, 10, 6),
        "Tail": (-24, 0, 0),
    }
    tucked_sc = {"Belly": (1.08, 0.86, 1.08), "Head": (1.02, 0.94, 1.02)}

    # Measure evaluated Plush bounding box center & radius in tucked pose (Root at origin)
    rig.animation_data.action = None
    reset_rig(rig)
    set_bone_world_pose(rig.pose.bones["Root"], (0, 0, 0), loc=(0, 0, 0), scale=(1, 1, 1))
    for bname, ang in tucked.items():
        set_bone_world_pose(rig.pose.bones[bname], ang, loc=(0, 0, 0), scale=tucked_sc.get(bname, (1, 1, 1)))
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    tucked_min, tucked_max, tucked_center = measure_plush_bbox(depsgraph)
    r_roll = (tucked_max.z - tucked_min.z) * 0.5
    root_head = rig.pose.bones["Root"].bone.head_local.copy()
    print(
        f"TUCKED_MEASURED: center=({tucked_center.x:.4f}, {tucked_center.y:.4f}, {tucked_center.z:.4f}) "
        f"z=[{tucked_min.z:.4f}, {tucked_max.z:.4f}] r_roll={r_roll:.4f} "
        f"root_head=({root_head.x:.4f}, {root_head.y:.4f}, {root_head.z:.4f})"
    )
    reset_rig(rig)
    bpy.context.view_layer.update()

    def calc_roll_root_loc(theta_deg):
        q_world = Euler((math.radians(theta_deg), 0.0, 0.0), "XYZ").to_quaternion()
        loc_v = Vector((0.0, 0.0, r_roll)) - root_head - (q_world @ (tucked_center - root_head))
        return (loc_v.x, loc_v.y, loc_v.z)

    roll_loc_0 = calc_roll_root_loc(0.0)
    specs["RollCharge"] = [
        (1,  {"bones": {"Belly": (6, 0, 0)}, "loc": (0, 0, 0)}),
        (12, {"bones": tucked, "loc": roll_loc_0, "scales": tucked_sc}),
    ]

    specs["RollSpin"] = [
        (
            1 + step,
            {
                "spin_x": step * 22.5,
                "loc": calc_roll_root_loc(step * 22.5),
                "bones": tucked,
                "scales": tucked_sc,
            },
        )
        for step in range(17)
    ]

    # 16. WallBounce (14f)
    specs["WallBounce"] = [
        (1,  {"bones": {"Belly": (14, 0, 0), "Head": (10, 0, 0)}, "loc": (0, 0, -0.02), "scales": {"Belly": (1.12, 0.86, 1.12)}}),
        (5,  {"bones": {"Belly": (-18, 0, 12), "Head": (-10, 0, -10), "Ear.L": (12, 18, 0), "Ear.R": (12, -18, 0), "Arm.L": (-14, -32, 34), "Arm.R": (-14, 32, -34), "Foot.L": (-26, 0, 0), "Foot.R": (22, 0, 0)}, "loc": (0, 0, 0.04), "scales": {"Belly": (0.94, 1.10, 0.94)}}),
        (14, {"bones": {"Belly": (0, 0, 0), "Head": (0, 0, 0)}, "loc": (0, 0, 0)}),
    ]

    # 17. FeverBurst (24f — charge then sky-punch burst!)
    specs["FeverBurst"] = [
        (1,  {"bones": {"Belly": (12, 0, 0), "Head": (12, 0, 0), "Arm.L": (0, 22, -24), "Arm.R": (0, -22, 24)}, "loc": (0, 0, -0.05), "scales": {"Belly": (1.14, 0.82, 1.14)}}),
        (8,  {"bones": {"Belly": (-14, 6, 14), "Head": (-18, -6, -10), "Ear.L": (-24, -32, -10), "Ear.R": (-24, 32, 10), "Arm.L": (0, -72, 12), "Arm.R": (0, 72, -12), "Foot.L": (-28, -14, 0), "Foot.R": (28, 14, 0), "Tail": (28, 0, 12)}, "loc": (0, 0, 0.08), "scales": {"Belly": (0.89, 1.20, 0.89), "Arm.L": (1, 1.28, 1), "Arm.R": (1, 1.28, 1)}}),
        (16, {"bones": {"Belly": (-10, -4, -10), "Head": (-14, 4, 8), "Ear.L": (-20, -28, 0), "Ear.R": (-20, 28, 0), "Arm.L": (0, -64, 0), "Arm.R": (0, 64, 0), "Foot.L": (22, -10, 0), "Foot.R": (-22, 10, 0)}, "loc": (0, 0, 0.04), "scales": {"Belly": (0.95, 1.08, 0.95)}}),
        (24, {"bones": {"Belly": (0, 0, 0), "Head": (0, 0, 0), "Arm.L": (0, -40, 0), "Arm.R": (0, 40, 0)}, "loc": (0, 0, 0)}),
    ]

    # 18. Damage (18f — dramatic recoil & flail)
    specs["Damage"] = [
        (1,  {"bones": {"Belly": (-18, 10, -10), "Head": (-14, -12, 14), "Ear.L": (12, 20, -10), "Ear.R": (12, -20, 10), "Arm.L": (-20, -34, -46), "Arm.R": (-20, 34, 46), "Foot.L": (-30, -10, 0), "Foot.R": (20, 10, 0), "Tail": (-18, 0, 10)}, "loc": (0, 0, 0.03), "scales": {"Belly": (1.08, 0.88, 1.08)}}),
        (9,  {"bones": {"Belly": (-22, -8, 10), "Head": (-12, 10, -12), "Ear.L": (16, 22, 8), "Ear.R": (16, -22, -8), "Arm.L": (-16, -42, 34), "Arm.R": (-16, 42, -34), "Foot.L": (22, -12, 0), "Foot.R": (-28, 12, 0), "Tail": (-16, 0, -12)}, "loc": (0, 0, 0.02), "scales": {"Belly": (1.06, 0.90, 1.06)}}),
        (18, {"bones": {"Belly": (-8, 0, 0), "Head": (-6, 0, 0), "Arm.L": (0, -16, 0), "Arm.R": (0, 16, 0)}, "loc": (0, 0, 0)}),
    ]

    # 19. Recover (16f — shake off & pop back upright)
    specs["Recover"] = [
        (1,  {"bones": {"Belly": (14, 0, 0), "Head": (10, 0, 0), "Arm.L": (0, 12, 0), "Arm.R": (0, -12, 0)}, "loc": (0, 0, -0.04), "scales": {"Belly": (1.10, 0.86, 1.10)}}),
        (6,  {"bones": {"Belly": (4, -10, 18), "Head": (0, 14, -22), "Ear.L": (-10, 18, 14), "Ear.R": (-10, -18, -14), "Arm.L": (0, -24, 18), "Arm.R": (0, 24, -18)}, "loc": (0, 0, 0.02)}),
        (11, {"bones": {"Belly": (2, 10, -18), "Head": (0, -14, 22), "Ear.L": (-10, -18, -14), "Ear.R": (-10, 18, 14), "Arm.L": (0, -24, -18), "Arm.R": (0, 24, 18)}, "loc": (0, 0, 0.02)}),
        (16, {"bones": {"Belly": (0, 0, 0), "Head": (0, 0, 0)}, "loc": (0, 0, 0)}),
    ]

    # 20. VictoryDance (48f loop — joyful rhythm dance raising arms toward star!)
    specs["VictoryDance"] = [
        (1,  {"bones": {"Belly": (-4, -10, 10), "Head": (-8, 12, -10), "Ear.L": (-18, -24, 10), "Ear.R": (-10, 18, -10), "Arm.L": (0, -64, 12), "Arm.R": (0, 18, -16), "Foot.L": (-24, 0, 8), "Foot.R": (10, 0, -4), "Tail": (18, 0, 18)}, "loc": (0, 0, 0.03), "scales": {"Belly": (0.95, 1.07, 0.95)}}),
        (13, {"bones": {"Belly": (4, 0, 0), "Head": (2, 0, 0), "Ear.L": (6, 8, 0), "Ear.R": (6, -8, 0), "Arm.L": (0, -32, 0), "Arm.R": (0, 32, 0), "Foot.L": (0, 0, 0), "Foot.R": (0, 0, 0), "Tail": (8, 0, 0)}, "loc": (0, 0, -0.03), "scales": {"Belly": (1.07, 0.91, 1.07)}}),
        (25, {"bones": {"Belly": (-4, 10, -10), "Head": (-8, -12, 10), "Ear.L": (-10, -18, 10), "Ear.R": (-18, 24, -10), "Arm.L": (0, -18, 16), "Arm.R": (0, 64, -12), "Foot.L": (10, 0, 4), "Foot.R": (-24, 0, -8), "Tail": (18, 0, -18)}, "loc": (0, 0, 0.03), "scales": {"Belly": (0.95, 1.07, 0.95)}}),
        (37, {"bones": {"Belly": (-10, 0, 0), "Head": (-14, 0, 0), "Ear.L": (-24, -30, 0), "Ear.R": (-24, 30, 0), "Arm.L": (0, -68, 8), "Arm.R": (0, 68, -8), "Foot.L": (20, -12, 0), "Foot.R": (20, 12, 0), "Tail": (26, 0, 0)}, "loc": (0, 0, 0.07), "scales": {"Belly": (0.91, 1.15, 0.91)}}),
        (48, {"bones": {"Belly": (-4, -10, 10), "Head": (-8, 12, -10), "Ear.L": (-18, -24, 10), "Ear.R": (-10, 18, -10), "Arm.L": (0, -64, 12), "Arm.R": (0, 18, -16), "Foot.L": (-24, 0, 8), "Foot.R": (10, 0, -4), "Tail": (18, 0, 18)}, "loc": (0, 0, 0.03), "scales": {"Belly": (0.95, 1.07, 0.95)}}),
    ]

    # Scale down large ear rotations so ears bounce naturally without pinching the anchored root
    EAR_ROT_SCALE = 0.62
    for anim_frames in specs.values():
        for _f, kwargs in anim_frames:
            bones = kwargs.get("bones")
            if not bones:
                continue
            for eb_name in ("Ear.L", "Ear.R"):
                if eb_name in bones:
                    rx, ry, rz = bones[eb_name]
                    bones[eb_name] = (rx * EAR_ROT_SCALE, ry * EAR_ROT_SCALE, rz * EAR_ROT_SCALE)

    built = []
    for name, frames_data in specs.items():
        act, sf, ef = make_smooth_action(rig, name, frames_data)
        built.append((name, act, sf, ef))

    # Clear active action so NLA tracks drive export cleanly
    rig.animation_data.action = None
    reset_rig(rig)
    bpy.context.view_layer.update()

    # Verify RollSpin center-of-mass stability across 1, 5, 9, 13, 17
    verify_rollspin_center(rig, target_frames=(1, 5, 9, 13, 17))
    return built


def unhide_all_face_parts():
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
    bpy.context.view_layer.update()
    return presets, set(all_parts)


def postprocess_glb(glb_path, presets, all_part_names):
    raw = glb_path.read_bytes()
    json_len = struct.unpack_from("<I", raw, 12)[0]
    doc = json.loads(raw[20:20 + json_len])

    active = set(presets["Sleep"])
    found_parts = set()
    for node in doc.get("nodes", []):
        nname = node.get("name")
        if nname in all_part_names:
            found_parts.add(nname)
            node.setdefault("extensions", {})[VISIBILITY_EXT] = {"visible": nname in active}

    missing_parts = all_part_names - found_parts
    assert not missing_parts, f"Missing face meshes in GLB: {missing_parts}"

    if VISIBILITY_EXT not in doc.setdefault("extensionsUsed", []):
        doc["extensionsUsed"].append(VISIBILITY_EXT)

    # Verify animations and bones
    anim_names = [a.get("name") for a in doc.get("animations", [])]
    expected_anims = [
        "Idle", "Walk", "Dash", "Brake", "Turn",
        "JumpStart", "DoubleJump", "StompBounce", "Fall", "Land", "TrampolineFly",
        "HipDropStart", "HipDropSlam", "RollCharge", "RollSpin", "WallBounce",
        "FeverBurst", "Damage", "Recover", "VictoryDance",
    ]
    missing_anims = set(expected_anims) - set(anim_names)
    assert not missing_anims, f"Missing animations in GLB: {missing_anims} (got {anim_names})"

    for anim in doc.get("animations", []):
        assert len(anim.get("channels", [])) > 0, f"Empty channels in anim {anim.get('name')}"

    node_names = {n.get("name") for n in doc.get("nodes", [])}
    missing_bones = set(BONE_NAMES) - node_names
    assert not missing_bones, f"Missing bones in GLB: {missing_bones}"

    doc["scenes"][doc.get("scene", 0)].setdefault("extras", {})["defaultExpression"] = "Sleep"

    chunk = json.dumps(doc, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    chunk += b" " * (-len(chunk) % 4)
    rest = raw[20 + json_len:]
    total_len = 20 + len(chunk) + len(rest)
    glb_path.write_bytes(struct.pack("<4sIIII", b"glTF", 2, total_len, len(chunk), 0x4E4F534A) + chunk + rest)
    return anim_names, sorted(found_parts)


def render_preview_sheet(rig, presets):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in [e.identifier for e in scene.render.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE"
    scene.render.resolution_x = 480
    scene.render.resolution_y = 480
    scene.render.film_transparent = False
    if scene.world is None:
        scene.world = bpy.data.worlds.new("PreviewWorld")
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.78, 0.90, 0.99, 1.0)
        bg.inputs[1].default_value = 1.1

    cam_data = bpy.data.cameras.new("PreviewCam")
    cam_data.lens = 45
    cam_obj = bpy.data.objects.new("PreviewCam", cam_data)
    scene.collection.objects.link(cam_obj)
    cam_obj.location = (1.35, -2.55, 0.95)
    direction = Vector((0, 0, 0.45)) - cam_obj.location
    cam_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam_obj

    sun_data = bpy.data.lights.new("PreviewSun", type="SUN")
    sun_data.energy = 2.6
    sun_obj = bpy.data.objects.new("PreviewSun", sun_data)
    scene.collection.objects.link(sun_obj)
    sun_obj.rotation_euler = (math.radians(48), math.radians(15), math.radians(-30))

    paper = bpy.data.objects.get("Warm paper")
    if paper:
        paper.hide_render = True

    shots = [
        ("Idle", 1, "Sleep"),
        ("Walk", 1, "Sleep"),
        ("Walk", 13, "Sleep"),
        ("Dash", 1, "Ganbaru"),
        ("Dash", 10, "Ganbaru"),
        ("RollCharge", 12, "Ganbaru"),
        ("RollSpin", 1, "Ganbaru"),
        ("RollSpin", 5, "Ganbaru"),
        ("RollSpin", 9, "Ganbaru"),
        ("RollSpin", 13, "Ganbaru"),
        ("DoubleJump", 9, "Happy"),
        ("VictoryDance", 37, "Fever"),
    ]

    tmp_dir = GAME_ROOT / "blender" / "_tmp_anim"
    tmp_dir.mkdir(parents=True, exist_ok=True)

    rendered_paths = []
    for anim_name, frame_no, expr in shots:
        for t in rig.animation_data.nla_tracks:
            t.mute = (t.name != anim_name)
        scene.frame_set(frame_no)
        active = set(presets[expr])
        for ob in bpy.data.objects:
            if ob and ob.name.startswith("Face_"):
                ob.hide_render = ob.name not in active
                ob.hide_viewport = ob.name not in active
        bpy.context.view_layer.update()

        img_path = tmp_dir / f"{anim_name}_f{frame_no:02d}_{expr}.png"
        scene.render.filepath = str(img_path)
        bpy.ops.render.render(write_still=True)
        rendered_paths.append(str(img_path))

    print("PREVIEW_IMAGES:", rendered_paths)


def render_ear_qa_closeups(rig, presets):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in [e.identifier for e in scene.render.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE"
    scene.render.resolution_x = 640
    scene.render.resolution_y = 640
    scene.render.film_transparent = False
    bg = scene.world.node_tree.nodes.get("Background") if scene.world and scene.world.use_nodes else None
    if bg:
        bg.inputs[0].default_value = (0.36, 0.48, 0.62, 1.0)
        bg.inputs[1].default_value = 0.85
    sun = bpy.data.objects.get("PreviewSun")
    if sun and sun.data:
        sun.data.energy = 1.15

    cam_data = bpy.data.cameras.new("EarQACam")
    cam_data.lens = 50
    cam_obj = bpy.data.objects.new("EarQACam", cam_data)
    scene.collection.objects.link(cam_obj)
    scene.camera = cam_obj

    qa_dir = GAME_ROOT / "blender" / "_tmp_ear_qa"
    qa_dir.mkdir(parents=True, exist_ok=True)

    # (filename, anim_name, frame_no, expr, cam_loc, target)
    angles = [
        ("qa_front_full.png", "Idle", 1, "Sleep", (0.0, -2.25, 0.72), (0.0, -0.05, 0.62)),
        ("qa_idle_front_L.png", "Idle", 1, "Sleep", (0.78, -0.82, 1.02), (0.28, -0.05, 0.84)),
        ("qa_idle_back_L.png", "Idle", 1, "Sleep", (0.80, 0.74, 1.02), (0.26, -0.05, 0.84)),
        ("qa_idle_front_R.png", "Idle", 1, "Sleep", (-0.78, -0.82, 1.02), (-0.28, -0.05, 0.84)),
        ("qa_fall_L.png", "Fall", 11, "Panic", (0.95, -0.95, 1.08), (0.22, -0.08, 0.82)),
        ("qa_victory_L.png", "VictoryDance", 37, "Happy", (0.88, -0.90, 1.12), (0.22, -0.05, 0.86)),
    ]

    qa_paths = []
    for fname, anim_name, frame_no, expr, cloc, ctarget in angles:
        for t in rig.animation_data.nla_tracks:
            t.mute = (t.name != anim_name)
        scene.frame_set(frame_no)
        active = set(presets[expr])
        for ob in bpy.data.objects:
            if ob and ob.name.startswith("Face_"):
                ob.hide_render = ob.name not in active
                ob.hide_viewport = ob.name not in active
        cam_obj.location = cloc
        direction = Vector(ctarget) - cam_obj.location
        cam_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        bpy.context.view_layer.update()
        out_path = qa_dir / fname
        scene.render.filepath = str(out_path)
        bpy.ops.render.render(write_still=True)
        qa_paths.append(str(out_path))
    print("EAR_QA_IMAGES:", qa_paths)


def collect_objects_recursive(col):
    out = []
    for ob in col.objects:
        if ob is not None:
            out.append(ob)
    for child in col.children:
        out.extend(collect_objects_recursive(child))
    return out


def main():
    OUT_BLEND.parent.mkdir(parents=True, exist_ok=True)
    OUT_GLB.parent.mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.open_mainfile(filepath=str(SOURCE_BLEND))
    scene = bpy.context.scene
    scene.render.fps = 30

    rig = bpy.data.objects["Manmarubuu"]
    plush = bpy.data.objects["Plush"]
    presets, all_part_names = unhide_all_face_parts()
    ear_vert_map, head_verts = fix_ear_attachment(rig, plush)
    build_all_20_animations(rig)
    verify_ear_attachment(rig, plush, ear_vert_map, head_verts)

    bpy.ops.wm.save_as_mainfile(filepath=str(OUT_BLEND), compress=True)

    cast = bpy.data.collections["Manmarubuu | Character"]
    cast_objs = collect_objects_recursive(cast)
    print("CAST_OBJECTS:", [o.name for o in cast_objs])
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.select_all(action="DESELECT")
    for ob in cast_objs:
        ob.hide_viewport = False
        ob.hide_render = False
        ob.hide_set(False)
        ob.select_set(True)
    bpy.context.view_layer.objects.active = rig

    bpy.ops.export_scene.gltf(
        filepath=str(OUT_GLB),
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
        export_tangents=True,
        export_image_format="AUTO",
        export_rest_position_armature=True,
    )

    anim_names, parts = postprocess_glb(OUT_GLB, presets, all_part_names)
    render_preview_sheet(rig, presets)
    render_ear_qa_closeups(rig, presets)

    print("===MANMARUBUU_EXPORT_OK===")
    print("GLB_BYTES:", OUT_GLB.stat().st_size)
    print("ANIM_COUNT:", len(anim_names), anim_names)
    print("FACE_PARTS_COUNT:", len(parts))


if __name__ == "__main__":
    main()
