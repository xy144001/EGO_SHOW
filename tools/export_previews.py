#!/usr/bin/env python3
"""Export display-only samples from existing sealed H2O trajectories. No inference."""
import argparse,gzip,hashlib,json,subprocess
from pathlib import Path
import numpy as np
import trimesh

CASES=[('coffee','h2o_340_take_out_cappuccino','Pick up a coffee carton','拿起咖啡盒'),('cocoa','h2o_408_take_out_cocoa','Reach for a cocoa box','拿取可可盒')]

def export(root,out):
    records=[]
    for ident,case,title,zh in CASES:
        src=root/case/'final';dest=out/ident;dest.mkdir(parents=True,exist_ok=True)
        d=json.loads((src/'preview_data.json').read_text());n=d['frames'];ids=np.arange(0,n,3)
        center=np.array(d['center']);flip=np.array([1,-1,-1])
        with np.load(src/'hand_geometry.npz') as h:
            v=h['vertices_camera'][ids];faces=[h['faces_left'],h['faces_right']]
        C=np.array(d['camera_poses']['final'])[ids]
        v=(np.einsum('fij,fsvj->fsvi',C[:,:3,:3],v)+C[:,None,None,:3,3]-center)*flip
        lo=v.min((0,1,2));hi=v.max((0,1,2));scale=(hi-lo)/65535
        packed=np.round((v-lo)/scale).clip(0,65535).astype('<u2')
        (dest/'hands.bin.gz').write_bytes(gzip.compress(packed.tobytes(),compresslevel=9,mtime=0))
        mesh=trimesh.load(src/'object.glb',force='mesh',process=False)
        # Deterministic vertex clustering is a display LOD, never an input to evaluation.
        vertices=np.asarray(mesh.vertices);step=max(np.ptp(vertices,axis=0))/42
        _,inverse=np.unique(np.floor((vertices-vertices.min(0))/step).astype(int),axis=0,return_inverse=True)
        count=np.bincount(inverse);verts=np.stack([np.bincount(inverse,weights=vertices[:,i])/count for i in range(3)],-1)
        f=inverse[np.asarray(mesh.faces)];f=f[(f[:,0]!=f[:,1])&(f[:,0]!=f[:,2])&(f[:,1]!=f[:,2])]
        _,ii=np.unique(np.sort(f,axis=1),axis=0,return_index=True);f=f[np.sort(ii)]
        T=np.array(d['object']['final'])[ids];view=np.eye(4);view[:3,:3]=np.diag(flip);view[:3,3]=-center*flip;T=view[None]@T
        points=(np.asarray(d['xyz'])-center)*flip;colors=np.asarray(d['rgb']);sel=np.arange(0,len(points),max(1,len(points)//2200))
        data={'schema':1,'sourceFps':30,'previewFps':10,'sourceFrames':n,'frames':len(ids),'duration':n/30,'sourceFrameIndices':[d['source_frames'][i] for i in ids],
              'handVertices':v.shape[2],'handMin':lo.tolist(),'handScale':scale.tolist(),'handFaces':[x.astype(int).ravel().tolist() for x in faces],
              'objectVertices':np.round(verts,6).ravel().tolist(),'objectFaces':f.ravel().tolist(),'objectPoses':np.round(T.transpose(0,2,1).reshape(len(ids),16),6).tolist(),
              'points':np.round(points[sel],4).ravel().tolist(),'colors':colors[sel].astype(int).ravel().tolist(),
              'source':'H2O · '+case,'note':'Historical single-object baseline; lightweight display export. 30 fps source sampled at 10 fps. No claimed ground-truth accuracy.'}
        (dest/'scene.json').write_text(json.dumps(data,separators=(',',':'))+'\n')
        subprocess.run(['ffmpeg','-nostdin','-y','-loglevel','error','-i',str(src/'source_rgb.mp4'),'-an','-vf','scale=960:-2','-c:v','libx264','-threads','2','-preset','slow','-crf','25','-pix_fmt','yuv420p','-movflags','+faststart',str(dest/'rgb.mp4')],check=True)
        subprocess.run(['ffmpeg','-nostdin','-y','-loglevel','error','-ss','2.1','-i',str(dest/'rgb.mp4'),'-frames:v','1','-q:v','3',str(dest/'poster.jpg')],check=True)
        record={'id':ident,'title':title,'titleZh':zh,'frames':n,'fps':30,'duration':n/30,'category':'single','dataset':'H2O','sourceCase':case,'sourceFrames':[d['source_frames'][0],d['source_frames'][-1]],'assets':f'assets/demos/{ident}/'}
        records.append(record);print(ident,'vertices',len(verts),'faces',len(f),'bytes',sum(p.stat().st_size for p in dest.iterdir()),flush=True)
    (out/'catalog.json').write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n')

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    for path in [a.source,a.output]:
        if not any(path.resolve().is_relative_to(Path(r)) for r in ['/data1','/data2']):p.error('Use data disks')
    export(a.source,a.output)
