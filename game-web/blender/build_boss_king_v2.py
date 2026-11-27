"""Original procedural CLOCKWORK TOY KING, Blender 5.2.

Run: blender.exe --background --python build_boss_king_v2.py
Optional arguments after --: --skip-preview, --output <staging.glb>.
The game and original boss asset are never modified. All boss geometry and
painted grain are authored here; the supplied hero is preview-only.
"""
import argparse
import hashlib
import json
import math
import struct
import subprocess
import tempfile
import uuid
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
GAME = HERE.parent
OUT = GAME / 'public/models/ai/boss_king_v2.glb'
PBR = GAME / 'public/textures/pbr'
HERO = GAME / 'public/models/manmarubuu_animated.glb'
PI = math.pi
TAU = PI * 2
REPORT = {}


def material(name, color, metal=0, rough=.4, coat=.15, emission=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    p.inputs['Coat Weight'].default_value = coat
    p.inputs['Coat Roughness'].default_value = .25
    if emission:
        p.inputs['Emission Color'].default_value = (*color, 1)
        p.inputs['Emission Strength'].default_value = emission
    return m


def image_from_array(name, data, noncolor=False):
    h, w = data.shape[:2]
    image = bpy.data.images.new(name, width=w, height=h, alpha=False)
    if noncolor:
        image.colorspace_settings.name = 'Non-Color'
    rgba = np.ones((h, w, 4), dtype=np.float32)
    rgba[:, :, :3] = data
    image.pixels.foreach_set(rgba.ravel())
    image.pack()
    return image


def wood(name, base, variation, rough=.42, normal_source='coated_pine'):
    """Seeded, tileable long fibres, wandering growth rings, pores and paint wear."""
    s = 768
    y, x = np.mgrid[0:s, 0:s].astype(float) / s
    rng = np.random.default_rng(37)
    warp = x + .012*np.sin(TAU*y) + .005*np.sin(TAU*3*y + TAU*x)
    rings = np.sin(TAU*(warp*16 + .12*np.sin(TAU*2*y)))
    fibres = np.sin(TAU*(warp*73 + .12*np.sin(TAU*5*y)))
    fine = np.sin(TAU*(warp*181 + .06*np.sin(TAU*9*y)))
    pores = np.clip(rng.normal(0, 1, (s, s)), -2, 2)
    grain = .35*rings + .28*fibres + .12*fine + .065*pores
    # A softly figured knot, restrained under the royal paint.
    dx, dy = (x-.63)*2.3, (y-.43)*.42
    rad = np.sqrt(dx*dx + dy*dy + .0002)
    knot = np.sin(rad*180) * np.exp(-(dx*dx*90 + dy*dy*45))
    grain += .15*knot
    color = np.clip(np.array(base)[None,None,:]*(1 + variation*grain[:,:,None]), .001, .95)
    tex = image_from_array(name+'_painted_grain', color)
    m = material(name, base, .025, rough, .22)
    nt, p = m.node_tree, m.node_tree.nodes['Principled BSDF']
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = tex
    nt.links.new(t.outputs['Color'], p.inputs['Base Color'])
    normal_path = PBR / normal_source / 'nor_gl.jpg'
    if normal_path.exists():
        im = bpy.data.images.load(str(normal_path), check_existing=True)
        im.colorspace_settings.name = 'Non-Color'
        if im.size[0] > 768:
            im.scale(768, 768)
        im.pack()
        tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = im
        nm = nt.nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = .055
        nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], p.inputs['Normal'])
    # Directly linked image roughness is portable through glTF's ORM packer.
    r = np.clip(rough + grain*.018, .24, .7)
    ri = image_from_array(name+'_roughness', np.repeat(r[:,:,None],3,axis=2), True)
    rt = nt.nodes.new('ShaderNodeTexImage'); rt.image = ri
    nt.links.new(rt.outputs['Color'], p.inputs['Roughness'])
    return m


def empty(name, parent=None, loc=(0,0,0)):
    o = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(o)
    o.parent = parent
    o.location = loc
    o.empty_display_size = .14
    return o


def uv_map(me):
    uv = me.uv_layers.new(name='GrainUV')
    for p in me.polygons:
        n = p.normal
        axis = max(range(3), key=lambda i: abs(n[i]))
        for li in p.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            if axis == 1:
                u, w = v.x, v.z
            elif axis == 0:
                u, w = v.y, v.z
            else:
                u, w = v.x, v.y
            uv.data[li].uv = (u*.8+.37, w*.48+.23)


def mesh(name, verts, faces, mat, parent=None, loc=(0,0,0), rot=(0,0,0), bevel=0, smooth=True):
    me = bpy.data.meshes.new(name+'_mesh')
    me.from_pydata(verts, [], faces); me.update()
    # Consistent outward normals for custom closed surfaces.
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o)
    o.parent = parent; o.location = loc; o.rotation_euler = rot
    me.materials.append(mat)
    uv_map(me)
    for p in me.polygons: p.use_smooth = smooth
    if bevel:
        mod = o.modifiers.new('Hand softened wooden edges', 'BEVEL')
        mod.width = bevel; mod.segments = 2; mod.limit_method = 'ANGLE'
        mod.angle_limit = .55
        mod = o.modifiers.new('Crafted surface normals', 'WEIGHTED_NORMAL')
        mod.keep_sharp = True; mod.weight = 40
    return o


def box(name, size, mat, parent=None, loc=(0,0,0), bevel=.04, rot=(0,0,0)):
    x,y,z = [s/2 for s in size]
    v=[(-x,-y,-z),(x,-y,-z),(x,y,-z),(-x,y,-z),(-x,-y,z),(x,-y,z),(x,y,z),(-x,y,z)]
    f=[(0,3,2,1),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)]
    return mesh(name,v,f,mat,parent,loc,rot,bevel)


def cyl(name, radius, depth, mat, parent=None, loc=(0,0,0), rot=(0,0,0), top=None, n=32, bevel=.014):
    top = radius if top is None else top
    v=[]
    for z,r in [(-depth/2,radius),(depth/2,top)]:
        v.extend([(r*math.cos(TAU*i/n),r*math.sin(TAU*i/n),z) for i in range(n)])
    f=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]
    f.extend([(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)])
    return mesh(name,v,f,mat,parent,loc,rot,bevel)


def sphere(name, scale, mat, parent=None, loc=(0,0,0), n=24, rings=12, rot=(0,0,0)):
    # Unique poles avoid zero area faces at the tips.
    v=[(0,0,-scale[2])]
    for j in range(1,rings):
        a = PI*j/rings
        for i in range(n):
            b=TAU*i/n
            v.append((scale[0]*math.sin(a)*math.cos(b),scale[1]*math.sin(a)*math.sin(b),-scale[2]*math.cos(a)))
    v.append((0,0,scale[2])); last=len(v)-1
    f=[(0,1+(i+1)%n,1+i) for i in range(n)]
    for j in range(rings-2):
        for i in range(n):
            a=1+j*n+i; b=1+j*n+(i+1)%n
            f.append((a,b,b+n,a+n))
    f.extend([(last,last-1-(i+1)%n,last-1-i) for i in range(n)])
    return mesh(name,v,f,mat,parent,loc,rot)


