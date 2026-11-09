import * as THREE from './assets/vendor/three.module.js';
import { OrbitControls } from './assets/vendor/OrbitControls.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const english = new Map();
$$('[data-i18n], [data-i18n-html]').forEach(el => english.set(el, el.hasAttribute('data-i18n-html') ? el.innerHTML : el.textContent));
const chinese = {
  navExplore:'探索轨迹', navApproach:'重建流程', navNext:'下一步', eyebrow:'第一视角 · 三维重建',
  heroTitle:'日常的动作，<br><em>新的维度。</em>',heroDescription:'从第一视角出发，重建双手、物体，以及连接它们的运动。换个角度，观察日常交互的每一刻。',
  exploreButton:'探索重建轨迹',heroNote:'持续更新的研究展示',reconstruction:'三维重建预览',loading:'正在加载重建轨迹…',hands:'双手',object:'物体',trajectory:'轨迹',orbitHint:'拖动旋转视角 · 滚动缩放',introLeft:'从第一视角录像，到统一的三维空间',geometry:'几何',motion:'运动',collection:'轨迹集',
  exploreTitle:'换个视角，<br>细看日常动作。',exploreDescription:'伸手、抓握、移动。选择一段真实录像，从新的视角探索它的三维重建。',singleObject:'单物体',multiPart:'多部件交互',inProgress:'研究中',realSequences:'真实录像，离线重建。',rigidObject:'刚性物体 · H2O',coffeeTitle:'拿起咖啡盒',coffeeDescription:'从双手接近到拿起，观察完整的三维动作。',cocoaTitle:'拿取可可盒',cocoaDescription:'在自然交互中，跟随物体和双手的运动。',frames:'帧',worldSpace:'世界坐标轨迹',datasetNote:'首批示例来自已有的 H2O 单物体基线。交互视图是轻量预览，不代表真值精度评估。',nextChapter:'下一阶段',multiTitle:'一个物体，多个运动部件。',multiDescription:'分离瓶盖与瓶身，保持手部接触，让轨迹连续。多部件案例将在验证后逐步加入。',seeDirection:'了解后续方向',approach:'重建流程',approachTitle:'看见。重建。<br>跟随每一刻。',approachDescription:'把第一视角录像转成可观察、可回放的几何与运动，从另一个角度理解交互。',captureTitle:'从真实经历开始',captureDescription:'配对的 RGB 与深度，结合相机标定，记录佩戴者视角下的日常动作。',reconstructTitle:'让运动拥有形状',reconstructDescription:'估计双手、物体几何与相机运动，将它们放入统一的公制坐标系。',refineTitle:'连接连续的瞬间',refineDescription:'利用测量深度、交互约束和时序一致性，优化重建出的运动轨迹。',inDevelopment:'持续探索',nextTitle:'不止于<br>刚性物体<span class="accent">。</span>',nextDescription:'走向更丰富的交互：能分离的部件，持续接触的双手，以及跨越遮挡和时间的连续轨迹。',roadmap1:'分别重建每个部件',roadmap1desc:'让容器和瓶盖拥有各自独立的几何。',roadmap2:'让接触更真实',roadmap2desc:'在单帧内，联合细化手与物体的交互。',roadmap3:'让交互始终连续',roadmap3desc:'减少完整轨迹中的高频抖动和姿态突变。',closingTitle:'换个视角，看日常的每一次动作。',backCollection:'返回轨迹集',footerNote:'持续探索第一视角下的三维重建。',credits:'数据与致谢',sequenceDetail:'轨迹详情',detailNote:'原始 RGB 录像。三维预览使用与它对应的离线重建结果。',inspect3d:'查看三维轨迹',creditsTitle:'数据与致谢',creditsText:'首批示例来自 H2O 数据集，展示已有的单物体基线，而非后续的多部件接触保持实验。浏览器预览对网格和动画做了轻量化处理；完整研究产物独立保存。',creditsDesign:'网站设计与实现：EGO。研究展示方式参考 EgoXperience，双方无隶属关系；本站展示的重建媒体均来自本项目。'
};
let lang='en', currentCase='cocoa', playing=!reducedMotion.matches, time=0, speed=1;
let activeData=null, renderer=null, scene=null, camera=null, controls=null, displayGroup=null, clouds=null;
let handMeshes=[], objectMesh=null, decoded=null, loadGeneration=0, requestedCase=null, playIntent=0;
const assets=new Map();
const video=$('#hero-video');
const detail=$('#detail-video');
const canvasRoot=$('#scene');
const locale = (en,zh) => lang==='zh' ? zh : en;
const caseTitle = id => locale(id==='coffee'?'Pick up a coffee carton':'Reach for a cocoa box',id==='coffee'?'拿起咖啡盒':'拿取可可盒');
function setLanguage(next){
  lang=next;document.documentElement.lang=lang==='zh'?'zh-CN':'en';
  $$('[data-i18n], [data-i18n-html]').forEach(el=>{
    const key=el.dataset.i18n||el.dataset.i18nHtml, value=lang==='zh'?(chinese[key]||english.get(el)):english.get(el);
    if(el.hasAttribute('data-i18n-html'))el.innerHTML=value;else el.textContent=value;
  });
  $('#language').textContent=lang==='zh'?'EN':'中文';
  $('#language').setAttribute('aria-label',lang==='zh'?'Switch to English':'切换到中文');
  if($('#demo-dialog').open)updateDialog();
  updatePlayButton();
  try{localStorage.setItem('ego-language',lang);}catch{}
}
$('#language').addEventListener('click',()=>setLanguage(lang==='en'?'zh':'en'));
try{if(localStorage.getItem('ego-language')==='zh')setLanguage('zh');}catch{}

