import*as T from'three';
import{OrbitControls}from'three/addons/controls/OrbitControls.js';
import{TransformControls}from'three/addons/controls/TransformControls.js';
import{GLTFLoader}from'three/addons/loaders/GLTFLoader.js';
import{GLTFExporter}from'three/addons/exporters/GLTFExporter.js';
import{OBJLoader}from'three/addons/loaders/OBJLoader.js';
import{OBJExporter}from'three/addons/exporters/OBJExporter.js';

const $=s=>document.querySelector(s),el=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e};
const ease=p=>1+2.70158*Math.pow(p-1,3)+1.70158*Math.pow(p-1,2);
const P={name:'MyProject',handle:null,named:false,state:'New Project'};
let S=null,H=[],hi=-1,saved=null,forceDirty=false,anim={dur:5,keys:{}},tm=0,playing=false,fx=[],moved=false,helpers=[],last=performance.now(),fc=0,ft=last,fps=60;
let cameraMode=false,cameraSavedState=null,textures=new Map();

/* ---------- Viewport ---------- */
const vp=$('#vp'),R=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
R.setPixelRatio(Math.min(devicePixelRatio,2));R.shadowMap.enabled=true;R.shadowMap.type=T.PCFSoftShadowMap;R.toneMapping=T.ACESFilmicToneMapping;R.autoClear=true;
vp.prepend(R.domElement);
const scene=new T.Scene(),root=new T.Group(),aux=new T.Group();scene.add(root,aux);scene.background=new T.Color('#25272b');
const cam=new T.PerspectiveCamera(50,1,.1,500);cam.position.set(6,5,8);
const orbit=new OrbitControls(cam,R.domElement);orbit.enableDamping=true;orbit.dampingFactor=.08;orbit.target.set(0,.5,0);
const ax=(v,c)=>new T.Line(new T.BufferGeometry().setFromPoints([v.clone().multiplyScalar(-20),v.clone().multiplyScalar(20)]),new T.LineBasicMaterial({color:c,transparent:true,opacity:.75}));
aux.add(new T.GridHelper(40,40,0x4a4d55,0x30323a),ax(new T.Vector3(1,0,0),0xe5484d),ax(new T.Vector3(0,1,0),0x46c46a),ax(new T.Vector3(0,0,1),0x4d8df7));
const tc=new TransformControls(cam,R.domElement);tc.setSize(innerWidth<820?1.4:1);scene.add(tc);
tc.addEventListener('dragging-changed',e=>{orbit.enabled=!e.value;if(!e.value&&moved){moved=false;commit()}});
tc.addEventListener('objectChange',()=>{moved=true;syncProps();dirtyMark()});
const sel=new T.BoxHelper(new T.Object3D(),0xe87d0d);sel.material.transparent=true;sel.material.depthTest=false;sel.visible=false;aux.add(sel);
R.domElement.style.touchAction='none';
new ResizeObserver(()=>{const w=vp.clientWidth,h=vp.clientHeight;if(!w||!h)return;R.setSize(w,h);cam.aspect=w/h;cam.updateProjectionMatrix()}).observe(vp);

/* ---------- Helpers: tween, toast, modal ---------- */
const tween=(d,f,end)=>fx.push({t:performance.now(),d,f,end});
function toast(m,t='ok'){const d=el('div','toast '+t,m);$('#toasts').append(d);setTimeout(()=>{d.classList.add('out');setTimeout(()=>d.remove(),320)},2600)}
const ask=(msg,btns,input)=>new Promise(r=>{const d=$('#modal'),b=$('#mb'),i=$('#mi');$('#mm').textContent=msg;i.hidden=input==null;if(input!=null)i.value=input;b.replaceChildren();
  btns.forEach((t,k)=>{const x=el('button',k?'':'pri',t);x.onclick=()=>{d.classList.remove('on');r({i:k,v:i.value})};b.append(x)});d.classList.add('on');setTimeout(()=>input!=null?i.select():b.firstChild.focus(),60)});
