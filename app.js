const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const english=new Map();
$$('[data-i18n], [data-i18n-html]').forEach(el=>english.set(el,el.hasAttribute('data-i18n-html')?el.innerHTML:el.textContent));
const chinese = {
  navExplore:'探索轨迹',
  navApproach:'重建流程',
  navNext:'下一步',
  eyebrow:'第一视角 · 三维重建',
  heroTitle:'日常的动作，<br><em>新的维度。</em>',
  heroDescription:'从第一视角出发，重建双手、物体，以及连接它们的运动。换个角度，观察日常交互的每一刻。',
  exploreButton:'探索重建轨迹',
  heroNote:'持续更新的研究展示',
  introLeft:'从第一视角录像，到统一的三维空间',
  geometry:'几何',
  motion:'运动',
  approach:'重建流程',
  approachTitle:'看见。重建。<br>跟随每一刻。',
  approachDescription:'把第一视角录像转成可观察、可回放的几何与运动，从另一个角度理解交互。',
  captureTitle:'从真实经历开始',
  captureDescription:'配对的 RGB 与深度，结合相机标定，记录佩戴者视角下的日常动作。',
  reconstructTitle:'让运动拥有形状',
  reconstructDescription:'估计双手、物体几何与相机运动，将它们放入统一的公制坐标系。',
  refineTitle:'连接连续的瞬间',
  refineDescription:'利用测量深度、交互约束和时序一致性，优化重建出的运动轨迹。',
  inDevelopment:'持续探索',
  nextTitle:'不止于<br>刚性物体<span class="accent">。</span>',
  nextDescription:'走向更丰富的交互：能分离的部件，持续接触的双手，以及跨越遮挡和时间的连续轨迹。',
  roadmap1:'分别重建每个部件',
  roadmap1desc:'让容器和瓶盖拥有各自独立的几何。',
  roadmap2:'让接触更真实',
  roadmap2desc:'在单帧内，联合细化手与物体的交互。',
  roadmap3:'让交互始终连续',
  roadmap3desc:'减少完整轨迹中的高频抖动和姿态突变。',
  closingTitle:'换个视角，看日常的每一次动作。',
  backCollection:'返回轨迹集',
  footerNote:'持续探索第一视角下的三维重建。',
  credits:'数据与致谢',
  creditsTitle:'数据与致谢',
  creditsText:'最新轨迹集包含 H2O 的 12 个场景、13 条物体轨迹，保留全部帧。网格仅做网页显示轻量化，完整研究产物独立保存。',
  creditsDesign:'网站设计与实现：EGO。研究展示方式参考 EgoXperience，双方无隶属关系；本站展示的重建媒体均来自本项目。'
};

let lang='en';
function setLanguage(next){
 lang=next;document.documentElement.lang=lang==='zh'?'zh-CN':'en';
 $$('[data-i18n], [data-i18n-html]').forEach(el=>{const key=el.dataset.i18n||el.dataset.i18nHtml,value=lang==='zh'?(chinese[key]||english.get(el)):english.get(el);if(el.hasAttribute('data-i18n-html'))el.innerHTML=value;else el.textContent=value;});
 $('#language').textContent=lang==='zh'?'EN':'中文';$('#language').setAttribute('aria-label',lang==='zh'?'Switch to English':'切换到中文');
 try{localStorage.setItem('ego-language',lang);}catch{}
}
$('#language').onclick=()=>setLanguage(lang==='en'?'zh':'en');
try{if(localStorage.getItem('ego-language')==='zh')setLanguage('zh');}catch{}
const dialog=$('#credits-dialog');let previousFocus;
$('#credits-button').onclick=()=>{previousFocus=document.activeElement;dialog.showModal();};
dialog.querySelector('.close-dialog').onclick=()=>dialog.close();
dialog.addEventListener('close',()=>previousFocus?.focus());
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
