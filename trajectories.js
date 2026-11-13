import {gunzipSync} from './assets/vendor/fflate.module.js';
let THREE,OrbitControls,rendererPromise,graphicsMode,resizeObserver;

const $=s=>document.querySelector(s);
const root=$('#trajectory-canvas'), video=$('#trajectory-video');
const layerInputs=[...document.querySelectorAll('[data-layer]')];
const colors=[0x62c4e0,0xd599e9];
let catalog,record,data,packed,renderer,scene,camera,controls,group,cloud,cameraLayer,frustum;
let hands=[],objects=[],axes=[],frame=0,lastFrame=-1,playing=false,speed=1,elapsed=0;
let request=0,controller,visible=false,decodedTime=null,mediaFailed=false,contextLost=false,lastError=null;
let lastTick=performance.now();
const decodedFrameClock='requestVideoFrameCallback' in video;
const zh=()=>document.documentElement.lang.startsWith('zh');
const text=(en,cn)=>zh()?cn:en;

function status(message,retry=false){$('#trajectory-status-message').textContent=message;$('#trajectory-status').hidden=!message;$('#trajectory-retry').hidden=!retry;}
function dispose(){
  if(!group)return;
  group.traverse(o=>{o.geometry?.dispose();if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());});
  scene.remove(group);group=null;hands=[];objects=[];axes=[];
}
async function init(){
  const canvas=document.createElement('canvas');
  let context;
  try{context=canvas.getContext('webgl2',{antialias:true,alpha:false});}catch{}
  if(context){
    [THREE,{OrbitControls}]=await Promise.all([import('./assets/vendor/three.module.js'),import('./assets/vendor/OrbitControls.js')]);graphicsMode='webgl2';
  }else{
    try{context=canvas.getContext('webgl',{antialias:false,alpha:false});}catch{}
    if(!context){const error=new Error('No WebGL graphics context is available');error.code='WEBGL_UNAVAILABLE';throw error;}
    [THREE,{OrbitControls}]=await Promise.all([import('./assets/vendor/webgl1/three.module.js'),import('./assets/vendor/webgl1/OrbitControls.js')]);graphicsMode='webgl1';
  }
  renderer=new THREE.WebGLRenderer({canvas,context});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor(0x172d29);renderer.outputColorSpace=THREE.SRGBColorSpace;
  root.prepend(renderer.domElement);scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(46,1,.005,15);
  controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=.08;controls.maxDistance=4;
  scene.add(new THREE.HemisphereLight(0xfff9ec,0x5a7e72,2));
  const key=new THREE.DirectionalLight(0xfff4e3,2.4);key.position.set(-1,2,3);scene.add(key);
  resizeObserver=new ResizeObserver(()=>{const w=root.clientWidth,h=root.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();});resizeObserver.observe(root);
  canvas.addEventListener('webglcontextlost',e=>{if(renderer?.domElement!==canvas)return;e.preventDefault();contextLost=true;playing=false;syncVideo();status(text('The browser paused 3D graphics. Retry to restore the view.','浏览器暂停了三维图形。请点击重新加载恢复。'),true);snapshot();});
  canvas.addEventListener('webglcontextrestored',()=>{if(renderer?.domElement!==canvas)return;contextLost=false;if(data){build();status('');}});
}
function ensureRenderer(){
  if(renderer&&!contextLost)return Promise.resolve();
  if(contextLost){
    dispose();controls.dispose();resizeObserver.disconnect();renderer.dispose();renderer.domElement.remove();
    renderer=null;rendererPromise=null;contextLost=false;
  }
  if(!rendererPromise)rendererPromise=init().catch(e=>{rendererPromise=null;throw e;});return rendererPromise;
}
function reset(){if(!data||!camera)return;camera.position.fromArray(data.view.position);camera.up.fromArray(data.view.up);controls.target.fromArray(data.view.target);camera.position.sub(controls.target).multiplyScalar(1.22).add(controls.target);controls.update();}
function meshGeometry(vertices,faces){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(faces);g.computeVertexNormals();return g;}
function cameraGeometry(){
  const k=data.K,[w,h]=data.imageSize,z=.095;
  const p=[[0,0,0],...[[0,0],[w,0],[w,h],[0,h]].map(([x,y])=>[(x-k[0][2])*z/k[0][0],(y-k[1][2])*z/k[1][1],z])];
  const edges=[[0,1],[0,2],[0,3],[0,4],[1,2],[2,3],[3,4],[4,1]];
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(edges.flatMap(e=>e.flatMap(i=>p[i])),3));return g;
}
function build(){
  dispose();group=new THREE.Group();scene.add(group);
  for(let i=0;i<2;i++){
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(data.handVertices*3),3));g.setIndex(data.handFaces[i]);
    const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:i?0xe5ae68:0x83cb9d,roughness:.76,side:THREE.DoubleSide}));
    m.frustumCulled=false;group.add(m);hands.push(m);
  }
  data.objects.forEach((obj,i)=>{
    const m=new THREE.Mesh(meshGeometry(obj.vertices,obj.faces),new THREE.MeshStandardMaterial({color:colors[i%colors.length],roughness:.65,side:THREE.DoubleSide}));
    m.matrixAutoUpdate=false;group.add(m);objects.push(m);
    const a=new THREE.AxesHelper(.085);a.matrixAutoUpdate=false;a.renderOrder=2;group.add(a);axes.push(a);
  });
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(data.points,3));
  const col=new Float32Array(data.colors.length);
  for(let i=0;i<col.length;i++){const v=data.colors[i]/255;col[i]=v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}
  g.setAttribute('color',new THREE.BufferAttribute(col,3));
  cloud=new THREE.Points(g,new THREE.PointsMaterial({vertexColors:true,size:.007,transparent:true,opacity:.45,depthWrite:false}));group.add(cloud);
  cameraLayer=new THREE.Group();group.add(cameraLayer);
  frustum=new THREE.LineSegments(cameraGeometry(),new THREE.LineBasicMaterial({color:0xffd79a}));frustum.matrixAutoUpdate=false;cameraLayer.add(frustum);
  const points=data.cameraPoses.map(m=>new THREE.Vector3(m[12],m[13],m[14]));
  cameraLayer.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0xffd79a,transparent:true,opacity:.7})));
  applyLayers();lastFrame=-1;reset();update();
}
function applyLayers(){
  if(!group)return;
  const checked=id=>$(`[data-layer="${id}"]`).checked;
  cloud.visible=checked('scene');hands[0].visible=checked('left');hands[1].visible=checked('right');
  objects.forEach(m=>m.visible=checked('objects'));axes.forEach(a=>a.visible=checked('axes'));cameraLayer.visible=checked('camera');
  snapshot();
}
function snapshot(){
  window.egoTrajectories={loaded:!!data&&!!group&&!contextLost,id:record?.id,frame,frames:data?.frames,playing,decodedTime,graphicsMode,mediaFailed,error:lastError,
    objectCount:objects.length,scenePoints:data?.points.length/3,
    layers:group?{scene:cloud.visible,left:hands[0].visible,right:hands[1].visible,objects:objects.every(m=>m.visible),axes:axes.every(a=>a.visible),camera:cameraLayer.visible}:{},
    objectMatrices:objects.map(o=>o.matrix.elements.slice()),cameraMatrix:frustum?.matrix.elements.slice(),
    handSample:hands[0]?Array.from(hands[0].geometry.attributes.position.array.slice(0,3)):null};
}
function update(){
  if(!data||!group)return;
  if(frame!==lastFrame){
    const stride=data.handVertices*3;
    hands.forEach((m,side)=>{const p=m.geometry.attributes.position.array,offset=(frame*2+side)*stride;for(let j=0;j<stride;j++)p[j]=data.handMin[j%3]+packed[offset+j]*data.handScale[j%3];m.geometry.attributes.position.needsUpdate=true;m.geometry.computeVertexNormals();});
    objects.forEach((m,i)=>{m.matrix.fromArray(data.objects[i].poses[frame]);m.matrixWorldNeedsUpdate=true;axes[i].matrix.copy(m.matrix);axes[i].matrixWorldNeedsUpdate=true;});
    frustum.matrix.fromArray(data.cameraPoses[frame]);frustum.matrixWorldNeedsUpdate=true;lastFrame=frame;
  }
  $('#trajectory-timeline').value=frame;
  $('#trajectory-counter').textContent=`${String(frame+1).padStart(3,'0')} / ${data.frames}`;
  $('#trajectory-time').textContent=`${(frame/data.fps).toFixed(2)} / ${data.duration.toFixed(2)} s`;
  snapshot();
}
function syncVideo(force=false){
  if(!data)return;
  if(!mediaFailed&&Number.isFinite(video.duration)&&(force||Math.abs(video.currentTime-elapsed)>.10))video.currentTime=Math.min(elapsed,video.duration-.001);
  video.playbackRate=speed;
  if(playing&&visible&&!document.hidden&&!mediaFailed){if(!video.seeking)video.play().catch(()=>{});}else video.pause();
  transport();
}
function transport(){
  $('#trajectory-play').textContent=playing?'Ⅱ':'▶';
  $('#trajectory-play').setAttribute('aria-label',playing?text('Pause','暂停'):text('Play','播放'));
  $('#trajectory-play').setAttribute('aria-pressed',String(playing));snapshot();
}
function seek(f){if(!data)return;playing=false;frame=Math.max(0,Math.min(data.frames-1,f));elapsed=frame/data.fps;update();syncVideo(true);}
async function fetchAsset(url,signal,kind){
  let failure;
  for(let attempt=0;attempt<3;attempt++){
    if(signal.aborted)throw new DOMException('Cancelled','AbortError');
    const local=new AbortController(),cancel=()=>local.abort();signal.addEventListener('abort',cancel,{once:true});
    const timer=setTimeout(()=>local.abort(),45000);
    try{
      const response=await fetch(url+(attempt?`?retry=${attempt}`:''),{signal:local.signal,cache:attempt?'reload':'default'});
      if(!response.ok)throw Error(`HTTP ${response.status}`);
      const bytes=new Uint8Array(await response.arrayBuffer());
      // Some servers/proxies decode Content-Encoding before fetch returns bytes.
      // Inspect the body instead of assuming every .gz response needs decompression.
      const decoded=bytes[0]===31&&bytes[1]===139?gunzipSync(bytes):bytes;
      return kind==='json'?JSON.parse(new TextDecoder().decode(decoded)):decoded.buffer.slice(decoded.byteOffset,decoded.byteOffset+decoded.byteLength);
    }catch(e){
      if(signal.aborted)throw new DOMException('Cancelled','AbortError');
      failure=Object.assign(new Error(`${url}: ${e.message}`),{code:'ASSET_DOWNLOAD',resource:url});
    }finally{clearTimeout(timer);signal.removeEventListener('abort',cancel);}
    if(attempt<2)await new Promise(resolve=>setTimeout(resolve,350*(attempt+1)));
  }
  throw failure;
}
async function select(r){
  const generation=++request;controller?.abort();controller=new AbortController();
  playing=false;video.pause();data=null;record=r;lastError=null;mediaFailed=false;decodedTime=null;frame=0;elapsed=0;window.egoTrajectories={loaded:false,id:r.id};
  $('#trajectory-timeline').disabled=true;$('#trajectory-play').disabled=true;
  document.querySelectorAll('[data-trajectory]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.trajectory===r.id)));
  renderText();status(text('Loading this sequence…','正在加载轨迹…'));root.setAttribute('aria-busy','true');
  video.poster=r.assetBase+'poster.jpg';$('#trajectory-video-link').href=r.assetBase+'rgb.mp4';
  $('#trajectory-media-status').hidden=true;$('#trajectory-video-retry').hidden=true;
  // The recording is independently playable, including while 3D is downloading.
  video.src=r.assetBase+'rgb.mp4';video.load();
  try{
    const [meta,buf]=await Promise.all([fetchAsset(r.assetBase+'scene.json.gz',controller.signal,'json'),fetchAsset(r.assetBase+'hands.bin.gz',controller.signal,'array')]);
    if(generation!==request)return;
    if(meta.id!==r.id||meta.frames!==r.frames||buf.byteLength!==meta.frames*2*meta.handVertices*3*2)throw Object.assign(new Error('Incomplete trajectory data'),{code:'ASSET_DOWNLOAD'});
    await ensureRenderer();if(generation!==request)return;
    data=meta;packed=new Uint16Array(buf);elapsed=Number.isFinite(video.currentTime)?video.currentTime:0;frame=Math.min(data.frames-1,Math.floor(elapsed*data.fps+1e-4));playing=!video.paused&&!mediaFailed;
    build();$('#trajectory-timeline').max=data.frames-1;$('#trajectory-timeline').disabled=false;$('#trajectory-play').disabled=false;
    status('');root.setAttribute('aria-busy','false');syncVideo(true);renderText();
  }catch(e){
    if(generation!==request||e.name==='AbortError')return;
    lastError={code:e.code||'RENDER_INITIALIZATION',message:e.message,resource:e.resource||null};
    data=null;dispose();
    status(e.code==='WEBGL_UNAVAILABLE'?text('The browser could not start 3D graphics. Enable graphics acceleration or retry; the video can still play.','浏览器无法启用三维图形。可开启图形加速后重试，原视频仍可直接播放。'):text('Could not load the 3D trajectory. Retry the download; the video can play independently.','三维轨迹加载失败，请点击重试；原视频可以独立播放。'),true);
    root.setAttribute('aria-busy','false');snapshot();console.warn('Trajectory viewer:',lastError);
  }
}
function renderText(){
  document.querySelectorAll('[data-t-en]').forEach(el=>el.textContent=zh()?el.dataset.tZh:el.dataset.tEn);
  if(!record)return;
  $('#trajectory-title').textContent=zh()?record.titleZh:record.title;
  $('#trajectory-id').textContent=record.id;
  $('#trajectory-meta').textContent=`${record.frames} ${text('frames','帧')} · 30 fps · ${record.duration} s · ${record.objects.length} ${text(record.objects.length===1?'object':'objects','个物体')}`;
  $('#trajectory-object-list').textContent=record.objects.length===2?text('Coffee package + separate tabletop mug','咖啡包装 + 桌上独立杯子'):text('One reconstructed rigid object','一个重建刚性物体');
  $('#trajectory-note').textContent=record.objects.length===2?text('The mug stays on the table. Both object tracks share the same hands and camera.','杯子位于桌面；两个物体轨迹共享同一组手部与相机。'):text('Drag to orbit, scroll to zoom. Pause and step through every captured frame.','拖动旋转、滚轮缩放；暂停后可逐帧查看。');
  document.querySelectorAll('[data-trajectory]').forEach(b=>{const r=catalog.scenes.find(s=>s.id===b.dataset.trajectory);b.querySelector('.trajectory-card-name').textContent=zh()?r.titleZh:r.title;});
}
layerInputs.forEach(i=>i.addEventListener('change',applyLayers));
$('#trajectory-reset').onclick=reset;
$('#trajectory-retry').onclick=()=>{if(record)select(record);};
$('#trajectory-video-retry').onclick=()=>{if(record){mediaFailed=false;$('#trajectory-media-status').hidden=true;$('#trajectory-video-retry').hidden=true;video.src=record.assetBase+'rgb.mp4?retry='+Date.now();video.load();}};
$('#trajectory-play').onclick=()=>{if(!data)return;playing=!playing;syncVideo();};
$('#trajectory-prev').onclick=()=>seek(frame-1);$('#trajectory-next').onclick=()=>seek(frame+1);
$('#trajectory-timeline').oninput=e=>seek(Number(e.target.value));
$('#trajectory-speed').onchange=e=>{speed=Number(e.target.value);syncVideo();};
video.addEventListener('loadedmetadata',()=>syncVideo(true));
video.addEventListener('canplay',()=>{mediaFailed=false;$('#trajectory-media-status').hidden=true;$('#trajectory-video-retry').hidden=true;if(data&&playing)syncVideo();});
video.addEventListener('error',()=>{mediaFailed=true;$('#trajectory-media-status').hidden=false;$('#trajectory-media-status').textContent=text('The RGB recording could not load. 3D playback is still available.','原视频暂时无法加载，三维轨迹仍可播放。');$('#trajectory-video-retry').hidden=false;snapshot();});
video.addEventListener('play',()=>{if(data){playing=true;transport();}});
video.addEventListener('pause',()=>{if(data&&!mediaFailed){playing=false;transport();}});
video.addEventListener('ratechange',()=>{
  speed=video.playbackRate;const menu=$('#trajectory-speed'),value=String(speed);
  if(![...menu.options].some(o=>o.value===value))menu.add(new Option(value+'×',value));menu.value=value;
});
// Browsers round seeks to microseconds; the small epsilon preserves exact frame steps.
video.addEventListener('seeked',()=>{if(data&&!mediaFailed){elapsed=video.currentTime;frame=Math.min(data.frames-1,Math.floor(elapsed*data.fps+1e-4));update();}if(playing&&visible&&!document.hidden)video.play().catch(()=>{});});
document.addEventListener('visibilitychange',()=>syncVideo());
new MutationObserver(renderText).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;syncVideo();},{threshold:.01}).observe($('#trajectory-player'));
function decodedFrame(now,metadata){
  decodedTime=metadata.mediaTime;
  if(data&&playing&&visible&&!document.hidden&&!contextLost&&!mediaFailed){
    elapsed=decodedTime;frame=Math.min(data.frames-1,Math.floor(elapsed*data.fps+1e-4));update();renderer.render(scene,camera);
  }
  video.requestVideoFrameCallback(decodedFrame);
}
if(decodedFrameClock)video.requestVideoFrameCallback(decodedFrame);
function tick(now){
  const dt=Math.min((now-lastTick)/1000,.1);lastTick=now;
  if(data&&visible&&!document.hidden&&!contextLost){
    // On older browsers, use the media clock instead of a separate animation timer.
    if(playing&&(mediaFailed||!decodedFrameClock)){elapsed=mediaFailed?(elapsed+dt*speed)%data.duration:video.currentTime;frame=Math.min(data.frames-1,Math.floor(elapsed*data.fps+1e-4));update();}
    const moved=controls.update();if(!playing||mediaFailed||!decodedFrameClock||moved)renderer.render(scene,camera);
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
fetch('assets/trajectories/catalog.json').then(r=>{if(!r.ok)throw Error('Catalog unavailable');return r.json();}).then(c=>{
  catalog=c;
  c.scenes.forEach((r,i)=>{
    const b=document.createElement('button');b.className='trajectory-card';b.dataset.trajectory=r.id;b.setAttribute('aria-pressed','false');
    const img=document.createElement('img');img.src=r.assetBase+'poster.jpg';img.alt='';img.loading='lazy';img.width=480;img.height=270;
    const title=document.createElement('span');title.className='trajectory-card-name';title.textContent=zh()?r.titleZh:r.title;
    const number=document.createElement('span');number.className='trajectory-card-number';number.textContent=`${String(i+1).padStart(2,'0')} / ${r.duration}s`;
    b.append(img,number,title);b.onclick=()=>select(r);$('#trajectory-cases').append(b);
  });
  const id=new URLSearchParams(location.search).get('sequence');select(c.scenes.find(s=>s.id===id)||c.scenes[0]);
}).catch(e=>{status(text('The trajectory catalog could not load. Please refresh.','轨迹目录加载失败，请刷新。'));console.warn(e.message);});
