"""Export the adopted contour-guard trajectories for the existing GitHub Pages site.

Display assets only. All source files are read-only; no inference or scale fitting.
Run with the project's numpy/cv2/trimesh environment and --output on a data disk.
"""
import argparse, gzip, hashlib, json, subprocess
from collections import OrderedDict
from pathlib import Path
import cv2
import numpy as np
import trimesh
from rgbd_global_scale_trial import cases, arrays

TITLES = {
    's1h1lotion_move': ('Lotion · lift and release', '乳液瓶 · 拿起与放下'),
    's1h1spray_move': ('Spray · hand interaction', '喷雾瓶 · 手部交互'),
    's1h1chips_move': ('Chips · grasp and move', '薯片筒 · 抓取与移动'),
    's1h1espresso': ('Espresso · sequence 01', '咖啡盒 · 原始轨迹 01'),
    's1k1espresso': ('Espresso · sequence 02', '咖啡盒 · 原始轨迹 02'),
    's3k1spray': ('Spray · through occlusion', '喷雾瓶 · 遮挡过程'),
    's1h2espresso': ('Espresso · tabletop lift', '咖啡盒 · 桌面拿取'),
    's1k2espresso': ('Espresso · two-hand motion', '咖啡盒 · 双手交互'),
    's1o1espresso': ('Espresso · another viewpoint', '咖啡盒 · 不同视角'),
    's3h1espresso': ('Espresso · reach and grasp', '咖啡盒 · 接近与抓取'),
    's3k2espresso': ('Espresso + independent mug', '咖啡包装 + 独立杯子'),
    's3k1book': ('Book · lift and hold', '闭合书本 · 拿起与持握'),
}