def tube(name, points, radius, mat, parent=None, loc=(0,0,0), closed=False, sides=8):
    pts = [Vector(p) for p in points]; v=[]; f=[]
    for i,p in enumerate(pts):
        if closed: t=(pts[(i+1)%len(pts)]-pts[(i-1)%len(pts)]).normalized()
        else: t=(pts[min(i+1,len(pts)-1)]-pts[max(0,i-1)]).normalized()
        normal=t.cross(Vector((0,1,0)))
        if normal.length < .01: normal=t.cross(Vector((1,0,0)))
        normal.normalize(); binormal=t.cross(normal).normalized()
        r=radius[i] if isinstance(radius,list) else radius
        for k in range(sides):
            a=TAU*k/sides; v.append(tuple(p+r*(normal*math.cos(a)+binormal*math.sin(a))))
    for i in range(len(pts) if closed else len(pts)-1):
        for k in range(sides):
            f.append((i*sides+k,i*sides+(k+1)%sides,((i+1)%len(pts))*sides+(k+1)%sides,((i+1)%len(pts))*sides+k))
    if not closed:
        f.extend([tuple(range(sides-1,-1,-1)),tuple((len(pts)-1)*sides+k for k in range(sides))])
    return mesh(name,v,f,mat,parent,loc)


def ring(name, radius, minor, mat, parent=None, loc=(0,0,0), rot=(0,0,0), n=48, sides=8):
    # XY torus; rotate for a vertical XZ ring.
    o=tube(name,[(radius*math.cos(TAU*i/n),radius*math.sin(TAU*i/n),0) for i in range(n)],minor,mat,parent,loc,True,sides)
    o.rotation_euler=rot
    return o


def profile(name, outline, depth, mat, parent=None, loc=(0,0,0), bevel=.035, rot=(0,0,0)):
    """Extruded XZ polygon. Its front is -Y."""
    n=len(outline)
    v=[(x,y,z) for y in [-depth/2,depth/2] for x,z in outline]
    f=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]
    f += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(name,v,f,mat,parent,loc,rot,bevel)


def frame(name, outline, inset, depth, mat, parent, loc=(0,0,0), bevel=.02):
    """A real hollow raised frame, not a gold plate beneath a blue slab."""
    n=len(outline)
    cx=sum(p[0] for p in outline)/n; cz=sum(p[1] for p in outline)/n
    inner=[]
    for x,z in outline:
        r=math.hypot(x-cx,z-cz)
        k=max(.1,(r-inset)/r)
        inner.append((cx+(x-cx)*k,cz+(z-cz)*k))
    v=[(x,y,z) for y in [-depth/2,depth/2] for loop in [outline,inner] for x,z in loop]
    f=[]
    for i in range(n):
        j=(i+1)%n
        f += [(i,j,n+j,n+i),(2*n+i,3*n+i,3*n+j,2*n+j),(i,2*n+i,2*n+j,j),(n+i,n+j,3*n+j,3*n+i)]
    return mesh(name,v,f,mat,parent,loc,bevel=bevel)


def gear(name, r, depth, teeth, mat, parent, loc, rot=(0,0,0), spokes=6):
    n=teeth*4; v=[]; f=[]
    for z in [-depth/2,depth/2]:
        for inner in [False,True]:
            for i in range(n):
                a=TAU*i/n; rr=r*.67 if inner else r*(1 if i%4 in [1,2] else .87)
                v.append((rr*math.cos(a),rr*math.sin(a),z))
    for i in range(n):
        j=(i+1)%n
        f += [(i,j,n+j,n+i),(2*n+i,3*n+i,3*n+j,2*n+j),(i,2*n+i,2*n+j,j),(n+i,n+j,3*n+j,3*n+i)]
    o=mesh(name,v,f,mat,parent,loc,rot,smooth=False)
    for i in range(spokes):
        a=TAU*i/spokes
        box(name+'_spoke',(.15*r,.67*r,depth*.8),mat,o,(.33*r*math.cos(a),.33*r*math.sin(a),0),.012,rot=(0,0,a-PI/2))
    cyl(name+'_hub',r*.24,depth*1.35,mat,o,bevel=.012,n=20)
    cyl(name+'_axle',r*.095,depth*1.5,DARK,o,bevel=.006,n=16)
    ring(name+'_machined_rim',r*.73,r*.025,GOLD,o,(0,0,-depth*.52),n=teeth*3,sides=6)
    return o


def bolt(name, parent, loc, radius=.04, rot=(PI/2,0,0), mat=None):
    mat=mat or BRASS
    o=cyl(name,radius,.033,mat,parent,loc,rot,n=12,bevel=.006)
    box(name+'_slot',(radius*1.22,.009,.006),DARK,o,(0,0,.019),.002)
    return o


def shell(name, sections, mat, parent, loc=(0,0,0), n=48):
    """Closed elliptical lathe (z, x radius, y radius)."""
    v=[]; f=[]
    for z,rx,ry in sections:
        for i in range(n):
            a=TAU*i/n
            v.append((rx*math.cos(a),ry*math.sin(a),z))
    for j in range(len(sections)-1):
        for i in range(n):
            a=j*n+i; b=j*n+(i+1)%n
            f.append((a,b,b+n,a+n))
    f += [tuple(range(n-1,-1,-1)),tuple((len(sections)-1)*n+i for i in range(n))]
    return mesh(name,v,f,mat,parent,loc)


def pauldron(side, sx, shoulder):
    """Barrel-vaulted wood cap, front/back arched borders and flared hems."""
    center=(sx*.22,0,.12)
    # Parametric arch cross section in YZ, extended radially along X.
    v=[]; f=[]; rings=[]; n=28
    for x,ry,rz in [(-.58,.73,.66),(-.51,.76,.69),(.45,.70,.65),(.58,.66,.59)]:
        rr=[]
        for i in range(n+1):
            a=PI*i/n
            rr.append(len(v)); v.append((x,ry*math.cos(a),-.32+rz*math.sin(a)))
        rings.append(rr)
    for j in range(3):
        for i in range(n):f.append((rings[j][i],rings[j+1][i],rings[j+1][i+1],rings[j][i+1]))
    f.append(tuple(reversed(rings[0]))); f.append(tuple(rings[-1]))
    f.append((rings[0][0],rings[-1][0],rings[-1][-1],rings[0][-1]))
    o=mesh('Armor_Shoulder_'+side,v,f,BLUE,shoulder,center,bevel=.025)
    # Raised rectangular wooden arch mouldings, with rounded bevels, not tubes.
    for x in [-.54,.52]:
        vv=[];ff=[];nn=33
        for xx,dr in [(x-.075,-.035),(x+.075,-.035),(x+.075,.075),(x-.075,.075)]:
            vv.extend([(xx,(.735+dr)*math.cos(PI*i/(nn-1)),-.32+(.685+dr)*math.sin(PI*i/(nn-1))) for i in range(nn)])
        for k in range(4):
            for i in range(nn-1):ff.append((k*nn+i,k*nn+i+1,((k+1)%4)*nn+i+1,((k+1)%4)*nn+i))
        ff += [(0,nn,2*nn,3*nn),(nn-1,2*nn-1,3*nn-1,4*nn-1)]
        mesh('Pauldron_bevelled_wooden_arch_'+side,vv,ff,CREAM,o,bevel=.022)
    for y in [-.73,.73]:
        box('Pauldron_flanged_hem_'+side,(1.26,.17,.17),CREAM,o,(0,y,-.31),.045)
    # Delicate incised edging sits inboard of the heavy wooden trim.
    pts=[(.36,.708*math.cos(PI*i/28),-.32+.664*math.sin(PI*i/28)) for i in range(29)]
    tube('Pauldron_carved_line_'+side,pts,.012,BLUE_EDGE,o,sides=6)
    for y in [-.67,.67]:
        bolt('Shoulder_fixing_'+side,o,(-sx*.44,y,-.22),.038)
    return o