function updatePlayButton(){
  $('#play-icon').textContent=playing?'Ⅱ':'▶';
  $('#play-pause').setAttribute('aria-label',playing?locale('Pause reconstruction','暂停重建播放'):locale('Play reconstruction','播放重建轨迹'));
}
function syncVideo(){
  if(!activeData)return;
  if(Number.isFinite(video.duration)&&Math.abs(video.currentTime-time)>.16)video.currentTime=Math.min(time,video.duration-.001);
  video.playbackRate=speed;
  const intent=++playIntent;
  if(playing&&!document.hidden&&!document.body.classList.contains('modal-open')){
    video.play().then(()=>{if(intent!==playIntent||!playing)video.pause();}).catch(()=>{});
  }else video.pause();
}
function setPlaying(value){playing=value;updatePlayButton();syncVideo();}
$('#play-pause').addEventListener('click',()=>setPlaying(!playing));
$('#timeline').addEventListener('input',e=>{time=Number(e.target.value);updateFrame();syncVideo();});
$('#speed').addEventListener('change',e=>{speed=Number(e.target.value);syncVideo();});
$('#reset-view').addEventListener('click',()=>{if(controls){camera.position.set(.44,.26,.68);controls.target.set(0,-.015,0);controls.update();}});
$('#scene-toggle').addEventListener('click',()=>{const pressed=$('#scene-toggle').getAttribute('aria-pressed')!=='true';$('#scene-toggle').setAttribute('aria-pressed',String(pressed));if(clouds)clouds.visible=pressed;});
video.addEventListener('loadedmetadata',syncVideo);
reducedMotion.addEventListener('change',e=>{if(e.matches)setPlaying(false);});
document.addEventListener('visibilitychange',()=>{if(document.hidden){video.pause();detail.pause();}else syncVideo();});

