"""Build the Sunlit Playroom kit. Run with Blender 5.2 -b -P this_file.

A companion system Python with Pillow draws the original prints and labels the sheet.
"""
import json
import math
import random
import subprocess
import sys
import tempfile
from pathlib import Path
from math import sin, cos, pi

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "public/models/playroom"
SHEET = HERE / "qa_sheet_playroom_kit.png"


def illustrations(folder):
    from PIL import Image, ImageDraw
    rng = random.Random(48)
    grain = Image.new("RGB", (512, 256))
    pixels = grain.load()
    for y in range(256):
        for x in range(512):
            phase = 2*pi*x/512
            wave = y + 2.8*sin(phase + 2*sin(y*pi/128)) + 1.3*cos(2*phase+y*pi/128)
            tone = 3*sin(wave*pi/8) - 7*max(0, cos(wave*pi/4))**10 + rng.uniform(-2, 2)
            pixels[x,y] = tuple(int(v+tone) for v in (217,166,109))
    grain.save(folder/"oak.png")
    im = Image.new("RGB", (600,760), "#28436a")
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((16,16,584,744), 22, outline="#e3ba78", width=6)
    for _ in range(86):
        x,y = rng.randint(40,560),rng.randint(40,660)
        r = rng.choice((2,3,4,8))
        d.polygon([(x,y-r),(x+r*.45,y-1),(x+r,y),(x+1,y+2),(x,y+r),(x-1,y+2),(x-r,y),(x-1,y-2)], fill="#f4d497")
    d.ellipse((62,85,154,177), fill="#e6b476")
    d.arc((36,106,181,149),0,360,fill="#f7db9d",width=5)
    # A diagonally ascending tin rocket above the scalloped cloud bank.
    def rocket(points, color):
        d.polygon([(300+u*.86+v*.51,363+u*.51-v*.86) for u,v in points],fill=color)
    rocket([(-31,-89),(-24,-168),(-5,-141),(0,-201),(30,-102)],"#f2ad49")
    rocket([(-34,-44),(-80,-116),(-78,-40),(-37,12),(37,12),(78,-40),(80,-116),(34,-44)],"#d56758")
    rocket([(-28,-105),(-46,-39),(-42,49),(-24,104),(0,144),(24,104),(42,49),(46,-39),(28,-105)],"#fff0cb")
    rocket([(-35,72),(0,144),(35,72)],"#ec775e")
    d.ellipse((282,326,333,377), fill="#cc954c")
    d.ellipse((289,333,326,370), fill="#60a6ac")
    for i in range(8):
        x=i*84-55
        d.ellipse((x,640-30*cos(i),x+145,810),fill="#a8c8c6")
    d.rectangle((22,702,578,737),fill="#a8c8c6")
    # A tiny castle marks the departure point among the clouds.
    d.rectangle((71,627,176,691),fill="#e7b875")
    for x,h in ((76,606),(120,580),(166,608)):
        d.rectangle((x-13,h,x+13,670),fill="#efd0a0")
        d.polygon(((x-20,h),(x,h-31),(x+20,h)),fill="#d77561")
        d.rounded_rectangle((x-4,h+10,x+4,h+24),3,fill="#536682")
    d.rounded_rectangle((111,659,132,699),8,fill="#879d9a")
    im.save(folder/"print.png")
    weave=Image.new("RGB",(128,128))
    threads=weave.load()
    for y in range(128):
        for x in range(128):
            ax=cos(2*pi*x/8)*cos(2*pi*y/16)
            ay=cos(2*pi*y/8)*sin(2*pi*x/16)
            threads[x,y]=(int(128+43*ax),int(128+43*ay),int(254-8*(ax*ax+ay*ay)))
    weave.save(folder/"linen.png")