def tasset(name, parent, loc, angle, width=.83):
    outline=[(-width*.42,.38),(width*.42,.38),(width*.56,-.27),(0,-.53),(-width*.56,-.27)]
    o=profile(name,outline,.15,BLUE,parent,loc,.035,rot=(math.radians(-13),0,angle))
    frame(name+'_cream_raised_edge',outline,.115,.095,CREAM,o,(0,-.10,0),.024)
    inner=[(x*.73,z*.73) for x,z in outline]
    tube(name+'_incised_inner',[(x,-.086,z) for x,z in inner],.009,BLUE_EDGE,o,closed=True,sides=5)
    for x in [-width*.25,width*.25]:
        bolt(name+'_hinge_pin',o,(x,-.12,.29),.03)
    box(name+'_leather_hinge',(.17,.10,.22),WALNUT,o,(0,.025,.40),.025)
    return o


def build():
    global BLUE, CREAM, WALNUT, PALE, BRASS, GOLD, DARK, STEEL, EYE, GEM, BLUE_EDGE, PLUME
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system='METRIC'
    BLUE=wood('Royal blue | painted carved pine',(.062,.112,.245),.10,.44)
    CREAM=wood('Golden cream | raised wooden mouldings',(.76,.60,.35),.09,.43)
    WALNUT=wood('Dark walnut | articulated gauntlets',(.22,.09,.039),.25,.46,'oak_veneer_01')
    PALE=wood('Pale maple | exposed toy limbs',(.60,.45,.285),.15,.48)
    BLUE_EDGE=material('Blue carved edge patina',(.086,.142,.27),.03,.49)
    PLUME=wood('Layered indigo wooden feather',(.065,.11,.23),.19,.45)
    BRASS=material('Antique machined brass',(.62,.36,.095),.82,.27)
    GOLD=material('Wind-up key | polished gold',(.86,.55,.13),.92,.16,.23)
    DARK=material('Oiled clockwork shadow',(.022,.027,.032),.68,.36)
    STEEL=material('Warm brushed pewter visor',(.34,.33,.27),.76,.30)
    EYE=material('Warm amber eye glow',(1,.48,.025),.12,.23,0,2.4)
    GEM=material('Crown cabochon | sapphire',(.015,.10,.35),.30,.15,.7)
    root=empty('BossRoot')
    root['front_axis']='Blender -Y / glTF +Z'
    root['authoring']='Original procedural geometry; build_boss_king_v2.py'
    pelvis=empty('Pelvis',root,(0,0,1.95))
    torso=empty('Torso',pelvis,(0,0,.61))
    # The actual torso is chamfered, tapering down around a visible waist cavity.
    hull=[(-.91,.13),(.91,.13),(1.11,.43),(1.16,1.25),(.75,1.56),(-.75,1.56),(-1.16,1.25),(-1.11,.43)]
    profile('Chamfered blue chest carcass',hull,1.34,BLUE,torso,bevel=.11)
    # Eight sided detachable breast shield with a wooden trim frame and centre keel.
    shield=[(-.99,.18),(.99,.18),(1.13,.45),(1.08,1.27),(.70,1.51),(-.70,1.51),(-1.08,1.27),(-1.13,.45)]
    chest=profile('ChestFrontShield',[(x,z-.84) for x,z in shield],.13,BLUE,torso,(0,-.722,.84),.055)
    framed=[(x*.97,(z-.84)*.97) for x,z in shield]
    frame('Chest continuous cream moulding',framed,.055,.065,CREAM,chest,(0,-.09,0),.015)
    keel=[(-.32,.66),(.32,.66),(.36,.28),(.29,-.52),(0,-.61),(-.29,-.52),(-.36,.28)]
    profile('Central raised cream breast keel',keel,.12,CREAM,chest,(0,-.125,0),.045)
    # Subtle engraved seams that follow the chamfered construction.
    for sx in [-1,1]:
        tube('Carved chest panel seam',[(sx*.36,-.804,1.26),(sx*.88,-.804,1.08),(sx*.90,-.804,.43),(sx*.50,-.804,.25)],.012,BLUE_EDGE,torso,sides=6)
    # Clean rear access cover, with four broad screw heads around the key mount.
    profile('Rear blue access panel',[(-.93,.26),(.93,.26),(1.02,1.30),(.70,1.47),(-.70,1.47),(-1.02,1.30)],.08,BLUE,torso,(0,.705,0),.045)
    for x in [-.81,.81]:
        for z in [.34,1.27]:bolt('Back access screw',torso,(x,.768,z),.065,(-PI/2,0,0))
    # Hollow-looking collar with dark interior and solid brass rim.
    cyl('Neck dark bearing',.52,.33,DARK,torso,(0,0,1.51),n=40)
    ring('Brass collar annulus',.70,.105,BRASS,torso,(0,0,1.55),n=56,sides=10)
    ring('Collar polished upper lip',.70,.023,GOLD,torso,(0,0,1.64),n=56)
    for i in range(12):
        a=TAU*i/12
        sphere('Collar rivet',(.038,.038,.031),GOLD,torso,(.724*math.cos(a),.724*math.sin(a),1.625),n=12,rings=6)
    # The large front cog is visible in an open waist gap, with offset pinions.
    cyl('Recessed waist spindle',.41,.54,DARK,pelvis,(0,0,.52),n=32)
    gear('WaistGearRing',.82,.12,32,BRASS,pelvis,(0,0,.67),spokes=8)
    # Keep the front gear's node rotation identity, to avoid inherited pivot offsets.
    belly=empty('BellyGear',pelvis,(0,-.82,.59))
    gear('Belly machined 18 tooth wheel',.45,.15,18,BRASS,belly,(0,0,0),(PI/2,0,0),6)
    for sx in [-1,1]:
        gear('Waist satellite pinion',.205,.13,12,BRASS,pelvis,(sx*.57,-.68,.49),(PI/2,0,0),4)
        cyl('Waist piston',.07,.44,STEEL,pelvis,(sx*.67,0,.55),n=16)
    cyl('Pelvic maple core',.73,.38,PALE,pelvis,(0,0,.02),top=.78,n=32)
    cyl('Cream wooden belt',1.04,.18,CREAM,pelvis,(0,0,.29),n=56,bevel=.032)
    ring('Belt lower golden bead',1.017,.016,BRASS,pelvis,(0,0,.214),n=56,sides=6)
    # Five separate shaped hanging tassets; two rear pieces detach as one object.
    tasset('Armor_Skirt_F',pelvis,(0,-.85,-.10),0,.90)
    tasset('Armor_Skirt_L',pelvis,(.94,-.12,-.08),PI/2,.82)
    tasset('Armor_Skirt_R',pelvis,(-.94,-.12,-.08),-PI/2,.82)
    rear=tasset('Armor_Skirt_B',pelvis,(-.45,.78,-.11),PI-.18,.69)
    other=tasset('Rear tasset right',pelvis,(.45,.78,-.11),-PI+.18,.69)
    other.parent=rear; other.matrix_parent_inverse=Matrix.Identity(4)
    # Assign its transform from the desired pelvis-space world transform explicitly.
    bpy.context.view_layer.update()
    desired=pelvis.matrix_world @ Matrix.Translation((.45,.78,-.11)) @ __import__('mathutils').Euler((math.radians(-13),0,-PI+.18)).to_matrix().to_4x4()
    other.matrix_world=desired
    # Hip-centred legs, no leg scaling on their animation nodes.
    for side,sx in [('L',1),('R',-1)]:
        leg=empty('Leg_'+side,pelvis,(sx*.64,0,-.15))
        sphere('Hip wooden ball_'+side,(.29,.29,.30),WALNUT,leg,n=20,rings=10)
        cyl('Maple thigh_'+side,.285,.65,PALE,leg,(0,0,-.37),top=.32,n=24,bevel=.025)
        for x in [-.31,.31]:
            gear('Knee visible cog_'+side,.245,.09,12,BRASS,leg,(x,0,-.77),(0,PI/2,0),5)
        sphere('Knee bearing_'+side,(.24,.24,.23),DARK,leg,(0,0,-.77),n=20,rings=10)
        knee=[(-.17,.20),(.17,.20),(.245,.07),(.20,-.18),(-.20,-.18),(-.245,.07)]
        profile('Hexagonal cream knee cap_'+side,knee,.14,CREAM,leg,(0,-.31,-.79),.042)
        shin=[(-.31,.28),(.31,.28),(.34,-.26),(.25,-.37),(-.25,-.37),(-.34,-.26)]
        profile('Blue shaped greave_'+side,shin,.62,BLUE,leg,(0,0,-1.12),.065)
        tube('Greave carved rim_'+side,[(-.29,-.33,-.88),(-.28,-.35,-1.34),(.28,-.35,-1.34),(.29,-.33,-.88)],.014,BLUE_EDGE,leg,sides=6)
        # Round toe, level sole at exactly Z=0 in the final model.
        boot=box('Blue boot sole_'+side,(.83,1.09,.16),BLUE,leg,(0,-.16,-1.72),.06)
        shell('Carved round wooden boot_'+side,[(-1.72,.39,.50),(-1.60,.40,.53),(-1.45,.37,.49),(-1.33,.30,.36),(-1.29,.22,.26)],BLUE,leg,(0,-.18,0),n=32)
        # Cream arched strap follows the toe rather than a rectangular block.
        pts=[(.39*math.cos(PI*i/24),-.37,-1.67+.33*math.sin(PI*i/24)) for i in range(25)]
        tube('Boot cream curved strap_'+side,pts,.086,CREAM,leg,sides=10)
        pts=[(.33*math.cos(PI*i/24),-.646,-1.67+.22*math.sin(PI*i/24)) for i in range(25)]
        tube('Boot toe carved endgrain_'+side,pts,.014,BLUE_EDGE,leg,sides=6)
    # Arms: shoulder pivots sit at the ball, and every finger follows its shoulder.
    for side,sx in [('L',1),('R',-1)]:
        sh=empty('Shoulder_'+side,torso,(sx*1.38,0,1.17))
        sphere('Shoulder ball_'+side,(.31,.31,.31),DARK,sh,n=24,rings=12)
        gear('Shoulder exposed cog_'+side,.39,.15,16,BRASS,sh,(-sx*.13,0,0),(0,PI/2,0),6)
        pauldron(side,sx,sh)
        cyl('Maple upper arm_'+side,.265,.68,PALE,sh,(sx*.20,0,-.67),top=.32,n=28,bevel=.035)
        # Twin side wheels and a dark transverse axle, always visible between cuff and arm.
        for xx in [-.21,.56]:
            gear('Elbow cog_'+side,.255,.10,14,BRASS,sh,(sx*xx,0,-1.04),(0,PI/2,0),5)
        cyl('Elbow axle_'+side,.15,.81,DARK,sh,(sx*.18,0,-1.04),(0,PI/2,0),n=20)
        wrist=empty('Gauntlet_'+side,sh,(sx*.28,-.015,-1.31))
        cuff=[(-.45,.25),(.45,.25),(.50,.08),(.39,-.52),(.22,-.66),(-.34,-.60),(-.48,-.10)]
        profile('Walnut tapered vambrace_'+side,cuff,.78,WALNUT,wrist,bevel=.065)
        # Cream flared mouth and narrow bottom band, both actually wooden.
        box('Flared cream cuff_'+side,(1.00,.92,.17),CREAM,wrist,(0,0,.25),.045)
        box('Gauntlet wrist band_'+side,(.72,.72,.11),BRASS,wrist,(0,0,-.61),.027)
        for xx in [-.24,0,.24]:
            tube('Long carved walnut panel_'+side,[(xx,-.408,.12),(xx*.88,-.413,-.38),(xx*.75,-.37,-.53)],.009,WALNUT,wrist,sides=5)
        palm=box('Articulated walnut palm_'+side,(.72,.65,.46),WALNUT,wrist,(0,-.015,-.91),.07)
        # Four discrete knuckles, proximal phalanges and curled distal finger segments.
        for k in range(4):
            x=-.27+k*.18
            sphere('Knuckle joint_'+side,(.097,.105,.11),BRASS,wrist,(x,-.28,-.89),n=12,rings=6)
            box('Individual walnut knuckle plate_'+side,(.163,.19,.23),WALNUT,wrist,(x,-.35,-.94),.04,rot=(.20,0,0))
            box('Curled finger middle_'+side,(.159,.20,.20),WALNUT,wrist,(x,-.32,-1.12),.038,rot=(.55,0,0))
            box('Curled fingertip_'+side,(.153,.22,.15),WALNUT,wrist,(x,-.14,-1.19),.035,rot=(1.0,0,0))
        thumb=empty('Opposable thumb_'+side,wrist,(-sx*.39,-.19,-.85))
        sphere('Thumb ball_'+side,(.125,.13,.13),BRASS,thumb,n=12,rings=8)
        box('Thumb proximal wood_'+side,(.24,.27,.28),WALNUT,thumb,(0,-.08,-.12),.065,rot=(.35,sx*.35,0))
        box('Curled thumb tip_'+side,(.22,.25,.20),WALNUT,thumb,(sx*.05,-.19,-.27),.055,rot=(.9,sx*.3,0))
        shield=[(-.25,.28),(.24,.28),(.30,-.18),(.04,-.34),(-.26,-.25)]
        o=profile('Blue back-of-hand plate_'+side,shield,.10,BLUE,wrist,(sx*.29,.01,-.94),.04,rot=(0,0,sx*PI/2))
        frame('Gauntlet plate wooden edge_'+side,shield,.042,.055,CREAM,o,(0,-.062,0),.01)
    # Helmet: curved dome, open amber eye slit, real open vertical ventilation cage.
    head=empty('Head',torso,(0,0,1.62))
    cyl('Helmet inner shadow',.48,.63,DARK,head,(0,0,.36),n=48)
    shell('Pewter chin bowl',[(-.06,.40,.39),(.00,.51,.47),(.20,.54,.50),(.31,.54,.51)],STEEL,head,n=48)
    for sx in [-1,1]:
        profile('Visor cheek plate',[(-.11,.11),(.11,.11),(.16,-.17),(-.14,-.17)],.10,STEEL,head,(sx*.31,-.472,.14),.018,rot=(0,0,sx*.12))
    for sx in [-1,1]:
        sphere('Eye_'+('L' if sx>0 else 'R'),(.105,.055,.117),EYE,head,(sx*.215,-.495,.365),n=24,rings=12)
        ring('Eye brass bezel',.121,.016,BRASS,head,(sx*.215,-.487,.365),(PI/2,0,0),n=24,sides=6)
    # Upper hemisphere smoothly caps the helmet, leaving the eye opening beneath.
    shell('Curved royal-blue helmet dome',[(.745,.555,.545),(.80,.52,.51),(.88,.40,.40),(.93,.23,.23),(.945,.025,.025)],BLUE,head,n=56)
    # The back and sides are closed blue wood, while the front cage has actual
    # open dark ventilation slots rather than bars placed over a solid blue wall.
    vv=[];ff=[];nn=33
    for z in [.475,.745]:
        for r in [.54,.565]:
            vv.extend([(r*math.cos(PI*i/(nn-1)),r*math.sin(PI*i/(nn-1)),z) for i in range(nn)])
    for i in range(nn-1):
        ff.extend([(i,i+1,nn+i+1,nn+i),(2*nn+i,3*nn+i,3*nn+i+1,2*nn+i+1),
            (i,2*nn+i,2*nn+i+1,i+1),(nn+i,nn+i+1,3*nn+i+1,3*nn+i)])
    ff.extend([(0,nn,3*nn,2*nn),(nn-1,3*nn-1,4*nn-1,2*nn-1)])
    mesh('Helmet blue rear casing',vv,ff,BLUE,head,bevel=.012)
    # Front cage spans -152 to -28 deg, with open slots between thick stiles.
    for zz in [.475,.745]:
        points=[(.592*math.cos(a),.578*math.sin(a),zz) for a in np.linspace(-PI+.15,-.15,49)]
        tube('Visor curved blue rail',points,.048,BLUE,head,sides=8)
    for a in np.linspace(-PI+.21,-.21,11):
        x,y=.589*math.cos(a),.579*math.sin(a)
        o=box('Visor vertical slotted cage bar',(.065,.085,.265),BLUE,head,(x,y,.61),.018,rot=(0,0,a+PI/2))
    for sx in [-1,1]:
        cyl('Helmet brass side hinge',.115,.08,BRASS,head,(sx*.565,0,.42),(0,PI/2,0),n=24,bevel=.013)
        cyl('Helmet hinge screw',.055,.09,GOLD,head,(sx*.60,0,.42),(0,PI/2,0),n=16)
    # Ornate six-spired crown, its whole assembly detaches with CrownBand.
    crown=empty('CrownBand',head,(0,0,.91))
    # Continuous undulating crown band as a closed, hollow annular surface.
    n=96; v=[]; f=[]
    for inner in [False,True]:
        for top in [False,True]:
            for i in range(n):
                a=TAU*i/n
                z=.12 + .23*(.5+.5*math.cos(6*a))**2 if top else -.025
                r=(.50 if not top else .57) - (.065 if inner else 0)
                v.append((r*math.cos(a),r*math.sin(a),z))
    for i in range(n):
        j=(i+1)%n
        f += [(i,j,n+j,n+i),(2*n+i,3*n+i,3*n+j,2*n+j),(n+i,n+j,3*n+j,3*n+i),(i,2*n+i,2*n+j,j)]
    mesh('Six-spired golden crown',v,f,BRASS,crown,bevel=.012)
    ring('Crown bottom rolled gold',.50,.027,GOLD,crown,(0,0,-.02),n=64)
    for i in range(6):
        a=TAU*i/6
        sphere('Crown orb',(.05,.05,.05),GOLD,crown,(.57*math.cos(a),.57*math.sin(a),.365),n=16,rings=8)
        b=a+PI/6
        # Faceted diamond sapphires follow the flared crown wall.
        setting=profile('Crown diamond gold setting',[(0,.10),(.075,0),(0,-.10),(-.075,0)],.035,GOLD,crown,(.532*math.cos(b),.532*math.sin(b),.092),.008,rot=(0,0,b+PI/2))
        profile('Crown blue diamond gem',[(0,.074),(.051,0),(0,-.074),(-.051,0)],.027,GEM,setting,(0,-.029,0),.005)
    for i in range(18):
        a=TAU*i/18
        sphere('Crown seed rivet',(.018,.018,.018),GOLD,crown,(.517*math.cos(a),.517*math.sin(a),.007),n=8,rings=4)
    # Sculpted individual feather blades, swept backward; relief veins are geometry.
    cyl('Plume brass socket',.14,.14,BRASS,head,(0,.05,1.18),n=28,bevel=.02)
    for k in range(5):
        a=(k-2)*.045
        h=.615 - abs(k-2)*.065
        points=[]; widths=[]
        for j in range(19):
            t=j/18
            points.append((a*(.4+math.sin(t*PI)*.55)+.035*math.sin(PI*t),.02+.53*t-.14*t*t+(k-2)*.025,1.20+h*math.sin(PI*t/2)))
            widths.append(.009+.087*math.sin(PI*t)**.85)
        tube('Sculpted overlapping indigo plume blade',points,widths,PLUME,head,sides=10)
        vein=[(x,y-.08*math.sin(PI*j/18),z) for j,(x,y,z) in enumerate(points)]
        tube('Feather carved central vein',vein,.007,BLUE_EDGE,head,sides=5)
    # Tall back wind-up key: +Y shaft; every bow and scroll lies in an XZ plane.
    # Identity rotation here is intentional: exported glTF local Z is the shaft.
    key=empty('BackWindupKey',torso,(0,.79,1.22))
    key['gltf_spin_axis']='local Z (Three.js rotation.z); +Y shaft in Blender'
    cyl('Key fixed mounting rosette',.50,.15,BRASS,torso,(0,.78,1.22),(PI/2,0,0),n=48,bevel=.025)
    ring('Key mounting machined bead',.42,.026,GOLD,torso,(0,.87,1.22),(PI/2,0,0),n=48)
    for i in range(8):
        a=TAU*i/8
        bolt('Key mount screw',torso,(.405*math.cos(a),.881,1.22+.405*math.sin(a)),.034,(-PI/2,0,0),GOLD)
    cyl('Key hub',.23,.23,GOLD,key,(0,.17,0),(PI/2,0,0),n=40,bevel=.025)
    cyl('Key polished shaft',.125,.75,GOLD,key,(0,.54,0),(PI/2,0,0),n=32,bevel=.012)
    # Vertical figure-eight key with broad, flat bevelled gold ribbon bows.
    for sign in [-1,1]:
        n=64; v=[]; f=[]
        for yy in [.88,1.07]:
            for inset in [0,.13]:
                for i in range(n):
                    a=TAU*i/n
                    v.append(((.45-inset)*math.sin(a),yy,sign*.64+(.65-inset)*math.cos(a)))
        for i in range(n):
            j=(i+1)%n
            f += [(i,j,n+j,n+i),(2*n+i,3*n+i,3*n+j,2*n+j),(i,2*n+i,2*n+j,j),(n+i,n+j,3*n+j,3*n+i)]
        mesh('Key main upper bow' if sign>0 else 'Key main lower bow',v,f,GOLD,key,bevel=.022)
        # Double mirrored inward scrolling filigree in each bow, no borrowed assets.
        for sx in [-1,1]:
            pts=[]
            for j in range(42):
                t=j/41; a=-PI*.7+TAU*1.15*t; r=.21*(1-t)+.025
                pts.append((sx*(.13+r*math.cos(a)),.965,sign*(.58+r*1.35*math.sin(a))))
            tube('Key double scrollwork filigree',pts,.027,GOLD,key,sides=8)
        # Fine raised bead traces the inner bevel of each main bow.
        pts=[(.32*math.sin(TAU*i/64),1.078,sign*.64+.52*math.cos(TAU*i/64)) for i in range(64)]
        tube('Key inner gold beading',pts,.012,BRASS,key,closed=True,sides=6)
    profile('Key central fleur diamond',[(0,.24),(.23,0),(0,-.24),(-.23,0)],.24,GOLD,key,(0,.98,0),.035)
    sphere('Key central amber boss',(.095,.045,.095),BRASS,key,(0,1.13,0),n=20,rings=10)
    # Keep exactly 6m without changing any runtime pivot height.
    bpy.context.view_layer.update()
    return root