function setupRenderer(){
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.75));
  renderer.setClearColor(0x1c2728,0);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.3;
  canvasRoot.append(renderer.domElement);
  scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0x1c2728,.34);
  camera=new THREE.PerspectiveCamera(43,1,.01,15);camera.position.set(.44,.26,.68);
  controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.075;
  controls.target.set(0,-.015,0);controls.minDistance=.35;controls.maxDistance=2.8;controls.enablePan=false;
  scene.add(new THREE.HemisphereLight(0xf3f0dc,0x3a5a50,2.4));
  const light=new THREE.DirectionalLight(0xffece0,3.1);light.position.set(-1,2,3);scene.add(light);
  const fill=new THREE.DirectionalLight(0xc1eddc,1.4);fill.position.set(1,0,-1);scene.add(fill);
  const grid=new THREE.GridHelper(1.5,22,0x5e7b6e,0x40574e);grid.position.y=-.29;grid.material.transparent=true;grid.material.opacity=.24;scene.add(grid);
  const observer=new ResizeObserver(()=>{const {width,height}=canvasRoot.getBoundingClientRect();if(!width||!height)return;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();});observer.observe(canvasRoot);
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();showFallback('WebGL context was lost. Reload to restore 3D.');});
}
function showFallback(message){
  canvasRoot.querySelector('.scene-loading')?.remove();
  if(!canvasRoot.querySelector('.webgl-fallback')){
    const box=document.createElement('div');box.className='webgl-fallback';
    const label=document.createElement('span');label.textContent=message;
    const link=document.createElement('a');link.href=`assets/demos/${currentCase}/rgb.mp4`;link.textContent=locale('Watch the original video ↗','观看原始录像 ↗');
    box.append(label,link);canvasRoot.append(box);
  }
}
function disposeGroup(){if(!displayGroup)return;displayGroup.traverse(o=>{o.geometry?.dispose();if(o.material){const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>m.dispose());}});scene.remove(displayGroup);}
function buildScene(d,buffer){
  disposeGroup();displayGroup=new THREE.Group();scene.add(displayGroup);decoded=new Uint16Array(buffer);handMeshes=[];
  for(let side=0;side<2;side++){
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(d.handVertices*3),3));geo.setIndex(d.handFaces[side]);
    const material=new THREE.MeshStandardMaterial({color:side===0?0xd5b7a8:0xe1cdbd,roughness:.78,metalness:0,side:THREE.DoubleSide});
    const mesh=new THREE.Mesh(geo,material);mesh.frustumCulled=false;displayGroup.add(mesh);handMeshes.push(mesh);
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(d.objectVertices,3));geo.setIndex(d.objectFaces);geo.computeVertexNormals();
  objectMesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:0x8eb9a4,roughness:.6,metalness:.1,side:THREE.DoubleSide}));objectMesh.matrixAutoUpdate=false;displayGroup.add(objectMesh);
  const cloudGeo=new THREE.BufferGeometry();cloudGeo.setAttribute('position',new THREE.Float32BufferAttribute(d.points,3));
  const colors=d.colors.map(v=>v/255);cloudGeo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  clouds=new THREE.Points(cloudGeo,new THREE.PointsMaterial({size:.0045,vertexColors:true,transparent:true,opacity:.38,depthWrite:false,sizeAttenuation:true}));
  clouds.visible=$('#scene-toggle').getAttribute('aria-pressed')==='true';displayGroup.add(clouds);
  const path=d.objectPoses.map(m=>new THREE.Vector3(m[12],m[13],m[14]));
  const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(path),new THREE.LineBasicMaterial({color:0xd6ac64,transparent:true,opacity:.6}));displayGroup.add(line);
  let lastFrame=-1;
  displayGroup.userData.update=(frame)=>{
    if(frame===lastFrame)return;lastFrame=frame;
    const stride=d.handVertices*3;
    handMeshes.forEach((mesh,side)=>{
      const positions=mesh.geometry.attributes.position.array;const offset=(frame*2+side)*stride;
      for(let j=0;j<stride;j++)positions[j]=d.handMin[j%3]+decoded[offset+j]*d.handScale[j%3];
      mesh.geometry.attributes.position.needsUpdate=true;mesh.geometry.computeVertexNormals();
    });
    objectMesh.matrix.fromArray(d.objectPoses[frame]);objectMesh.matrixWorldNeedsUpdate=true;
  };
}
async function fetchData(id){
  if(assets.has(id))return assets.get(id);
  const base=`assets/demos/${id}/`;
  const job=(async()=>{
    const [meta,packed]=await Promise.all([fetch(base+'scene.json'),fetch(base+'hands.bin.gz')]);
    if(!meta.ok||!packed.ok)throw new Error('Preview assets unavailable');
    const data=await meta.json();
    if(!('DecompressionStream' in window))throw new Error('This browser cannot decode the 3D preview.');
    const buffer=await new Response(packed.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    if(buffer.byteLength!==data.frames*2*data.handVertices*3*2)throw new Error('Incomplete hand geometry');
    return {data,buffer};
  })();assets.set(id,job);
  try{return await job;}catch(e){assets.delete(id);throw e;}
}
async function loadCase(id){
  const generation=++loadGeneration;requestedCase=id;
  const loading=canvasRoot.querySelector('.scene-loading')||document.createElement('div');
  loading.className='scene-loading';loading.textContent=locale('Loading the reconstruction…','正在加载重建轨迹…');canvasRoot.append(loading);
  try{
    const {data,buffer}=await fetchData(id);if(generation!==loadGeneration)return;
    if(!renderer)setupRenderer();
    currentCase=id;activeData=data;time=0;buildScene(data,buffer);
    $('.viewer-heading .mono').textContent=id==='coffee'?'01 / 02 · 10 FPS':'02 / 02 · 10 FPS';
    canvasRoot.setAttribute('aria-label',`${caseTitle(id)} — interactive 3D reconstruction. Drag to orbit.`);
    video.poster=`assets/demos/${id}/poster.jpg`;video.src=`assets/demos/${id}/rgb.mp4`;
    $('#timeline').max=String(data.duration-.001);$('#timeline').value=0;
    loading.remove();canvasRoot.querySelector('.webgl-fallback')?.remove();updateFrame();syncVideo();
    window.egoPreview={caseId:id,sourceFrames:data.sourceFrames,previewFrames:data.frames,loaded:true};
  }catch(error){if(generation!==loadGeneration)return;loading.remove();showFallback(locale('3D preview unavailable in this browser. You can still watch the original recording.','当前浏览器无法显示三维预览，仍可观看原始录像。'));console.warn('EGO preview:',error.message);}
}
function updateFrame(){
  if(!activeData)return;
  displayGroup?.userData.update?.(Math.min(activeData.frames-1,Math.floor(time*activeData.previewFps)));
  $('#timeline').value=String(time);$('#time').textContent=`00:${String(Math.floor(time)).padStart(2,'0')}`;
}
let visible=true,last=performance.now();
new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(!visible)video.pause();else syncVideo();},{threshold:.02}).observe($('#hero-art'));
function tick(now){
  const dt=Math.min((now-last)/1000,.1);last=now;
  if(activeData&&visible&&!document.hidden&&!document.body.classList.contains('modal-open')){
    if(playing){time=(time+dt*speed)%activeData.duration;updateFrame();if(Number.isFinite(video.duration)&&Math.abs(video.currentTime-time)>.24)video.currentTime=Math.min(time,video.duration-.001);}
    controls?.update();if(renderer)renderer.render(scene,camera);
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);updatePlayButton();loadCase('cocoa');

const tabs=[$('#tab-single'),$('#tab-multi')];
function selectTab(index){tabs.forEach((tab,i)=>{const active=index===i;tab.classList.toggle('active',active);tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;$('#'+tab.getAttribute('aria-controls')).hidden=!active;});}
tabs.forEach((tab,index)=>{tab.addEventListener('click',()=>selectTab(index));tab.addEventListener('keydown',e=>{let next=index;if(e.key==='ArrowRight'||e.key==='ArrowLeft')next=1-index;else if(e.key==='Home')next=0;else if(e.key==='End')next=1;else return;e.preventDefault();selectTab(next);tabs[next].focus();});});
let detailCase='coffee',previousFocus=null;
function updateDialog(){
  $('#dialog-title').textContent=caseTitle(detailCase);
  $('#dialog-description').textContent=locale('Single-object reconstruction · H2O · Precomputed research example','单物体重建 · H2O · 已有研究示例');
  $('#detail-source').textContent=detailCase==='coffee'?'H2O / subject2 / k2 / 0':'H2O / subject2 / o1 / 5';
}
function openDialog(dialog){previousFocus=document.activeElement;dialog.showModal();document.body.classList.add('modal-open');video.pause();}
function onClose(){detail.pause();document.body.classList.remove('modal-open');syncVideo();previousFocus?.focus();}
$$('[data-open]').forEach(button=>button.addEventListener('click',()=>{
  detailCase=button.dataset.open;updateDialog();detail.poster=`assets/demos/${detailCase}/poster.jpg`;detail.src=`assets/demos/${detailCase}/rgb.mp4`;openDialog($('#demo-dialog'));
}));
$('#credits-button').addEventListener('click',()=>openDialog($('#credits-dialog')));
$$('dialog').forEach(dialog=>{dialog.querySelector('.close-dialog').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',onClose);dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});});
$('#inspect-3d').addEventListener('click',()=>{$('#demo-dialog').close();loadCase(detailCase);$('.hero').scrollIntoView({behavior:reducedMotion.matches?'instant':'smooth',block:'start'});});