def label_sheet(raw):
    from PIL import Image, ImageDraw, ImageFont
    source = Image.open(raw)
    width,height = source.size
    layout = Image.new("RGB",(width+230,height+76),"#263940")
    layout.paste(source,(230,76))
    d = ImageDraw.Draw(layout)
    font = ImageFont.load_default(size=21)
    d.text((18,27),"SUNLIT PLAYROOM",font=font,fill="#ffe8bc")
    for col,label in enumerate(("THREE-QUARTER","FRONT","SIDE","TOP")):
        d.text((230+(col+.5)*width/4,39),label,anchor="mm",font=font,fill="white")
    for row,label in enumerate(BUILD_NAMES):
        d.text((18,76+(row+.5)*height/8),label.replace("_"," ").title(),anchor="lm",font=font,fill="white")
    layout.save(SHEET)


BUILD_NAMES = ("bed","toy_chest","bookshelf","picture_book","toy_train","wall_shelf","window_frame","castle_roof")
if "--illustrate" in sys.argv:
    illustrations(Path(sys.argv[-1]))
    sys.exit()
if "--label" in sys.argv:
    label_sheet(Path(sys.argv[-1]))
    sys.exit()

import bpy
import bmesh
from mathutils import Vector, Matrix
sys.path.insert(0, str(HERE))
import build_diorama_world_assets as kit

M = {}