REQUIRED = {
    'BossRoot':None,'Pelvis':'BossRoot','Torso':'Pelvis','Head':'Torso',
    'Shoulder_L':'Torso','Shoulder_R':'Torso','Leg_L':'Pelvis','Leg_R':'Pelvis',
    'BackWindupKey':'Torso','BellyGear':'Pelvis','WaistGearRing':'Pelvis',
    'Armor_Shoulder_L':'Shoulder_L','Armor_Shoulder_R':'Shoulder_R',
    'ChestFrontShield':'Torso','Armor_Skirt_F':'Pelvis','Armor_Skirt_B':'Pelvis',
    'Armor_Skirt_L':'Pelvis','Armor_Skirt_R':'Pelvis','CrownBand':'Head',
}
DETACH=['Armor_Shoulder_L','Armor_Shoulder_R','ChestFrontShield','Armor_Skirt_F','Armor_Skirt_B','Armor_Skirt_L','Armor_Skirt_R','CrownBand']


def descendants(root):
    return [root]+list(root.children_recursive)


def join_to_origin(objects, name, parent, matrix):
    """Join geometry while preserving the specified physical pivot and world pose."""
    if not objects:return None
    bpy.ops.object.select_all(action='DESELECT')
    # Join does not apply modifiers on non-active objects. Apply every bevel first.
    for o in objects:
        bpy.context.view_layer.objects.active=o; o.select_set(True)
        for mod in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=mod.name)
        o.select_set(False)
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.object.join()
    o=bpy.context.object
    old=o.matrix_world.copy()
    o.data.transform(matrix.inverted() @ old)
    o.parent=parent; o.matrix_parent_inverse=Matrix.Identity(4); o.matrix_world=matrix
    o.name=name
    return o