const dl=(b,n)=>{const a=el('a');a.href=URL.createObjectURL(b);a.download=n;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000)};
const clean=s=>s.replace(/[\\/:*?"<>|]+/g,'').trim()||'MyProject';
const dispose=o=>o.traverse(c=>{c.geometry&&c.geometry.dispose();[].concat(c.material||[]).forEach(m=>m.dispose())});
const find=id=>root.getObjectByProperty('uuid',id);

/* ---------- Upgrade features ---------- */
function activeCamera(){return root.children.find(o=>o.isCamera&&o.userData.active&&o.visible)||root.children.find(o=>o.isCamera&&o.visible)}
function cloneObject(o){if(!o){toast('Select an object first.','warn');return}const c=o.clone(true);c.name=uniq(o.name.replace(/\.\d{3}$/,'')+'.Clone');c.position.add(new T.Vector3(.7,0,.7));c.userData={...o.userData,clonedFrom:o.uuid};c.traverse(x=>{if(x.isMesh){x.material=x.material?.clone();x.geometry=x.geometry?.clone()}});root.add(c);if(anim.keys[o.uuid])anim.keys[c.uuid]=JSON.parse(JSON.stringify(anim.keys[o.uuid]));rebuild();select(c);ring(c.position);commit();toast('Object cloned.');return c}
const cloneSelected=()=>cloneObject(S);
function enterCameraMode(){const ac=activeCamera();if(!ac){toast('Add or select a camera first.','warn');return}cameraSavedState={playing,tm};cameraMode=true;$('#cameraMode').hidden=false;$('#cameraName').textContent=ac.name;orbit.enabled=false;tc.detach();tc.visible=false;aux.visible=false;document.documentElement.requestFullscreen?.().catch(()=>{});syncCameraMode()}
function exitCameraMode(){cameraMode=false;$('#cameraMode').hidden=true;tc.visible=true;aux.visible=true;orbit.enabled=true;if(document.fullscreenElement)document.exitFullscreen?.().catch(()=>{});if(cameraSavedState){playing=cameraSavedState.playing;tm=cameraSavedState.tm;cameraSavedState=null}}
function syncCameraMode(){const ac=activeCamera();if(!cameraMode||!ac)return;$('#cameraName').textContent=ac.name+' · '+(ac.userData.active?'ACTIVE':'CAMERA');$('#cameraTime').textContent=tm.toFixed(2)+'s';$('#cameraStatus').textContent=playing?'PLAYING':'PAUSED'}
function imageOnSelected(file){if(!S||!S.isMesh){toast('Select a mesh/block first.','warn');return}if(!file||file.type!=='image/png'){toast('Only PNG images are supported.','warn');return}const url=URL.createObjectURL(file);new T.TextureLoader().load(url,tex=>{tex.colorSpace=T.SRGBColorSpace;if(S.material){S.material.map=tex;S.material.needsUpdate=true;textures.set(S.uuid,tex);S.userData.imageTexture=true;S.userData.imageName=file.name;dirtyMark();commit();toast('PNG applied to selected block.')}URL.revokeObjectURL(url)},undefined,()=>{URL.revokeObjectURL(url);toast('Failed to load PNG.','err')})}
function removeImageFromSelected(){if(!S?.material?.map){toast('This block has no PNG image.','warn');return}S.material.map.dispose();S.material.map=null;S.material.needsUpdate=true;S.userData.imageTexture=false;textures.delete(S.uuid);dirtyMark();commit();toast('PNG removed.')}
function showHelp(){const d=$('#modal'),b=$('#mb'),i=$('#mi');i.hidden=true;$('#mm').innerHTML=`<b>Mini Blender Help</b><div class="helpGrid"><div class="helpItem"><b>G / R / S</b>Move, Rotate, Scale</div><div class="helpItem"><b>F</b>Focus object</div><div class="helpItem"><b>Shift+D</b>Clone object</div><div class="helpItem"><b>Delete</b>Delete object</div><div class="helpItem"><b>Ctrl+Z / Y</b>Undo / Redo</div><div class="helpItem"><b>Camera</b>Fullscreen camera</div><div class="helpItem"><b>Key</b>Insert keyframe</div><div class="helpItem"><b>PNG</b>Apply / remove image</div><div class="helpItem"><b>Play / Pause</b>Preview animation</div><div class="helpItem"><b>Outliner</b>Rename / hide / delete</div><div class="helpItem"><b>Save / Open</b>Project files</div><div class="helpItem"><b>?</b>Open help</div></div>`;b.replaceChildren();const x=el('button','pri','Close');x.onclick=()=>d.classList.remove('on');b.append(x);d.classList.add('on')}

/* ---------- Objects ---------- */
const G={Cube:()=>new T.BoxGeometry(1,1,1),Sphere:()=>new T.SphereGeometry(.6,48,32),Cylinder:()=>new T.CylinderGeometry(.5,.5,1.2,48),Cone:()=>new T.ConeGeometry(.6,1.2,48),Plane:()=>new T.PlaneGeometry(2,2),Torus:()=>new T.TorusGeometry(.6,.22,24,64)};
const uniq=b=>{let n=b,i=1;while(root.children.some(c=>c.name===n))n=b+'.'+String(i++).padStart(3,'0');return n};
function mesh(k,name){const m=new T.Mesh(G[k](),new T.MeshStandardMaterial({color:'#b9bdc7',metalness:.1,roughness:.55,side:k=='Plane'?2:0}));m.name=uniq(name||k);m.castShadow=m.receiveShadow=true;if(k=='Plane')m.rotation.x=-Math.PI/2;else m.position.y=.6;return m}
function light(t){const l=t=='Ambient'?new T.AmbientLight('#ffffff',.5):t=='Directional'?new T.DirectionalLight('#ffffff',2.2):new T.PointLight('#ffd9b0',40,0,2);
  l.name=uniq(t+' Light');if(t=='Directional'){l.position.set(5,8,4);l.castShadow=true;l.shadow.mapSize.set(1024,1024);Object.assign(l.shadow.camera,{left:-8,right:8,top:8,bottom:-8});l.shadow.camera.updateProjectionMatrix()}else if(t=='Point')l.position.set(-4,3,2);return l}
function camera(){const c=new T.PerspectiveCamera(45,16/9,.1,100);c.name=uniq('Camera');c.position.copy(cam.position);c.quaternion.copy(cam.quaternion);if(!root.children.some(o=>o.isCamera&&o.userData.active))c.userData.active=true;return c}
function ring(p){const m=new T.Mesh(new T.RingGeometry(.4,.45,64),new T.MeshBasicMaterial({color:0xe87d0d,transparent:true,depthWrite:false,side:2}));m.rotation.x=-Math.PI/2;m.position.set(p.x,.02,p.z);aux.add(m);
  tween(750,k=>{m.scale.setScalar(1+k*4);m.material.opacity=.9*(1-k)},()=>{aux.remove(m);m.geometry.dispose();m.material.dispose()})}
function add(o){root.add(o);rebuild();const s=o.scale.clone();o.scale.multiplyScalar(.001);ring(o.position);
  tween(450,p=>o.scale.copy(s).multiplyScalar(Math.max(ease(p),.001)),()=>{o.scale.copy(s);commit()});select(o)}
const addMesh=k=>add(mesh(k));
function rebuild(){helpers.forEach(h=>{aux.remove(h);h.dispose&&h.dispose()});helpers=[];
  root.children.forEach(o=>{const h=o.isDirectionalLight?new T.DirectionalLightHelper(o,1.2):o.isPointLight?new T.PointLightHelper(o,.25):o.isCamera?new T.CameraHelper(o):null;if(h){helpers.push(h);aux.add(h)}});rows()}
function clearRoot(){tc.detach();[...root.children].forEach(c=>{root.remove(c);dispose(c)})}
function del(){if(!S)return;const o=S;select(null);root.remove(o);dispose(o);delete anim.keys[o.uuid];rebuild();commit()}
async function clearScene(){if(!root.children.length){toast('Nothing to clear.','warn');return}
  const r=await ask('Clear the whole scene? Every object will be removed.',['Clear','Cancel']);if(r.i)return;select(null);clearRoot();anim={dur:5,keys:{}};rebuild();commit();toast('Scene cleared.')}

/* ---------- Selection ---------- */
function select(o){S=o||null;if(S&&S.visible)tc.attach(S);else tc.detach();sel.visible=!!(S&&S.visible&&(S.isMesh||S.isGroup));rows();syncProps();markers()}
const rc=new T.Raycaster(),m2=new T.Vector2();let dn=null;
R.domElement.addEventListener('pointerdown',e=>{dn=tc.axis?null:[e.clientX,e.clientY]});
R.domElement.addEventListener('pointerup',e=>{if(!dn||tc.dragging)return;if(Math.hypot(e.clientX-dn[0],e.clientY-dn[1])>5)return;
  const b=R.domElement.getBoundingClientRect();m2.set((e.clientX-b.left)/b.width*2-1,-(e.clientY-b.top)/b.height*2+1);rc.setFromCamera(m2,cam);
  const h=rc.intersectObjects(root.children.filter(o=>o.visible&&!o.isLight&&!o.isCamera),true)[0];let o=h&&h.object;while(o&&o.parent!==root)o=o.parent;select(o||null);dn=null});
function setMode(m){tc.setMode(m);document.querySelectorAll('#tools [data-m]').forEach(b=>b.classList.toggle('on',b.dataset.m==m))}
function focus(){if(!S)return;let b=new T.Box3().setFromObject(S);if(b.isEmpty())b.setFromCenterAndSize(S.position,new T.Vector3(1,1,1));
  const c=b.getCenter(new T.Vector3()),r=Math.max(b.getSize(new T.Vector3()).length(),1),p0=cam.position.clone(),t0=orbit.target.clone(),d=p0.clone().sub(t0).normalize().multiplyScalar(r*1.8);
  tween(500,k=>{k=1-Math.pow(1-k,3);orbit.target.lerpVectors(t0,c,k);cam.position.lerpVectors(p0,c.clone().add(d),k)})}

/* ---------- Outliner ---------- */
function rows(){const L=$('#outl');L.replaceChildren(el('h3','','Scene Collection'));
  root.children.forEach(o=>{const r=el('div','row'+(o===S?' on':'')+(o.visible?'':' off'));
    const mk=(t,f,ti)=>{const b=el('button','',t);b.title=ti;b.setAttribute('aria-label',ti);b.onclick=e=>{e.stopPropagation();f()};return b};
    r.append(el('i','ic',o.isLight?'✦':o.isCamera?'▷':'▣'),el('span','nm',o.name),mk('✎',()=>rename(o),'Rename'),
      mk(o.visible?'◉':'◌',()=>{o.visible=!o.visible;o===S?select(o):rows();commit()},'Show / Hide'),mk('✕',()=>{S=o;del()},'Delete'));
    r.onclick=()=>select(o);r.ondblclick=()=>rename(o);L.append(r)});
  $('#info').textContent=root.children.length+' objects · '+fps+' fps'}
async function rename(o){const r=await ask('Rename object',['OK','Cancel'],o.name);if(!r.i&&r.v.trim()){o.name=r.v.trim();rows();syncProps();commit()}}

/* ---------- Properties ---------- */
const n3=p=>[0,1,2].map(i=>`<input type="number" step="0.1" data-k="${p}${i}">`).join('');
const sl=(c,l,k,a,b,s)=>`<label class="r ${c}">${l}<input type="range" min="${a}" max="${b}" step="${s}" data-k="${k}"></label>`;
$('#props').innerHTML=`<p id="empty">Select an object to edit it.</p><div id="pp" hidden><input class="nm" data-k="nm"><h4>Location</h4><div class="g3">${n3('p')}</div><h4>Rotation (°)</h4><div class="g3">${n3('r')}</div><h4>Scale</h4><div class="g3">${n3('s')}</div>
<h4 class="ml">Material</h4><label class="r ml">Color<input type="color" data-k="col"></label><label class="r m">Emissive<input type="color" data-k="emi"></label>
${sl('m','Metalness','met',0,1,.01)}${sl('m','Roughness','rou',0,1,.01)}${sl('m','Opacity','opa',0,1,.01)}${sl('l','Intensity','int',0,10,.05)}${sl('c','FOV','fov',15,120,1)}<button class="c" id="act">Set as active camera</button></div>
<h4>World</h4><label class="r">Background<input type="color" data-k="bg" value="#25272b"></label>`;
const pr=$('#props');
pr.addEventListener('input',e=>{const k=e.target.dataset.k,v=e.target.value;if(!k)return;if(k=='bg'){scene.background.set(v);dirtyMark();return}
  const o=S;if(!o||v==='')return;const f=+v,q=/^([prs])([012])$/.exec(k);
  if(q){const i=+q[2];if(q[1]=='p')o.position.setComponent(i,f);else if(q[1]=='r')o.rotation['xyz'[i]]=f*Math.PI/180;else o.scale.setComponent(i,f)}
  else if(k=='nm'){o.name=v;rows()}else if(k=='col')(o.material||o).color.set(v);else if(k=='emi'&&o.material.emissive)o.material.emissive.set(v);
  else if(k=='met')o.material.metalness=f;else if(k=='rou')o.material.roughness=f;else if(k=='opa'){o.material.opacity=f;o.material.transparent=f<1}
  else if(k=='int')o.intensity=f;else if(k=='fov'){o.fov=f;o.updateProjectionMatrix()}dirtyMark()});
pr.addEventListener('change',()=>commit());
$('#act').onclick=()=>{if(!S||!S.isCamera)return;root.children.forEach(o=>{if(o.isCamera)o.userData.active=false});S.userData.active=true;commit();toast('Active camera set.')};
function syncProps(){const pp=$('#pp'),o=S;$('#empty').hidden=!!o;pp.hidden=!o;if(!o)return;pp.dataset.t=o.isMesh?'mesh':o.isLight?'light':o.isCamera?'cam':'grp';
  const set=(k,v)=>{const i=pp.querySelector(`[data-k="${k}"]`);if(i&&document.activeElement!==i)i.value=v},m=o.material,r=[o.rotation.x,o.rotation.y,o.rotation.z];
  [0,1,2].forEach(i=>{set('p'+i,+o.position.getComponent(i).toFixed(3));set('r'+i,+(r[i]*180/Math.PI).toFixed(2));set('s'+i,+o.scale.getComponent(i).toFixed(3))});set('nm',o.name);
  if(m&&m.color){set('col','#'+m.color.getHexString());if(m.emissive)set('emi','#'+m.emissive.getHexString());set('met',m.metalness??0);set('rou',m.roughness??1);set('opa',m.opacity)}
  if(o.isLight){set('col','#'+o.color.getHexString());set('int',o.intensity)}if(o.isCamera)set('fov',o.fov)}

/* ---------- History / project state ---------- */
const snap=()=>JSON.stringify({s:root.toJSON(),a:anim,sel:S&&S.uuid});
const isDirty=()=>forceDirty||H[hi]!==saved;
function refresh(){const d=isDirty();document.title=P.name+(d?'*':'')+' — Mini Blender';$('#ptitle').textContent=P.name+(d?' ●':'');$('#st').textContent=d?'Unsaved Changes':P.state;$('#stat').classList.toggle('dirty',d)}
function commit(){forceDirty=false;const s=snap();if(H[hi]!==s){H=H.slice(0,hi+1);H.push(s);if(H.length>80)H.shift();hi=H.length-1}refresh()}
const dirtyMark=()=>{forceDirty=true;refresh()};
function restore(s){const o=JSON.parse(s),g=new T.ObjectLoader().parse(o.s);clearRoot();[...g.children].forEach(c=>root.add(c));anim=o.a;rebuild();select(o.sel&&find(o.sel));forceDirty=false;refresh()}
const undo=()=>{if(hi>0){hi--;restore(H[hi])}else toast('Nothing to undo.','warn')};
const redo=()=>{if(hi<H.length-1){hi++;restore(H[hi])}else toast('Nothing to redo.','warn')};

/* ---------- Project: new / save / open ---------- */
function reset(){clearRoot();anim={dur:5,keys:{}};tm=0;Object.assign(P,{name:'MyProject',handle:null,named:false,state:'New Project'});scene.background.set('#25272b');
  const fl=mesh('Plane','Floor');fl.scale.setScalar(8);fl.material.color.set('#2f3237');fl.material.roughness=.9;
  const cb=mesh('Cube'),c=camera();c.position.set(4,3,6);c.lookAt(0,.5,0);root.add(fl,cb,light('Ambient'),light('Directional'),light('Point'),c);
  H=[];hi=-1;rebuild();select(null);commit();saved=H[0];refresh();markers()}
async function guard(msg){if(!isDirty())return true;const r=await ask(msg,['Save',"Don't Save",'Cancel']);if(r.i==2)return false;if(r.i==0){await save();if(isDirty())return false}return true}
async function newProj(){if(await guard('You have unsaved changes. Save before creating a new project?')){reset();try{localStorage.removeItem('mb_recover')}catch{}toast('New project created.')}}
const pack=()=>JSON.stringify({app:'MiniBlender',v:1,name:P.name,scene:root.toJSON(),anim,bg:'#'+scene.background.getHexString(),cam:{p:cam.position.toArray(),t:orbit.target.toArray(),fov:cam.fov}});
const recents=()=>{try{return JSON.parse(localStorage.getItem('mb_recent'))||[]}catch{return[]}};
function addRecent(name,data){const l=recents().filter(r=>r.name!==name);l.unshift({name,time:Date.now(),data});l.length=Math.min(l.length,5);
  try{localStorage.setItem('mb_recent',JSON.stringify(l))}catch{try{localStorage.setItem('mb_recent',JSON.stringify(l.map(r=>({name:r.name,time:r.time}))))}catch{}}}
async function save(as){if(!root.children.length){toast('Nothing to save.','warn');return}
  try{if(window.showSaveFilePicker&&(as||!P.handle)){P.handle=await showSaveFilePicker({suggestedName:P.name+'.json',types:[{description:'Mini Blender project',accept:{'application/json':['.json']}}]});P.name=clean(P.handle.name.replace(/\.json$/i,''))}
    else if(!window.showSaveFilePicker&&(as||!P.named)){const r=await ask('Save project as',['Save','Cancel'],P.name);if(r.i)return;P.name=clean(r.v)}
    $('#st').textContent='Saving...';const data=pack();
    if(P.handle){const w=await P.handle.createWritable();await w.write(data);await w.close()}else dl(new Blob([data],{type:'application/json'}),P.name+'.json');
    P.named=true;P.state='Saved';saved=H[hi];forceDirty=false;addRecent(P.name,data);try{localStorage.removeItem('mb_recover')}catch{}refresh();toast('Project saved successfully.')
  }catch(e){refresh();if(e&&e.name!=='AbortError')toast('Failed to save project.','err')}}
function loadProject(j,name){const g=new T.ObjectLoader().parse(j.scene);clearRoot();[...g.children].forEach(c=>root.add(c));anim=j.anim||{dur:5,keys:{}};tm=0;
  if(j.bg)scene.background.set(j.bg);if(j.cam){cam.position.fromArray(j.cam.p);orbit.target.fromArray(j.cam.t);cam.fov=j.cam.fov||50;cam.updateProjectionMatrix()}
  Object.assign(P,{name:clean(name||j.name||'Project'),handle:null,named:true,state:'Loaded'});H=[];hi=-1;rebuild();select(null);commit();saved=H[0];refresh();markers()}
function parseProject(txt){let j;try{j=JSON.parse(txt)}catch{throw'The file is not valid JSON.'}if(!j||j.app!=='MiniBlender'||!j.scene||!j.scene.object)throw'Unsupported file format.';return j}
async function openFile(f,txt,quiet){$('#st').textContent='Loading...';try{const raw=txt??await f.text(),j=parseProject(raw);loadProject(j,f?f.name.replace(/\.json$/i,''):j.name);addRecent(P.name,raw);toast('Project loaded successfully.')}
  catch(e){refresh();toast(typeof e=='string'?e:'Failed to load project.','err')}}
const file=$('#file');
function pickFile(acc,fn){file.accept=acc;file.onchange=()=>{const f=file.files[0];file.value='';f&&fn(f)};file.click()}
async function openDlg(){if(await guard('You have unsaved changes. Save before opening another project?'))pickFile('.json,application/json',f=>openFile(f))}

/* ---------- Import / Export ---------- */
async function importFile(f){const ext=f.name.split('.').pop().toLowerCase(),nm=f.name.replace(/\.[^.]+$/,'');$('#st').textContent='Loading...';
  try{let items;
    if(ext=='glb'||ext=='gltf')items=[(await new GLTFLoader().parseAsync(ext=='glb'?await f.arrayBuffer():await f.text(),'')).scene];
    else if(ext=='obj')items=[new OBJLoader().parse(await f.text())];
    else if(ext=='json'){let j;try{j=JSON.parse(await f.text())}catch{throw'The file is not valid JSON.'}const sj=j&&j.scene&&j.scene.object?j.scene:j&&j.object?j:null;if(!sj)throw'Unsupported file format.';
      const o=new T.ObjectLoader().parse(sj);items=o.type=='Group'||o.type=='Scene'?[...o.children]:[o]}
    else throw'Unsupported file format.';
    items.forEach((o,i)=>{if(ext!='json'){o.name=uniq(nm);const sz=new T.Box3().setFromObject(o).getSize(new T.Vector3()).length();if(sz>12||(sz>0&&sz<.2))o.scale.setScalar(4/sz);o.traverse(c=>{if(c.isMesh)c.castShadow=c.receiveShadow=true})}else o.name=uniq(o.name||'Object');root.add(o);ring(o.position)});
    rebuild();select(items[items.length-1]);commit();toast('Import completed.')}
  catch(e){refresh();toast(typeof e=='string'?e:'Failed to import file.','err')}}
function expGroup(){const g=new T.Group();root.children.filter(o=>o.visible&&(o.isMesh||o.isGroup)).forEach(o=>g.add(o.clone()));g.updateMatrixWorld(true);return g}
async function exportAs(t){const g=expGroup();if(!g.children.length){toast('Nothing to export.','warn');return}
  try{const n=P.name;if(t=='obj')dl(new Blob([new OBJExporter().parse(g)],{type:'text/plain'}),n+'.obj');else if(t=='json')dl(new Blob([pack()],{type:'application/json'}),n+'.json');
    else{const r=await new Promise((ok,no)=>new GLTFExporter().parse(g,ok,no,{binary:t=='glb'}));dl(t=='glb'?new Blob([r],{type:'model/gltf-binary'}):new Blob([JSON.stringify(r)],{type:'model/gltf+json'}),n+'.'+t)}
    toast('Export completed.')}catch(e){toast('Export failed.','err')}}
function shot(){const v=[aux.visible,tc.visible];aux.visible=tc.visible=false;R.setScissorTest(false);R.setViewport(0,0,vp.clientWidth,vp.clientHeight);R.render(scene,cam);
  R.domElement.toBlob(b=>{dl(b,P.name+'.png');toast('Export completed.')});aux.visible=v[0];tc.visible=v[1]}

/* ---------- Animation ---------- */
function sample(){for(const id in anim.keys){const o=find(id),k=anim.keys[id];if(!o||!k.length)continue;let a=k[0],b=a;
  if(tm>=k[k.length-1].t)a=b=k[k.length-1];else for(let i=0;i<k.length-1;i++)if(tm>=k[i].t&&tm<k[i+1].t){a=k[i];b=k[i+1];break}
  const f=a===b?0:(tm-a.t)/(b.t-a.t),L=(x,y)=>x.map((v,i)=>v+(y[i]-v)*f);o.position.fromArray(L(a.p,b.p));o.rotation.set(...L(a.r,b.r));o.scale.fromArray(L(a.s,b.s))}}
function ui(){$('#tr').value=tm;$('#tt').textContent=tm.toFixed(2)+'s';if(S)syncProps()}
function markers(){const tr=$('#tr'),k=$('#kfs');tr.max=anim.dur;$('#dur').value=anim.dur;k.replaceChildren();
  ((S&&anim.keys[S.uuid])||[]).forEach(x=>{const i=el('i');i.style.left=(x.t/anim.dur*100)+'%';k.append(i)})}
function addKey(){if(!S){toast('Select an object first.','warn');return}const k=anim.keys[S.uuid]||(anim.keys[S.uuid]=[]),t=+tm.toFixed(2),n={t,p:S.position.toArray(),r:[S.rotation.x,S.rotation.y,S.rotation.z],s:S.scale.toArray()},i=k.findIndex(x=>Math.abs(x.t-t)<.01);
  i<0?k.push(n):k[i]=n;k.sort((a,b)=>a.t-b.t);markers();commit();toast('Keyframe added.')}
$('#tr').oninput=e=>{tm=+e.target.value;sample();ui()};
$('#dur').onchange=e=>{anim.dur=Math.min(60,Math.max(1,+e.target.value||5));tm=Math.min(tm,anim.dur);markers();ui()};
$('#tl').onclick=e=>{const a=e.target.dataset.t;if(a=='key')addKey();else if(a=='play'){if(tm>=anim.dur)tm=0;playing=true}else if(a=='pause')playing=false;else if(a=='stop'){playing=false;tm=0;sample();ui()}};

/* ---------- Menus & toolbar ---------- */
const M={
  File:()=>[['New',newProj,'Ctrl+N'],['Open…',openDlg,'Ctrl+O'],['Save',()=>save(),'Ctrl+S'],['Save As…',()=>save(true),'Ctrl+Shift+S']],
  Add:()=>[...Object.keys(G).map(k=>[k,()=>addMesh(k)]),0,['Point Light',()=>add(light('Point'))],['Directional Light',()=>add(light('Directional'))],['Ambient Light',()=>add(light('Ambient'))],0,['Camera',()=>add(camera())]],
  Edit:()=>[['Undo',undo,'Ctrl+Z'],['Redo',redo,'Ctrl+Y'],0,['Focus',focus,'F'],['Clone',cloneSelected,'Shift+D'],['Delete',del,'Del'],0,['Clear Scene',clearScene]],
  Camera:()=>[['Enter Camera Mode',enterCameraMode,'Numpad 0'],['Play Animation',()=>{playing=true;tm=0}]],
  Image:()=>[['Apply PNG to Selected',()=>pickFile('image/png',imageOnSelected)],['Remove PNG from Selected',removeImageFromSelected]],
  Import:()=>[['GLTF',()=>pickFile('.gltf',importFile)],['GLB',()=>pickFile('.glb',importFile)],['OBJ',()=>pickFile('.obj',importFile)],['JSON Scene',()=>pickFile('.json,application/json',importFile)]],
  Export:()=>[['GLTF',()=>exportAs('gltf')],['GLB',()=>exportAs('glb')],['OBJ',()=>exportAs('obj')],['JSON',()=>exportAs('json')],['Screenshot PNG',shot]],
  Recent:()=>{const l=recents();return l.length?l.map(r=>[r.name+'  ·  '+new Date(r.time).toLocaleString([],{dateStyle:'short',timeStyle:'short'}),async()=>{if(!await guard('You have unsaved changes. Save before opening another project?'))return;
    if(r.data)openFile(null,r.data);else toast('Project data is no longer available.','warn')}]):[['No recent projects',()=>{}]]}};
const closeM=()=>document.querySelectorAll('.mn.on').forEach(m=>m.classList.remove('on'));
Object.keys(M).forEach(n=>{const w=el('div','mn'),b=el('button','',n),d=el('div','dd');
  b.onclick=()=>{const was=w.classList.contains('on');closeM();if(was)return;d.replaceChildren();M[n]().forEach(i=>{if(!i){d.append(el('hr'));return}const x=el('button','',i[0]);if(i[2])x.append(el('kbd','',i[2]));x.onclick=()=>{closeM();i[1]()};d.append(x)});
    d.style.left=Math.max(4,Math.min(b.getBoundingClientRect().left,innerWidth-230))+'px';w.classList.add('on')};
  w.append(b,d);$('#menus').append(w)});
addEventListener('pointerdown',e=>{if(!e.target.closest('.mn'))closeM()});
[['translate','✥','Move (G)'],['rotate','↻','Rotate (R)'],['scale','⤢','Scale (S)']].forEach(([m,t,ti])=>{const b=el('button','',t);b.dataset.m=m;b.title=ti;b.setAttribute('aria-label',ti);b.onclick=()=>setMode(m);$('#tools').append(b)});
$('#tools').append(el('hr'));
[['◎','Focus (F)',focus],['↶','Undo (Ctrl+Z)',undo],['↷','Redo (Ctrl+Y)',redo],['🗑','Delete',del]].forEach(([t,ti,f])=>{const b=el('button','',t);b.title=ti;b.setAttribute('aria-label',ti);b.onclick=f;$('#tools').append(b)});
$('#ptog').onclick=()=>document.body.classList.toggle('sheet');

$('#helpBtn').onclick=showHelp;$('#camPreviewBtn').onclick=enterCameraMode;$('#cameraExit').onclick=exitCameraMode;document.addEventListener('fullscreenchange',()=>{if(cameraMode&&!document.fullscreenElement)exitCameraMode()});
/* ---------- Keyboard ---------- */
addEventListener('keydown',e=>{const m=$('#modal');
  if(m.classList.contains('on')){if(e.key=='Escape'){e.preventDefault();$('#mb').lastChild.click()}else if(e.key=='Enter'&&e.target.id=='mi'){e.preventDefault();$('#mb').firstChild.click()}return}
  const k=e.key.toLowerCase(),c=e.ctrlKey||e.metaKey,inF=/INPUT|TEXTAREA/.test(e.target.tagName)&&e.target.type!='range';
  if(c){if(k=='s'){e.preventDefault();save(e.shiftKey)}else if(k=='o'){e.preventDefault();openDlg()}else if(k=='n'){e.preventDefault();newProj()}
    else if(!inF&&k=='z'){e.preventDefault();e.shiftKey?redo():undo()}else if(!inF&&k=='y'){e.preventDefault();redo()}return}
  if(inF)return;if(k=='g')setMode('translate');else if(k=='r')setMode('rotate');else if(k=='s')setMode('scale');else if(k=='f')focus();else if(k=='delete'||k=='backspace')del();else if(e.shiftKey&&k=='d')cloneSelected();else if(k=='f1'||k=='?')showHelp();else if(k=='escape'&&cameraMode)exitCameraMode()});

/* ---------- Autosave & errors ---------- */
const stash=()=>{if(isDirty()&&root.children.length){try{localStorage.setItem('mb_recover',pack())}catch{}}};
setInterval(stash,60000);
addEventListener('beforeunload',e=>{if(isDirty()){stash();e.preventDefault();e.returnValue=''}});
addEventListener('error',()=>toast('Something went wrong.','err'));
addEventListener('unhandledrejection',()=>toast('Something went wrong.','err'));

/* ---------- Render loop ---------- */
function draw(){const w=vp.clientWidth,h=vp.clientHeight;
  if(cameraMode){const ac=activeCamera();if(!ac)return;ac.aspect=w/Math.max(h,1);ac.updateProjectionMatrix();const a=aux.visible,t=tc.visible;aux.visible=false;tc.visible=false;R.setScissorTest(false);R.setViewport(0,0,w,h);R.render(scene,ac);aux.visible=a;tc.visible=t;syncCameraMode();return}
  R.setScissorTest(false);R.setViewport(0,0,w,h);R.render(scene,cam);
  const ac=activeCamera(),pv=$('#pv');pv.style.display=ac?'block':'none';
  if(ac){const pw=innerWidth<820?132:200,ph=Math.round(pw*9/16),tv=tc.visible;ac.aspect=pw/ph;ac.updateProjectionMatrix();aux.visible=tc.visible=false;R.setScissorTest(true);R.setViewport(12,12,pw,ph);R.setScissor(12,12,pw,ph);R.render(scene,ac);R.setScissorTest(false);aux.visible=true;tc.visible=tv}}
function loop(now){requestAnimationFrame(loop);const dt=Math.min((now-last)/1e3,.1);last=now;
  fx=fx.filter(a=>{const p=Math.min((now-a.t)/a.d,1);a.f(p);if(p>=1){a.end&&a.end();return false}return true});
  if(playing){tm+=dt;if(tm>anim.dur)tm=0;sample();ui()}
  orbit.update();if(S&&sel.visible){sel.setFromObject(S);sel.material.opacity=.7+.3*Math.sin(now/260)}
  helpers.forEach(h=>{h.update&&h.update();h.visible=(h.light||h.camera).visible});
  fc++;if(now-ft>500){fps=Math.round(fc*1000/(now-ft));fc=0;ft=now;$('#info').textContent=root.children.length+' objects · '+fps+' fps'}
  draw()}

setMode('translate');reset();requestAnimationFrame(loop);
try{const rec=localStorage.getItem('mb_recover');if(rec)ask('A recovery version of your project was found.',['Recover','Discard']).then(r=>{
  if(!r.i){try{loadProject(parseProject(rec));saved=null;refresh();toast('Project recovered.')}catch(e){toast('Failed to load project.','err')}}try{localStorage.removeItem('mb_recover')}catch{}})}catch{}