def materials(folder):
    M.clear()
    colors = dict(maple=(.75,.49,.25), oak=(1,1,1), teal=(.07,.40,.42), mint=(.29,.68,.52),
                  rose=(.78,.19,.16), blue=(.14,.32,.56), gold=(.92,.57,.14), plum=(.37,.21,.42),
                  paper=(.97,.86,.65), milk=(.93,.86,.73), ink=(.055,.08,.11), brass=(.79,.49,.17),
                  print=(1,1,1))
    for key,col in colors.items():
        M[key] = kit.make_mat("Playroom_"+key,col,metallic=.65 if key=="brass" else 0,
                              roughness=.83 if key in ("mint","paper") else .43)
    for key,file in (("oak","oak.png"),("print","print.png")):
        mat=M[key]
        node=mat.node_tree.nodes.new("ShaderNodeTexImage")
        node.image=kit.load_packed_image(folder/file)
        mat.node_tree.links.new(node.outputs["Color"],mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"])


def box(name,loc,size,color,bevel=.045,rot=(0,0,0)):
    bm=bmesh.new()
    bmesh.ops.create_cube(bm,size=1)
    bmesh.ops.scale(bm,verts=list(bm.verts),vec=size)
    bm.normal_update()
    segments=1 if name=="Running stitch" else 3
    bmesh.ops.bevel(bm,geom=list(bm.edges),offset=min(bevel,min(size)*.4),
                    segments=segments,profile=.5,affect="EDGES",clamp_overlap=True)
    return kit.finalize_mesh_obj(name,bm,M[color],loc=loc,rot=rot)


def disk(name,loc,r,depth,color,rot=(0,0,0),tip=None):
    return kit.new_cyl(name,r,r if tip is None else tip,depth,M[color],loc=loc,rot=rot,segs=24,bevel=.019)


def ball(name,loc,size,color):
    return kit.new_sphere(name,1,M[color],loc=loc,scale=size,segs=20,rings=12)


def solid(name,profile,depth,loc,color):
    """Rounded extruded silhouette in the elevation plane."""
    bm=bmesh.new()
    rings=[[bm.verts.new((x,y,z)) for x,z in profile] for y in (-depth/2,depth/2)]
    for ring in rings:
        bm.faces.new(ring)
    for i in range(len(profile)):
        bm.faces.new((rings[0][i-1],rings[0][i],rings[1][i],rings[1][i-1]))
    bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
    bmesh.ops.bevel(bm,geom=list(bm.edges),offset=min(.027,depth*.2),segments=3,profile=.5,affect="EDGES",clamp_overlap=True)
    return kit.finalize_mesh_obj(name,bm,M[color],loc=loc)


def bed(folder):
    cloth=M["mint"]
    normal=cloth.node_tree.nodes.new("ShaderNodeNormalMap")
    normal.inputs["Strength"].default_value=.30
    tex=cloth.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image=kit.load_packed_image(folder/"linen.png",non_color=True)
    cloth.node_tree.links.new(tex.outputs["Color"],normal.inputs["Color"])
    cloth.node_tree.links.new(normal.outputs["Normal"],cloth.node_tree.nodes["Principled BSDF"].inputs["Normal"])
    for y,h in ((1.42,1.30),(-1.42,.94)):
        profile=[(-.91,.41),(.91,.41)]+[(.91*cos(i*pi/26),h+.22*sin(i*pi/26)) for i in range(27)]
        solid("Arched end board",profile,.14,(0,y,0),"oak")
        for x in (-.94,.94):
            box("Turned end post",(x,y,h/2),(.16,.20,h),"maple",.07)
            ball("Post finial",(x,y,h),(.088,.105,.07),"maple")
    box("Bed rail",(0,0,.48),(1.98,2.88,.26),"oak")
    box("Ticking",(0,0,.72),(1.83,2.73,.37),"milk",.18)
    pillow=box("Down pillow",(0,.93,.971),(1.39,.73,.29),"paper",.15,rot=(.09,0,-.055))
    sub=pillow.modifiers.new("Soft ticking","SUBSURF")
    sub.levels=2
    # Cross sections follow the crown, roll over the mattress, then hang in flutes.
    def quilt(u,v):
        a=abs(u)
        bend=max(0,(a-.78)/.22)
        x=(.89*min(a/.78,1)+.10*sin(bend*pi/2))* (1 if u>=0 else -1)
        y=-1.29+1.96*v+.025*cos(u*6+v*3)
        z=.935+.032*cos(u*pi/2)+.014*cos(v*9+u*3)-.36*(1-cos(bend*pi/2))
        x+=.024*bend*sin(v*21+u)
        z+=.043*math.exp(-((v-.91)/.045)**2)
        return (x,y,z)
    bm=bmesh.new()
    rows=[[bm.verts.new(quilt(i/24-1,j/32)) for i in range(49)] for j in range(33)]
    for j in range(32):
        for i in range(48):
            bm.faces.new([rows[j][i],rows[j][i+1],rows[j+1][i+1],rows[j+1][i]])
    ob=kit.finalize_mesh_obj("Folded channel quilt",bm,M["mint"],uv_scale=5,weighted=False)
    thick=ob.modifiers.new("Bound hem","SOLIDIFY")
    thick.thickness=.022
    for v in (.055,.865,.956):
        for i in range(25):
            u=(i-12)/16
            x,y,z=quilt(u,v)
            box("Running stitch",(x,y,z+.003),(.042,.009,.009),"paper",.003)


def chest():
    box("Painted box",(0,0,.60),(2.14,1.1,1.04),"mint",.08)
    for z in (.13,1.05):
        box("Maple rail",(0,0,z),(2.23,1.19,.13),"oak")
    for x in (-1.01,1.01):
        for y in (-.51,.51):
            box("Corner stile",(x,y,.55),(.15,.15,1.10),"oak")
    box("Raised lid",(0,0,1.175),(2.27,1.20,.18),"mint",.085)
    box("Inset lid panel",(0,0,1.269),(2.03,.99,.035),"mint")
    for x in (-.72,.72):
        disk("Hinge barrel",(x,.596,1.11),.044,.28,"brass",(0,pi/2,0))
    solid("Escutcheon",[(-.12,.16),(.12,.16),(.12,-.09),(0,-.16),(-.12,-.09)],.048,(0,-.603,.99),"brass")
    disk("Lock bore",(0,-.632,.995),.034,.012,"ink",(pi/2,0,0))
    box("Key slot",(0,-.633,.958),(.034,.014,.058),"ink")
    for x in (-.08,.08):
        disk("Rivet",(x,-.632,1.10),.014,.012,"paper",(pi/2,0,0))


def standing_book(x,z,w,h,color,y=0):
    box("Leaves",(x,y+.025,z+h/2),(w*.77,.48,h-.045),"paper",.026)
    for side in (-1,1):
        box("Book board",(x+side*w*.44,y,z+h/2),(w*.13,.56,h),color)
    box("Rounded spine",(x,y-.25,z+h/2),(w,.14,h),color,.065)
    for frac in (.12,.81,.865):
        box("Foil spine rule",(x,y-.322,z+h*frac),(w*.72,.009,.015),"gold")
    disk("Spine seal",(x,y-.324,z+h*.59),w*.21,.009,"paper",(pi/2,0,0))


def bookshelf():
    for x in (-1.17,1.17):
        box("Side panel",(x,0,1.10),(.14,.8,2.16),"oak")
    box("Cabinet back",(0,.34,1.09),(2.34,.10,2.1),"maple")
    for z in (.09,1.1,2.19):
        box("Bullnose shelf",(0,0,z),(2.5,.89,.16),"oak",.065)
    colors=("rose","teal","gold","blue","mint","plum")
    for j,z in enumerate((.17,1.18)):
        for i in range(7):
            standing_book(-.93+i*.302,z,.275,.67+.16*sin(i*1.6+j)**2,colors[(i+2*j)%6],-.045)


def picture_book():
    for z in (.049,.32):
        box("Clothbound board",(0,0,z),(1.67,2.12,.098),"blue")
    box("Deckle edge",(.016,0,.18),(1.56,2.01,.212),"paper")
    for z in (.124,.165,.218,.251):
        box("Gathered signatures",(.018,0,z),(1.565,2.014,.012),"maple",.005)
    box("Rounded cloth hinge",(-.783,0,.184),(.167,2.12,.36),"blue",.08)
    # Exact UVs on the printed cover; lifting this inset by 1 mm avoids z-fighting.
    bm=bmesh.new()
    uv=bm.loops.layers.uv.verify()
    f=bm.faces.new([bm.verts.new((x,y,.370)) for x,y in ((-.68,-.98),(.76,-.98),(.76,.98),(-.68,.98))])
    for loop,coord in zip(f.loops,((0,0),(1,0),(1,1),(0,1))):
        loop[uv].uv=coord
    kit.finalize_mesh_obj("Rocket to the moon",bm,M["print"],uv_scale=None,weighted=False,smooth=False)



def train():
    for center,length in ((-.98,1.78),(1.04,1.56)):
        box("Beech chassis",(center,0,.35),(length,.70,.17),"oak")
        for x in (center-length*.32,center+length*.32):
            disk("Axle",(x,0,.216),.082,.9,"ink",(pi/2,0,0))
            for side in (-1,1):
                disk("Wheel",(x,side*.407,.216),.216,.128,"rose",(pi/2,0,0))
                disk("Wheel boss",(x,side*.478,.216),.115,.023,"maple",(pi/2,0,0))
                disk("Brass axle pin",(x,side*.493,.216),.05,.018,"brass",(pi/2,0,0))
    disk("Coupling pin",(.07,0,.34),.063,.51,"brass",(0,pi/2,0))
    disk("Steam boiler",(-1.36,0,.67),.294,.90,"teal",(0,pi/2,0))
    for x in (-1.78,-1.10):
        disk("Boiler hoop",(x,0,.67),.302,.052,"brass",(0,pi/2,0))
    disk("Smokebox door",(-1.824,0,.67),.249,.049,"ink",(0,pi/2,0))
    disk("Number plate",(-1.853,0,.67),.107,.02,"brass",(0,pi/2,0))
    disk("Flared stack",(-1.58,0,1.05),.102,.30,"maple",tip=.155)
    disk("Stack rim",(-1.58,0,1.20),.163,.069,"gold")
    box("Cab apron",(-.57,0,.60),(.62,.68,.35),"mint")
    for x in (-.81,-.33):
        for y in (-.26,.26):
            box("Cab pillar",(x,y,.94),(.09,.09,.46),"mint")
    solid("Cab canopy",[(-.40,0),(.40,0),(.40,.09),(.31,.14),(0,.17),(-.31,.14),(-.4,.09)],.81,(-.57,0,1.15),"rose")
    for y in (-.31,.31):
        box("Wagon side",(1.04,y,.54),(1.53,.10,.23),"blue")
    for x in (.33,1.75):
        box("Wagon end",(x,0,.54),(.10,.69,.23),"blue")
    # Open passenger compartment with slatted bench, and a rear parcel well.
    box("Passenger bench",(.58,0,.58),(.28,.49,.09),"maple")
    box("Seat back",(.73,0,.72),(.062,.49,.28),"maple")
    for x in (.34,.83):
        for y in (-.29,.29):
            disk("Coach stanchion",(x,y,.82),.034,.48,"gold")
    box("Coach canopy",(.585,0,1.08),(.71,.79,.104),"blue",.052)
    for x,c in ((1.08,"mint"),(1.48,"rose")):
        box("Cargo block",(x,0,.69),(.39,.48,.51),c)
    disk("Cargo drum",(1.03,0,1.04),.187,.19,"oak")


def shelf():
    for x in (-.88,.88):
        bracket=solid("Scroll bracket",[(0,0),(.48,.48),(.48,.55),(-.07,.55),(-.07,0)],.12,(x,.24,0),"maple")
        bracket.rotation_euler.z=-pi/2
    box("Floating shelf",(0,0,.60),(2.63,.83,.17),"oak",.064)
    for i,c in enumerate(("blue","rose","mint","gold")):
        standing_book(-.13+i*.29,.685,.26,.68+.12*sin(i*2)**2,c,-.01)
    # Three turned stacking rings and a cherry finial.
    disk("Stacker foot",(-.79,0,.73),.254,.09,"oak")
    for z,r,c in ((.825,.235,"teal"),(.935,.194,"gold"),(1.035,.142,"rose")):
        disk("Stacking ring",(-.79,0,z),r,.105,c,tip=r*.88)
    ball("Cherry finial",(-.79,0,1.14),(.086,.086,.09),"maple")


def window():
    for inset,depth,width,y in ((0,.17,.16,0),(.105,.12,.09,-.081),(.169,.09,.05,-.11)):
        for side in (-1,1):
            box("Moulded jamb",(side*(1.48-inset),y,1.37),(width,depth,2.54-2*inset),"milk")
            box("Sash rail",(0,y,1.37+side*(1.27-inset)),(2.96-2*inset+width,depth,width),"milk")
    box("Centre stile",(0,-.035,1.37),(.105,.16,2.34),"milk")
    for x in (-.69,.69):
        box("Glazing bar",(x,0,1.37),(.047,.084,2.30),"milk")
    for z in (.96,1.78):
        box("Glazing bar",(0,0,z),(2.64,.09,.053),"milk")
    box("Sill apron",(0,-.044,.076),(3.06,.24,.152),"milk")
    box("Bullnose sill",(0,-.101,.164),(3.34,.46,.12),"milk")
    disk("Latch rose",(0,-.129,1.37),.055,.029,"brass",(pi/2,0,0))
    box("Turn latch",(.048,-.153,1.375),(.135,.034,.03),"brass")


def roof():
    kit.new_arch_block("Carved belfry",1.19,.94,.78,.32,M["oak"],segs=20)
    box("Cornice",(0,0,.81),(1.32,1.08,.14),"maple")
    # A square roof with a small flat seat for the turned flagstaff.
    ob=kit.new_cyl("Painted pavilion roof",.97,.078,.87,M["rose"],loc=(0,0,1.305),segs=4,bevel=.024)
    ob.rotation_euler.z=pi/4
    disk("Flagstaff",(0,0,1.94),.034,.48,"maple")
    solid("Swallowtail pennant",[(0,0),(.47,-.065),(.35,-.13),(.44,-.22),(0,-.18)],.047,(0,0,2.14),"gold")
    ball("Gilt finial",(0,0,2.20),(.057,.057,.069),"brass")


BUILDERS=(bed,chest,bookshelf,picture_book,train,shelf,window,roof)


def bounds(obj):
    coords=[obj.matrix_world @ v.co for v in obj.data.vertices]
    return [Vector([fn(v[i] for v in coords) for i in range(3)]) for fn in (min,max)]


def united(name):
    bpy.ops.object.select_all(action="SELECT")
    bpy.context.view_layer.objects.active=bpy.context.selected_objects[0]
    bpy.ops.object.convert(target="MESH")
    bpy.ops.object.join()
    obj=bpy.context.object
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    low,high=bounds(obj)
    shift=Vector((-(low.x+high.x)/2,-(low.y+high.y)/2,-low.z))
    obj.data.transform(Matrix.Translation(shift))
    obj.name="playroom_"+name
    return obj


def build(folder):
    records={}
    for name,fn in zip(BUILD_NAMES,BUILDERS):
        kit.clear_scene()
        materials(folder)
        bed(folder) if fn is bed else fn()
        obj=united(name)
        if name=="toy_train":
            obj.data.transform(Matrix.Rotation(pi/2,4,"Z"))
        path=OUT/(obj.name+".glb")
        kit.export_glb(path)
        kit.clear_scene()
        bpy.ops.import_scene.gltf(filepath=str(path))
        obj=next(o for o in bpy.context.scene.objects if o.type=="MESH")
        lo,hi=bounds(obj)
        assert abs(lo.z)<.0001 and abs(lo.x+hi.x)<.0001 and abs(lo.y+hi.y)<.0001
        records[name]=dict(file=path.name,origin=[0,0,0],triangles=kit.count_tris(),
                           bounds=dict(min=[lo.x,lo.z,-hi.y],max=[hi.x,hi.z,-lo.y]))
    (OUT/"manifest.json").write_text(json.dumps(dict(coordinates="glTF metres, Y up, +Z front, bottom centre",assets=records),indent=2)+"\n",encoding="utf8")


def render(folder):
    scene=kit.clear_scene()
    directions=((3,-5,3),(0,-1,0),(1,0,0),(0,0,1))
    for row,name in enumerate(BUILD_NAMES):
        bpy.ops.import_scene.gltf(filepath=str(OUT/("playroom_"+name+".glb")))
        original=next(o for o in bpy.context.selected_objects if o.type=="MESH")
        for col,angle in enumerate(directions):
            direction=Vector(angle)
            rot=direction.to_track_quat("Z","Y").inverted().to_matrix().to_4x4() if col!=3 else Matrix.Identity(4)
            obj=original.copy()
            scene.collection.objects.link(obj)
            points=[rot @ corner.co for corner in obj.data.vertices]
            low,high=[Vector([fn(v[i] for v in points) for i in range(3)]) for fn in (min,max)]
            factor=min(3.42/(high.x-low.x),2.53/(high.y-low.y))
            dest=Vector(((col-1.5)*3.8,(3.5-row)*2.82,0))
            obj.matrix_world=Matrix.Translation(dest-factor*(low+high)/2) @ Matrix.Scale(factor,4) @ rot
        bpy.data.objects.remove(original,do_unlink=True)
    bpy.ops.object.camera_add(location=(0,0,20))
    scene.camera=bpy.context.object
    scene.camera.data.type="ORTHO"
    scene.camera.data.ortho_scale=22.56
    for direction,energy in (((-3,5,7),2.8),((4,0,3),1.0)):
        bpy.ops.object.light_add(type="SUN")
        light=bpy.context.object
        light.rotation_euler=Vector(direction).to_track_quat("Z","Y").to_euler()
        light.data.energy=energy
        light.data.angle=.35
    scene.world=bpy.data.worlds.new("Warm studio")
    scene.world.color=(.43,.46,.48)
    scene.render.engine="CYCLES"
    scene.cycles.samples=5
    scene.cycles.use_denoising=True
    scene.render.resolution_x=1520
    scene.render.resolution_y=2256
    scene.render.resolution_percentage=100
    scene.render.filepath=str(folder/"studio.png")
    bpy.ops.render.render(write_still=True)
    subprocess.run(["python",__file__,"--label",scene.render.filepath],check=True)


if __name__=="__main__":
    OUT.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        folder=Path(tmp)
        subprocess.run(["python",__file__,"--illustrate",tmp],check=True)
        build(folder)
        render(folder)