def consolidate(root):
    bpy.context.view_layer.update()
    # Each phase armour is one mesh with its raised trim and ornaments included.
    for name in DETACH+['WaistGearRing']:
        o=bpy.data.objects[name]; world=o.matrix_world.copy(); parent=o.parent
        group=descendants(o); meshes=[x for x in group if x.type=='MESH']
        if o.type!='MESH':o.name=name+'_temporary'
        empties=[x for x in group if x.type=='EMPTY']
        joined=join_to_origin(meshes,name,parent,world)
        for x in empties:
            if x.name in bpy.data.objects: bpy.data.objects.remove(x,do_unlink=True)
    # Consolidate non-contract intermediary pivots such as palms/thumbs.
    for o in list(root.children_recursive):
        if o.type=='EMPTY' and o.name not in REQUIRED:
            parent=o.parent
            for c in list(o.children):
                world=c.matrix_world.copy();c.parent=parent;c.matrix_world=world
            bpy.data.objects.remove(o,do_unlink=True)
    # Fold every static mesh into one mesh per articulation node. Keep the ring
    # and detach objects distinct because the game animates those by exact name.
    for parent in [x for x in [root]+list(root.children_recursive) if x.type=='EMPTY']:
        meshes=[]
        for o in list(parent.children):
            if o.type=='MESH' and o.name not in REQUIRED:
                meshes.extend(x for x in descendants(o) if x.type=='MESH' and x.name not in REQUIRED)
        if meshes:
            join_to_origin(meshes,parent.name+'_CraftedGeometry',parent,parent.matrix_world.copy())
    # Debris rotation uses object origins: centre each finished multi-material
    # armour assembly, including the pair of rear tassets, on its actual geometry.
    for name in DETACH:
        o=bpy.data.objects[name]
        center=sum((Vector(p) for p in o.bound_box),Vector())/8
        old=o.matrix_world.copy()
        o.data.transform(Matrix.Translation(-center))
        o.matrix_world=old@Matrix.Translation(center)
    bpy.context.view_layer.update()


