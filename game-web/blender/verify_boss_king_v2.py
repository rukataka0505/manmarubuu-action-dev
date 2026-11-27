"""Read actual GLB vertex buffers; validate geometry, axes and runtime pivots.

Run using Blender's bundled Python: blender -b --python this_file.py.
"""
import json
import hashlib
import math
import struct
from pathlib import Path

import numpy as np
from mathutils import Matrix, Quaternion, Vector

HERE=Path(__file__).resolve().parent
PATH=HERE/'boss_king_v2.glb'
raw=PATH.read_bytes();n=struct.unpack_from('<I',raw,12)[0]
j=json.loads(raw[20:20+n]);data=raw[28+n:]
dtype={5120:'i1',5121:'u1',5122:'<i2',5123:'<u2',5125:'<u4',5126:'<f4'}
components={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}


def accessor(index):
    a=j['accessors'][index];v=j['bufferViews'][a['bufferView']]
    d=np.dtype(dtype[a['componentType']]);c=components[a['type']]
    return np.ndarray((a['count'],c),dtype=d,buffer=data,
        offset=v.get('byteOffset',0)+a.get('byteOffset',0),
        strides=(v.get('byteStride',c*d.itemsize),d.itemsize)).copy()


def transform(node):
    if 'matrix' in node:return np.array(node['matrix']).reshape(4,4).T
    q=node.get('rotation',[0,0,0,1]);q=Quaternion((q[3],q[0],q[1],q[2]))
    return np.array(Matrix.Translation(Vector(node.get('translation',[0,0,0]))) @ q.to_matrix().to_4x4() @ Matrix.Diagonal((*node.get('scale',[1,1,1]),1)))


parents={child:i for i,node in enumerate(j['nodes']) for child in node.get('children',[])}
indices={node['name']:i for i,node in enumerate(j['nodes'])}
local=[transform(node) for node in j['nodes']]


def world(i):return world(parents[i])@local[i] if i in parents else local[i]


def point(matrix,p):return (matrix@np.array([*p,1]))[:3]


positions=[];triangles=0;degenerate=0;primitives=0;bad_normals=0;bad_tangents=0
for i,node in enumerate(j['nodes']):
    if 'mesh' not in node:continue
    for p in j['meshes'][node['mesh']]['primitives']:
        primitives+=1
        pos=accessor(p['attributes']['POSITION']);assert np.isfinite(pos).all()
        nor=accessor(p['attributes']['NORMAL']);tan=accessor(p['attributes']['TANGENT'])
        uv=accessor(p['attributes']['TEXCOORD_0']);assert np.isfinite(uv).all()
        bad_normals+=int(np.count_nonzero(abs(np.linalg.norm(nor,axis=1)-1)>1e-3))
        bad_tangents+=int(np.count_nonzero(abs(np.linalg.norm(tan[:,:3],axis=1)-1)>1e-3))
        assert np.all(abs(tan[:,3])==1)
        faces=accessor(p['indices']).ravel().reshape(-1,3);triangles+=len(faces)
        assert faces.min()>=0 and faces.max()<len(pos)
        area=np.linalg.norm(np.cross(pos[faces[:,1]]-pos[faces[:,0]],pos[faces[:,2]]-pos[faces[:,0]]),axis=1)
        degenerate+=int(np.count_nonzero(area<1e-10))
        positions.extend((world(i)@np.c_[pos,np.ones(len(pos))].T).T[:,:3])
assert not bad_normals and not bad_tangents,(bad_normals,bad_tangents)
assert triangles<=60000
assert degenerate==0,degenerate
positions=np.array(positions);lo=positions.min(0);hi=positions.max(0)
assert abs(lo[1])<1e-5 and 5.9<hi[1]<6.1,(lo,hi)

# Compare unchanged joint-to-fist distances for the literal runtime x rotations.
shoulders={}
for name,sx in [('Shoulder_L',1),('Shoulder_R',-1)]:
    i=indices[name];base=world(i);pivot=point(base,(0,0,0))
    p=np.array([sx*.28,-2.40,0,1]);radius=float(np.linalg.norm(p[:3]))
    checks={}
    for angle in [-2.5,0,.72]:
        r=np.array(Matrix.Rotation(angle,4,'X'));v=(base@r@p)[:3]
        assert abs(np.linalg.norm(v-pivot)-radius)<1e-5
        checks[str(angle)]=v.tolist()
    assert checks['-2.5'][1]>pivot[1]
    shoulders[name]={'pivot':pivot.tolist(),'sample_fist_positions':checks,'orbit_radius':radius}

hips={}
for name in ['Leg_L','Leg_R']:
    i=indices[name];base=world(i);pivot=point(base,(0,0,0));p=np.array([0,-1.8,.16,1])
    hip_checks={}
    for angle in [-.42,.42]:
        v=(base@np.array(Matrix.Rotation(angle,4,'X'))@p)[:3]
        assert abs(np.linalg.norm(v-pivot)-np.linalg.norm(p[:3]))<1e-5
        hip_checks[str(angle)]=v.tolist()
    hips[name]=hip_checks

# The shaft's two axial samples remain fixed under the exact .rotation.z update.
key=world(indices['BackWindupKey']);shaft=[(0,0,-.16),(0,0,-.91)]
for angle in [0,math.pi/2,math.pi,math.pi*2]:
    r=np.array(Matrix.Rotation(angle,4,'Z'))
    for p in shaft:assert np.linalg.norm(point(key@r,p)-point(key,p))<1e-6
key_axis=(point(key,shaft[1])-point(key,shaft[0]));key_axis/=np.linalg.norm(key_axis)
assert np.dot(key_axis,(0,0,-1))>.9999

detach={}
for name in ['Armor_Shoulder_L','Armor_Shoulder_R','ChestFrontShield','Armor_Skirt_F','Armor_Skirt_B','Armor_Skirt_L','Armor_Skirt_R','CrownBand']:
    i=indices[name];node=j['nodes'][i];assert 'mesh'in node
    v=np.concatenate([accessor(p['attributes']['POSITION']) for p in j['meshes'][node['mesh']]['primitives']])
    center=(v.min(0)+v.max(0))*.5
    assert np.linalg.norm(center)<.035,(name,center)
    detach[name]={'origin_world':point(world(i),(0,0,0)).tolist(),'origin_offset_from_mesh_center':float(np.linalg.norm(center))}

gold=next(m for m in j['materials'] if m['name'].startswith('Wind-up key'))['pbrMetallicRoughness']
assert abs(gold['metallicFactor']-.92)<1e-5 and abs(gold['roughnessFactor']-.16)<1e-5
assert all('bufferView'in im and 'uri'not in im for im in j['images'])
report={'status':'PASS','path':str(PATH),'sha256':hashlib.sha256(raw).hexdigest(),'triangles':triangles,'primitives':primitives,
    'degenerate_triangles':degenerate,'invalid_normals':bad_normals,'invalid_tangents':bad_tangents,
    'gltf_y_up_bounds':{'min':lo.tolist(),'max':hi.tolist(),'dimensions':(hi-lo).tolist()},
    'shoulder_runtime_rotations':shoulders,'hip_runtime_rotations':hips,
    'key_spin_axis':key_axis.tolist(),'key_shaft_invariant_at_quarter_turns':True,
    'detachable_meshes':detach,'polished_gold':gold,'embedded_images':len(j['images'])}
(HERE/'boss_v2_runtime_qa.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('BOSS_V2_RUNTIME_QA '+json.dumps(report),flush=True)
