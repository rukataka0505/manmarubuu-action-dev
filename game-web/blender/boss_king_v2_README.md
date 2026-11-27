# CLOCKWORK TOY KING v2

Original procedural Blender 5.2 model, based on the supplied art bible images
`03_boss_clockwork_toy_king.jpg` and `09_target_map_boss_arena.jpg`.

## Artifacts

- `boss_king_v2.glb`: self-contained model; 55,452 triangles, 12 embedded images.
- `boss_king_v2.blend`: editable model source before preview-only imports.
- `boss_v2_preview.png`: existing asset, new front, new back, and three-quarter
  scale comparison with the supplied 1.00 m Manmarubuu.
- `boss_v2_motion_qa.png`: windup, slam, walking/key rotation and exploded armour.
- `boss_v2_qa.json`: build, hierarchy, bounds, export and preview measurements.
- `boss_v2_runtime_qa.json`: independent inspection of actual GLB vertex buffers,
  normals, tangents, triangles, joint orbits, key axis and armour origins.

## Rebuild

The script's default output is exactly the requested staging destination:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --python-exit-code 1 --python .\build_boss_king_v2.py
```

This session only permits writing under `game-web/blender`. The attempt to save
in `public/models/ai/boss_king_v2.glb` was denied. The completed model is therefore
saved alongside this README, using an explicit output override:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --python-exit-code 1 --python .\build_boss_king_v2.py -- --output .\boss_king_v2.glb
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --python-exit-code 1 --python .\verify_boss_king_v2.py
```

To place the finished model at the requested staging path from a shell with
write access there:

```powershell
Copy-Item -LiteralPath .\boss_king_v2.glb -Destination ..\public\models\ai\boss_king_v2.glb
```

The original `boss_king.glb`, game code and model manifest are unchanged.
The script refuses any export filename other than `boss_king_v2.glb`.

## Model contract

Blender units are metres. Measured exported dimensions are approximately
4.460 m X, 3.072 m depth and 6.022 m height, with the sole plane at zero.
Front is Blender -Y / glTF +Z; back is Blender +Y / glTF -Z.
Export uses `export_yup=True`, `export_apply=True`, `export_tangents=True`.

`BossRoot > Pelvis > Torso > Head` is preserved. Pelvis is at 1.95 m, matching
the runtime reset. Shoulder nodes have identity rotation and pivots at the
shoulder balls. Leg nodes pivot at the hips. The back key's identity glTF basis
places its shaft on local Z, compatible with Three.js `rotation.z`. Its bows
and scrolls occupy Blender XZ planes. All eight detachable assemblies are
distinct meshes with centred origins; their raised trim and decorations are
part of the same detachable geometry. Five skirt panels are modelled, with the
two rear panels combined into the required `Armor_Skirt_B` detachable assembly.

Geometry is authored entirely in the generator. Painted wood colour and
roughness textures are generated deterministically. The only loaded model
surface maps are supplied `coated_pine/nor_gl.jpg` and
`oak_veneer_01/nor_gl.jpg`. Gold has metallic 0.92 and roughness 0.16.
No third-party mesh is used in the boss. The supplied hero and existing boss
are imported only after export for preview comparison, and are excluded from
the delivered model and its triangle count.

The preview renders a clean round-trip import of the exported GLB in EEVEE.
Hero normalization measures evaluated visible source meshes, excluding the
Blender importer's generated armature display shape. The hero uses its supplied
Sleep expression and is grounded at zero. Pose QA uses the literal game angles;
the Three.js key Z rotation is converted to Blender -Y for the preview.

The independent buffer checks and rendered poses verify asset behavior. No
interactive battle in the running game was performed in this session.