def optimize(root, budget=55500):
    """Apply quadric reduction after all trim and evaluated bevels are joined."""
    objects=[o for o in descendants(root) if o.type=='MESH']
    before=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects)
    if before<=budget:return
    ratio=budget/before
    for o in objects:
        bpy.context.view_layer.objects.active=o
        mod=o.modifiers.new('Game topology | silhouette preserving', 'DECIMATE')
        mod.ratio=ratio;mod.use_collapse_triangulate=True
        bpy.ops.object.modifier_apply(modifier=mod.name)
        # Remove microscopic slivers produced where curved bevel strips meet.
        bm=bmesh.new();bm.from_mesh(o.data)
        bad=[f for f in bm.faces if f.calc_area()<1e-10]
        if bad:bmesh.ops.delete(bm,geom=bad,context='FACES_ONLY')
        unused=[v for v in bm.verts if not v.link_faces]
        if unused:bmesh.ops.delete(bm,geom=unused,context='VERTS')
        bm.to_mesh(o.data);bm.free();o.data.update()
    REPORT['topology']={'authored_triangles':before,'target_triangles':budget,'method':'Quadric geometric simplification after evaluated bevels'}


def bounds(objects):
    pts=[o.matrix_world@Vector(c) for o in objects if o.type=='MESH' for c in o.bound_box]
    lo=[min(p[i] for p in pts) for i in range(3)]; hi=[max(p[i] for p in pts) for i in range(3)]
    return lo,hi,[hi[i]-lo[i] for i in range(3)]


def verify_source(root):
    bpy.context.view_layer.update()
    names={}
    for name,parent in REQUIRED.items():
        o=bpy.data.objects.get(name);assert o is not None,name
        assert (o.parent.name if o.parent else None)==parent,(name,parent)
        assert all(abs(s-1)<1e-5 for s in o.scale),(name,'scaled pivot')
        names[name]={'parent':parent,'position':list(o.location),'type':o.type}
    for name in DETACH:
        o=bpy.data.objects[name];assert o.type=='MESH',name
        assert o.location.length>.01,(name,'invalid detach origin')
    tris=0; breakdown=[]
    for o in descendants(root):
        if o.type=='MESH':
            o.data.calc_loop_triangles();t=len(o.data.loop_triangles);tris+=t
            breakdown.append((o.name,t))
    print('TRIANGLE_BREAKDOWN '+json.dumps(sorted(breakdown,key=lambda x:-x[1])),flush=True)
    lo,hi,size=bounds(descendants(root))
    assert tris<=60000,('triangle budget',tris)
    assert abs(lo[2])<.015,('boot sole',lo)
    assert 5.90<=hi[2]<=6.10,('height',hi)
    REPORT.update(triangles_blender=tris,bounds_blender={'min':lo,'max':hi,'dimensions':size},nodes=names)
    print('BOSS_V2_SOURCE_QA '+json.dumps(REPORT),flush=True)


def glb_json(path):
    data=path.read_bytes();magic,version,length=struct.unpack_from('<4sII',data)
    assert magic==b'glTF' and version==2 and length==len(data)
    size,kind=struct.unpack_from('<I4s',data,12);assert kind==b'JSON'
    return json.loads(data[20:20+size])