def digest(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def write(p, d): p.write_text(json.dumps(d, ensure_ascii=False, indent=2)+'\n')
def pack_json(p, d): p.write_bytes(gzip.compress(json.dumps(d,separators=(',',':')).encode(),mtime=0))
def matrices(t): return t.transpose(0,2,1).reshape(-1,16).tolist()

def display_mesh(c, dest):
    existing=Path(c['case'])/'review/display.glb'
    native=trimesh.load(c['mesh'],force='mesh',process=False)
    if existing.exists():
        mesh=trimesh.load(existing,force='mesh',process=False)
        quality=json.loads(existing.with_name('proxy.json').read_text())
    else:
        import open3d as o3d
        proxy=o3d.geometry.TriangleMesh(o3d.utility.Vector3dVector(native.vertices),o3d.utility.Vector3iVector(native.faces)).simplify_quadric_decimation(30000)
        mesh=trimesh.Trimesh(np.asarray(proxy.vertices),np.asarray(proxy.triangles),process=False)
        errors=[]
        for source,target in [(native,mesh),(mesh,native)]:
            scene=o3d.t.geometry.RaycastingScene(nthreads=2)
            scene.add_triangles(o3d.t.geometry.TriangleMesh.from_legacy(o3d.geometry.TriangleMesh(o3d.utility.Vector3dVector(target.vertices),o3d.utility.Vector3iVector(target.faces))))
            pts,_=trimesh.sample.sample_surface(source,3000,seed=42)
            errors.extend(scene.compute_distance(o3d.core.Tensor(pts.astype('float32')),nthreads=2).numpy()*1000)
        quality={'p99_mm':float(np.quantile(errors,.99)), 'mean_mm':float(np.mean(errors))}
        if quality['p99_mm']>.4: mesh=native
    return mesh,dict(source_sha256=digest(c['mesh']),source_faces=len(native.faces),display_faces=len(mesh.faces),display_error=quality)

def scene_cloud(group, state, raw, view):
    c=group[0];K=raw['K'];C=raw['camera_to_world'];points=[];colors=[]
    # Measured depth, with all reconstructed objects and projected hands removed.
    # Multiple keyframes fill background holes; voxel averaging bounds page weight.
    for f in np.linspace(0,c['frames']-1,9).astype(int):
        rgb=cv2.imread(str(Path(c['data'])/f'rgb/{f:06d}.png'))[...,::-1]
        z=cv2.imread(str(Path(c['data'])/f'depth/{f:06d}.png'),-1).astype('float32')*.001
        excluded=np.zeros(z.shape,np.uint8)
        for obj in group:
            m=cv2.imread(str(Path(obj['source'])/f'hoi/segmentation/masks/{f:06d}.png'),0)
            assert m is not None
            excluded|=(m>0).astype('uint8')
        for hand in state['hand_vertices'][f]:
            p=hand[hand[:,2]>.05]@K.T
            if len(p)>3:
                uv=np.clip(p[:,:2]/p[:,2:3],-4000,4000).astype('int32')
                cv2.fillConvexPoly(excluded,cv2.convexHull(uv),1)
        excluded=cv2.dilate(excluded,np.ones((25,25),np.uint8))
        yy,xx=np.mgrid[0:z.shape[0]:5,0:z.shape[1]:5]
        keep=(excluded[yy,xx]==0)&(z[yy,xx]>.15)&(z[yy,xx]<2.2)
        yy,xx=yy[keep],xx[keep];zz=z[yy,xx]
        p=np.c_[(xx-K[0,2])*zz/K[0,0],(yy-K[1,2])*zz/K[1,1],zz]
        w=p@C[f,:3,:3].T+C[f,:3,3];w=w@view[:3,:3].T+view[:3,3]
        keep=np.linalg.norm(w,axis=1)<1.65
        points.append(w[keep]);colors.append(rgb[yy,xx][keep])
    points=np.concatenate(points);colors=np.concatenate(colors)
    _,inv=np.unique(np.floor(points/.009).astype('int32'),axis=0,return_inverse=True)
    counts=np.bincount(inv)
    p=np.stack([np.bincount(inv,weights=points[:,i])/counts for i in range(3)],-1)
    rgb=np.stack([np.bincount(inv,weights=colors[:,i])/counts for i in range(3)],-1)
    sel=np.linspace(0,len(p)-1,min(len(p),45000)).astype(int)
    return np.round(p[sel],5).ravel().tolist(),np.round(rgb[sel]).astype('uint8').ravel().tolist()

def export(output, qa):
    output.mkdir(parents=True,exist_ok=True);qa.mkdir(parents=True,exist_ok=True)
    selected=[c for c in cases() if c['key']!='s1h1milk_move']
    groups=OrderedDict()
    for c in selected:groups.setdefault(c['scene'],[]).append(c)
    catalog=[];checks=[]
    cv2.setNumThreads(2)
    for ident,group in groups.items():
        c=group[0];dest=output/ident;dest.mkdir(exist_ok=True)
        st=arrays(c['fixed']);raw=arrays(Path(c['base'])/'stable/observations.npz')
        n=c['frames'];C=raw['camera_to_world'];T=C@st['object_to_camera']
        center=np.median(T[:,:3,3],axis=0);view=np.eye(4);view[:3,:3]=np.diag([1,-1,-1]);view[:3,3]=-view[:3,:3]@center
        camera=view[None]@C
        hands=np.einsum('fij,fsvj->fsvi',camera[:,:3,:3],st['hand_vertices'])+camera[:,None,None,:3,3]
        lo=hands.min((0,1,2));scale=np.maximum(hands.max((0,1,2))-lo,1e-6)/65535
        packed=np.round((hands-lo)/scale).clip(0,65535).astype('<u2')
        (dest/'hands.bin.gz').write_bytes(gzip.compress(packed.tobytes(),mtime=0))
        error=float(np.linalg.norm(packed*scale+lo-hands,axis=-1).max()*1000)
        faces=[arrays(Path(c['base'])/f'stable/{s}_hand_model.npz')['faces'].astype(int).ravel().tolist() for s in ['left','right']]
        objects=[];sources=[]
        for obj in group:
            os=arrays(obj['fixed']);obs=arrays(Path(obj['base'])/'stable/observations.npz')
            np.testing.assert_array_equal(os['hand_vertices'],st['hand_vertices']);np.testing.assert_array_equal(obs['camera_to_world'],C)
            mesh,quality=display_mesh(obj,dest)
            poses=camera@os['object_to_camera']
            np.testing.assert_allclose(np.linalg.det(poses[:,:3,:3]),1,atol=2e-4)
            objects.append(dict(id=obj['key'],vertices=mesh.vertices.astype('float32').ravel().tolist(),faces=mesh.faces.astype(int).ravel().tolist(),poses=matrices(poses)))
            sources.append(dict(id=obj['key'],state_sha256=digest(obj['fixed']),camera_sha256=digest(Path(obj['base'])/'stable/observations.npz'),**quality))
        p,rgb=scene_cloud(group,st,raw,view)
        target=(hands.min((0,1,2))+hands.max((0,1,2)))/2
        radius=max(float(np.linalg.norm(hands.max((0,1,2))-hands.min((0,1,2)))/2),.3)
        position=target+camera[0,:3,:3]@np.array([.60,-.35,-1.4])*radius
        meta=dict(schema=1,id=ident,frames=n,fps=30,duration=n/30,frameIndices=list(range(n)),handVertices=hands.shape[2],handMin=lo.tolist(),handScale=scale.tolist(),handFaces=faces,objects=objects,cameraPoses=matrices(camera),K=raw['K'].tolist(),imageSize=[1280,720],points=p,colors=rgb,view=dict(position=position.tolist(),target=target.tolist(),up=(-camera[0,:3,1]).tolist()),backend='projective_guard',uniformScale=1,units='meters',handQuantizationMaxErrorMm=error,source=sources,sceneSource='Measured RGB-D background; 9 keyframes, object masks and projected hands excluded; 9 mm voxels.')
        pack_json(dest/'scene.json.gz',meta)
        subprocess.run(['ffmpeg','-nostdin','-y','-v','error','-framerate','30','-i',str(Path(c['data'])/'rgb/%06d.png'),'-frames:v',str(n),'-vf','scale=960:540','-an','-c:v','libx264','-threads','2','-preset','fast','-crf','23','-pix_fmt','yuv420p','-movflags','+faststart',str(dest/'rgb.mp4')],check=True)
        im=cv2.imread(str(Path(c['data'])/f'rgb/{n//2:06d}.png'));cv2.imwrite(str(dest/'poster.jpg'),cv2.resize(im,(480,270)),[cv2.IMWRITE_JPEG_QUALITY,86])
        title,titleZh=TITLES[ident]
        catalog.append(dict(id=ident,title=title,titleZh=titleZh,frames=n,fps=30,duration=n/30,objects=[o['key'] for o in group],group=c['group'],assetBase=f'assets/trajectories/{ident}/'))
        check=dict(id=ident,frames=n,objects=len(objects),hand_error_mm=error,scene_points=len(p)//3,bytes=sum(p.stat().st_size for p in dest.iterdir()),source=sources)
        checks.append(check);print('EXPORTED',ident,n,len(objects),check['bytes'],flush=True)
    assert len(catalog)==12 and sum(len(c['objects']) for c in catalog)==13
    write(output/'catalog.json',dict(schema=1,release='2026-11-13-contour-guard',scenes=catalog,sceneCount=12,objectCount=13,frameCount=sum(c['frames'] for c in catalog)))
    write(qa/'export_validation.json',dict(passed=True,excluded=['s1h1milk_move'],production_modified=False,checks=checks))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);p.add_argument('--qa',type=Path,required=True);a=p.parse_args()
    for path in [a.output,a.qa]:
        if not any(path.resolve().is_relative_to(Path(d)) for d in ['/data1','/data2']):p.error('Large assets must stay on a data disk')
    export(a.output,a.qa)