def verify_glb(path):
    j=glb_json(path)
    nodes={n['name']:n for n in j['nodes']}; index={n['name']:i for i,n in enumerate(j['nodes'])}
    for name,parent in REQUIRED.items():
        assert name in nodes,name
        if parent:assert index[name] in nodes[parent].get('children',[]),(name,'export parent')
    for name in DETACH:assert 'mesh' in nodes[name],name
    for name in ['Shoulder_L','Shoulder_R','Leg_L','Leg_R','BackWindupKey']:
        assert nodes[name].get('rotation',[0,0,0,1])==[0,0,0,1],(name,'unexpected rotation basis')
    assert abs(nodes['Pelvis']['translation'][1]-1.95)<1e-5
    tris=sum(j['accessors'][p['indices']]['count']//3 for m in j['meshes'] for p in m['primitives'])
    assert tris<=60000,tris
    assert j.get('images') and all('bufferView' in im and 'uri' not in im for im in j['images'])
    assert all('uri' not in b for b in j['buffers'])
    assert all('TANGENT' in p['attributes'] for m in j['meshes'] for p in m['primitives'])
    # glTF local axes are identity for the animated key; +Y Blender becomes -Z.
    k=nodes['BackWindupKey']['translation']; assert k[2]<0,(k,'back must be -Z')
    REPORT['export']={'path':str(path),'bytes':path.stat().st_size,'triangles':tris,
        'embedded_images':len(j['images']),'mesh_nodes':sum('mesh'in n for n in j['nodes']),
        'materials':len(j['materials']),'all_primitives_have_tangents':True,
        'key_axis':'glTF local Z aligned with Blender +Y shaft',
        'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
    print('BOSS_V2_GLB_QA '+json.dumps(REPORT['export']),flush=True)


def aim(obj, point):obj.rotation_euler=(Vector(point)-obj.location).to_track_quat('-Z','Y').to_euler()


def area(name,loc,energy,size,color,target=(0,0,2.7),shape='DISK',size_y=None):
    d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.shape=shape;d.size=size;d.color=color
    if size_y and shape=='RECTANGLE':d.size_y=size_y
    o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.location=loc;aim(o,target)
    return o


def evaluated_bounds(objects):
    dg=bpy.context.evaluated_depsgraph_get();points=[]
    for o in objects:
        if o.type!='MESH' or o.hide_render:continue
        ev=o.evaluated_get(dg);me=ev.to_mesh()
        points.extend(ev.matrix_world@v.co for v in me.vertices)
        ev.to_mesh_clear()
    lo=[min(p[i] for p in points) for i in range(3)]
    hi=[max(p[i] for p in points) for i in range(3)]
    return lo,hi,[hi[i]-lo[i] for i in range(3)]


def render_preview(path):
    # Render the exported model, after a clean import, to expose any GLB problems.
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path.resolve()))
    root=bpy.data.objects['BossRoot']
    for o in descendants(root):
        rotation=o.matrix_basis.to_quaternion().to_euler('XYZ')
        o.rotation_mode='XYZ';o.rotation_euler=rotation
    scene=bpy.context.scene
    # EEVEE is required; use the identifier present in Blender 5.2.
    scene.render.engine='BLENDER_EEVEE'
    scene.render.resolution_x=1080;scene.render.resolution_y=1200;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'
    scene.render.film_transparent=False
    scene.render.image_settings.color_mode='RGBA'
    scene.render.image_settings.color_depth='8'
    scene.render.engine='BLENDER_EEVEE'
    scene.render.fps=30
    scene.world=bpy.data.worlds.new('Warm ivory studio')
    scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.26,.29,.36,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value=.45
    scene.view_settings.view_transform='AgX'
    scene.view_settings.look='AgX - Medium High Contrast'
    floor=material('Preview warm ivory floor',(.38,.32,.235),rough=.78,coat=0)
    box('Preview floor',(200,200,.12),floor,None,(0,0,-.07),.01)
    cam_data=bpy.data.cameras.new('QA orthographic camera');cam=bpy.data.objects.new('QA orthographic camera',cam_data)
    bpy.context.collection.objects.link(cam);scene.camera=cam;cam_data.type='ORTHO';cam_data.ortho_scale=7.45
    area('Large warm key',(-5,-6,10),1600,6,(1,.86,.67))
    area('Cool soft fill',(6,-3,6),1150,5,(.72,.83,1))
    area('Top rear gilded rim',(2,5,9),2100,5,(1,.82,.56))
    area('Front reflection strip',(-1,-6,4),240,3,(1,.95,.84),shape='RECTANGLE',size_y=6)
    # Import exact game character, normalize the whole rig to one metre.
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(HERO))
    hero_objects=list(set(bpy.data.objects)-before)
    active_face={'Face_Eyes_Sleep','Face_Mouth_Default'}
    hero_mesh_names={n['name'] for n in glb_json(HERO)['nodes'] if 'mesh' in n}
    def hero_visible(o):
        if o.type=='MESH' and o.name not in hero_mesh_names:return False
        return not o.name.startswith('Face_') or o.name in active_face
    for o in hero_objects:
        o.hide_render=not hero_visible(o)
        if o.animation_data:o.animation_data_clear()
        if o.type=='ARMATURE':o.data.pose_position='REST'
    hero_root=empty('QA_ONLY_1m_Manmarubuu')
    for o in hero_objects:
        if o.parent not in hero_objects:
            world=o.matrix_world.copy();o.parent=hero_root;o.matrix_world=world
    bpy.context.view_layer.update()
    lo,hi,sz=evaluated_bounds(hero_objects)
    hero_root.scale=(1/sz[2],)*3
    bpy.context.view_layer.update()
    lo,hi,sz=evaluated_bounds(hero_objects)
    hero_root.location=(-2.70,-.35,-lo[2])
    bpy.context.view_layer.update()
    REPORT['preview']={'engine':'BLENDER_EEVEE','model_source':'round-trip import of exported GLB',
        'hero_source':str(HERO),'hero_height':evaluated_bounds(hero_objects)[2][2],'hero_min_z':evaluated_bounds(hero_objects)[0][2]}
    assert abs(REPORT['preview']['hero_height']-1)<1e-4
    assert abs(REPORT['preview']['hero_min_z'])<1e-4
    # Actual baseline asset in a separate comparison render, no baseline in export.
    tmp=HERE/'_tmp_boss_v2';tmp.mkdir(exist_ok=True)
    views=[('front',(0,-16,7.2),(0,0,2.85)),('back',(0,16,7.2),(0,.3,2.85)),('three_quarter',(10,-16,8.0),(-.7,0,2.9))]
    for label,loc,target in views:
        hero_root.hide_render=False
        if label in ['front','back']:
            for o in hero_objects:o.hide_render=True
        else:
            for o in hero_objects:o.hide_render=not hero_visible(o)
        cam.location=loc;aim(cam,target)
        cam_data.ortho_scale=7.35 if label!='three_quarter' else 8.0
        scene.render.filepath=str(tmp/(label+'.png'))
        bpy.ops.render.render(write_still=True)
    # Literal runtime poses, on the round-tripped GLB, for visual pivot QA.
    for o in hero_objects:o.hide_render=True
    rest={name:(bpy.data.objects[name].location.copy(),bpy.data.objects[name].rotation_euler.copy()) for name in REQUIRED}
    pose_bounds={}
    for label in ['windup','slam','walk_key','detached']:
        for name,(loc,rot) in rest.items():
            bpy.data.objects[name].location=loc;bpy.data.objects[name].rotation_euler=rot
        if label=='windup':
            for name in ['Shoulder_L','Shoulder_R']:bpy.data.objects[name].rotation_euler.x=-2.5
        elif label=='slam':
            for name in ['Shoulder_L','Shoulder_R']:bpy.data.objects[name].rotation_euler.x=.72
            bpy.data.objects['Torso'].rotation_euler.x=.45
        elif label=='walk_key':
            bpy.data.objects['Leg_L'].rotation_euler.x=.42
            bpy.data.objects['Leg_R'].rotation_euler.x=-.42
            bpy.data.objects['Shoulder_L'].rotation_euler.x=-.28
            bpy.data.objects['Shoulder_R'].rotation_euler.x=.28
            # Three.js +Z spin becomes Blender -Y spin.
            bpy.data.objects['BackWindupKey'].rotation_euler.y=-PI/2
        else:
            for name in DETACH:
                o=bpy.data.objects[name]
                if 'Shoulder' in name:o.location.x+=1.0 if name.endswith('L') else -1.0
                elif name=='ChestFrontShield':o.location.y-=.95
                elif name=='CrownBand':o.location.z+=.55
                elif name.endswith('_F'):o.location.y-=.7
                elif name.endswith('_B'):o.location.y+=.7
                elif name.endswith('_L'):o.location.x+=.7
                elif name.endswith('_R'):o.location.x-=.7
        bpy.context.view_layer.update()
        lo,hi,size=bounds(descendants(root));pose_bounds[label]={'min':lo,'max':hi}
        cam.location=(10,-16,8);aim(cam,(0,0,3));cam_data.ortho_scale=7.8
        scene.render.filepath=str(tmp/(label+'.png'));bpy.ops.render.render(write_still=True)
    for name,(loc,rot) in rest.items():
        bpy.data.objects[name].location=loc;bpy.data.objects[name].rotation_euler=rot
    REPORT['preview']['pose_bounds']=pose_bounds
    # A fourth panel renders the existing boss at the same 6m scale and lighting.
    for o in descendants(root):o.hide_render=True
    before=set(bpy.data.objects)
    baseline=GAME/'public/models/ai/boss_king.glb'
    bpy.ops.import_scene.gltf(filepath=str(baseline))
    old=list(set(bpy.data.objects)-before)
    holder=empty('QA_ONLY_BASELINE')
    for o in old:
        if o.parent not in old:
            w=o.matrix_world.copy();o.parent=holder;o.matrix_world=w
    bpy.context.view_layer.update();lo,hi,sz=bounds(old);holder.scale=(6/sz[2],)*3
    bpy.context.view_layer.update();lo,hi,sz=bounds(old);holder.location.z=-lo[2]
    for o in hero_objects:o.hide_render=True
    cam.location=(0,-16,7.2);aim(cam,(0,0,2.85));cam_data.ortho_scale=7.35
    scene.render.filepath=str(tmp/'baseline.png');bpy.ops.render.render(write_still=True)
    print('PREVIEW_PANELS '+str(tmp),flush=True)


def compose_preview():
    """Pillow only lays out the already rendered EEVEE panels and labels."""
    code=r'''
import json,sys
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
cfg=json.loads(sys.stdin.read());here=Path(cfg['here']);w,h=1080,1200
sheet=Image.new('RGB',(4320,1480),(18,26,39));d=ImageDraw.Draw(sheet)
font='C:/Windows/Fonts/segoeui.ttf';bold='C:/Windows/Fonts/seguisb.ttf'
def f(s,b=False):return ImageFont.truetype(bold if b else font,s)
d.text((45,26),'CLOCKWORK TOY KING',font=f(54,True),fill=(247,224,174))
d.text((915,43),'V2  /  ORIGINAL PROCEDURAL MODEL  /  BLENDER 5.2',font=f(26),fill=(183,195,212))
d.text((4270,42),f"{cfg['tris']:,} TRIANGLES   |   {cfg['height']:.2f} m   |   EEVEE",font=f(27),fill=(247,224,174),anchor='ra')
labels=[('baseline','01   EXISTING BOSS','Original boss_king.glb / normalized to 6 m'),('front','02   V2 / FRONT','Carved blue wood / raised cream borders / amber eyes'),('back','03   V2 / BACK','Polished gold winding key / double filigree scrolls'),('three_quarter','04   V2 / SCALE','6 m king beside the supplied 1.00 m Manmarubuu')]
for i,(name,title,sub) in enumerate(labels):
    im=Image.open(here/'_tmp_boss_v2'/f'{name}.png').convert('RGB')
    sheet.paste(im,(i*w,130));d.rectangle((i*w,130,i*w+4,1330),fill=(18,26,39))
    d.text((i*w+35,1360),title,font=f(31,True),fill=(247,224,174))
    d.text((i*w+35,1413),sub,font=f(22),fill=(183,195,212))
sheet.save(here/'boss_v2_preview.png')
pose=Image.new('RGB',(4320,1480),(18,26,39));pd=ImageDraw.Draw(pose)
pd.text((45,30),'RUNTIME PIVOT & ARMOUR CHECK',font=f(48,True),fill=(247,224,174))
pd.text((4270,48),'EXPORTED GLB / EEVEE',font=f(28),fill=(183,195,212),anchor='ra')
plabels=[('windup','01   WINDUP','Both shoulders: rotation.x = -2.50'),('slam','02   SLAM','Shoulders: +0.72 / torso: +0.45'),('walk_key','03   WALK / KEY QUARTER TURN','Hips: +/-0.42 / key: Three.js rotation.z = pi/2'),('detached','04   EIGHT DETACHABLE ASSEMBLIES','Raised trims and crown jewels remain on their armour')]
for i,(name,title,sub) in enumerate(plabels):
    im=Image.open(here/'_tmp_boss_v2'/f'{name}.png').convert('RGB');pose.paste(im,(i*w,130))
    pd.text((i*w+35,1360),title,font=f(30,True),fill=(247,224,174))
    pd.text((i*w+35,1413),sub,font=f(21),fill=(183,195,212))
pose.save(here/'boss_v2_motion_qa.png')
'''
    subprocess.run(['python','-c',code],input=json.dumps({'here':str(HERE),'tris':REPORT['export']['triangles'],'height':REPORT['bounds_blender']['dimensions'][2]}),text=True,check=True)
    REPORT['preview']['sheet']=str(HERE/'boss_v2_preview.png')


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--skip-preview',action='store_true')
    parser.add_argument('--output',type=Path,default=OUT)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    args.output=args.output.resolve()
    if args.output.name!='boss_king_v2.glb':parser.error('The staging filename must be boss_king_v2.glb')
    temp_dir=HERE/'_tmp_boss_v2'/'export_temp'
    temp_dir.mkdir(parents=True,exist_ok=True)
    tempfile.tempdir=str(temp_dir)
    # Windows Python's mode-0700 TemporaryDirectory drops inherited workspace
    # ACLs. Encode through an ordinary file in our existing writable temp folder.
    # Only this process's image encoder is adapted; Blender's install is untouched.
    from io_scene_gltf2.blender.exp.material import encode_image
    def workspace_image_encoder(image, file_format, export_settings):
        path=temp_dir/(uuid.uuid4().hex+'.'+file_format.lower())
        image.filepath_raw=str(path);image.file_format=file_format
        try:
            if file_format in ['JPEG','WEBP']:
                image.save(quality=export_settings['gltf_image_quality'])
            else:image.save()
            return path.read_bytes()
        finally:
            if path.exists():path.unlink()
    encode_image._encode_temp_image=workspace_image_encoder
    original=GAME/'public/models/ai/boss_king.glb'
    old_hash=hashlib.sha256(original.read_bytes()).hexdigest()
    root=build();consolidate(root);optimize(root);verify_source(root)
    # Save a fully editable source before any preview-only imports.
    if hasattr(bpy.context.preferences.filepaths,'file_preview_type'):
        bpy.context.preferences.filepaths.file_preview_type='NONE'
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'boss_king_v2.blend'))
    bpy.ops.object.select_all(action='DESELECT')
    for o in descendants(root):o.select_set(True)
    args.output.parent.mkdir(exist_ok=True,parents=True)
    bpy.ops.export_scene.gltf(filepath=str(args.output),export_format='GLB',use_selection=True,
        export_yup=True,export_apply=True,export_tangents=True,export_image_format='AUTO',export_animations=False)
    verify_glb(args.output)
    if not args.skip_preview:
        render_preview(args.output);compose_preview()
    assert hashlib.sha256(original.read_bytes()).hexdigest()==old_hash,'Original boss changed!'
    REPORT['original_boss_unchanged']=True
    (HERE/'boss_v2_qa.json').write_text(json.dumps(REPORT,indent=2),encoding='utf-8')
    print('BOSS_V2_FINISHED '+json.dumps(REPORT),flush=True)


if __name__=='__main__':main()
