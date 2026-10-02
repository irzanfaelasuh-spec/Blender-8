
import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)], view = $('#vp');

// Renderer Setup - Single Renderer for everything to prevent black screen!
let R = new T.WebGLRenderer({antialias:true, preserveDrawingBuffer:true, powerPreference: "high-performance"});
R.setPixelRatio(Math.min(devicePixelRatio, 2));
R.shadowMap.enabled = true;
R.shadowMap.type = T.PCFSoftShadowMap;
R.toneMapping = T.ACESFilmicToneMapping;
R.toneMappingExposure = 1.1;
R.outputColorSpace = T.SRGBColorSpace;
view.prepend(R.domElement);

const scene = new T.Scene(), root = new T.Group(), aux = new T.Group();
scene.add(root, aux);
scene.background = new T.Color('#1c1e23');

let cam = new T.PerspectiveCamera(50, 1, 0.05, 1000);
cam.position.set(6, 5, 8);

let orbit = new OrbitControls(cam, R.domElement);
orbit.enableDamping = true;
orbit.dampingFactor = 0.05;
orbit.target.set(0, 0.5, 0);

let tc = new TransformControls(cam, R.domElement);
tc.setSize(1.2);
scene.add(tc);

// Helpers (Grid, Axes)
let grid = new T.GridHelper(50, 50, 0x555555, 0x222222);
let ax = new T.AxesHelper(5);
aux.add(grid, ax);

let box = new T.BoxHelper(new T.Object3D(), 0x0de8a9);
box.visible = false;
box.material.depthTest = false;
aux.add(box);

let S = null, snap = false, wire = false, play = false, time = 0;
let anim = { duration: 5, keys: {} }, hist = [], hi = -1, dirty = false, camMode = false, fx = [];

// Geometries & Materials
const geo = {
    Cube: () => new T.BoxGeometry(1, 1, 1),
    Sphere: () => new T.SphereGeometry(0.65, 40, 28),
    Cylinder: () => new T.CylinderGeometry(0.55, 0.55, 1.2, 40),
    Cone: () => new T.ConeGeometry(0.65, 1.25, 40),
    Plane: () => new T.PlaneGeometry(2, 2),
    Torus: () => new T.TorusGeometry(0.62, 0.2, 24, 56)
};
const mat = () => new T.MeshStandardMaterial({color: '#b9bdc7', metalness: 0.1, roughness: 0.6});

function uniq(n){ let x=n, i=1; while(root.children.some(o=>o.name===x)) x = n + '.' + String(i++).padStart(3,'0'); return x; }
function toast(x, c=''){ let d=document.createElement('div'); d.className='toast '+c; d.textContent=x; $('#toasts').append(d); setTimeout(()=>d.remove(), 2500); }
function commit(){ dirty = false; } // Simplified for logic flow

// --- OBJECT MANAGEMENT ---
function mesh(n){ let o = new T.Mesh(geo[n](), mat()); o.name = uniq(n); o.castShadow = o.receiveShadow = true; if(n==='Plane') o.rotation.x = -Math.PI/2; else o.position.y = 0.65; return o; }
function light(n='Point'){ 
    let o = n==='Ambient' ? new T.AmbientLight('#fff', 0.6) : n==='Directional' ? new T.DirectionalLight('#fff', 2.5) : new T.PointLight('#ffd3a0', 40, 0, 2);
    o.name = uniq(n+' Light');
    if(n==='Directional'){ o.position.set(5, 8, 4); o.castShadow = true; o.shadow.mapSize.set(2048, 2048); o.shadow.bias = -0.0005; }
    else if(n==='Point') o.position.set(-3, 3, 3);
    return o;
}
function camera(){ let o = new T.PerspectiveCamera(45, 16/9, 0.05, 1000); o.name = uniq('Camera'); o.position.copy(cam.position); o.quaternion.copy(cam.quaternion); o.userData.active = true; root.children.forEach(c => {if(c.isCamera) c.userData.active = false}); return o; }

function select(o){
    S = o || null;
    if(S && S.visible && !camMode) tc.attach(S); else tc.detach();
    box.visible = !!S;
    renderOut(); props();
}

function add(o){
    root.add(o); helpers(); select(o); burst(o.position); toast(o.name+' ditambahkan!');
}

function clone(){
    if(!S) return toast('Pilih objek dulu untuk Clone!', 'warn');
    let c = S.clone(true);
    c.name = uniq(S.name + ' Clone');
    c.position.add(new T.Vector3(0.8, 0, 0.8)); // Offset
    
    // Deep clone material so it doesn't share edits
    c.traverse(x => {
        if(x.isMesh){
            x.geometry = x.geometry.clone();
            x.material = Array.isArray(x.material) ? x.material.map(m=>m.clone()) : x.material.clone();
        }
    });
    
    // Clone Animations
    if(anim.keys[S.uuid]) anim.keys[c.uuid] = JSON.parse(JSON.stringify(anim.keys[S.uuid]));
    
    root.add(c); helpers(); select(c); burst(c.position); toast('Berhasil Clone Objek!');
}

function del(){
    if(!S) return toast('Pilih objek yang mau dihapus', 'warn');
    root.remove(S);
    delete anim.keys[S.uuid];
    S = null; helpers(); props(); toast('Objek Dihapus!');
}

// --- VFX: NON-RAINBOW SPARKS ---
function burst(p){
    let g = new T.Group();
    for(let i=0; i<25; i++){
        // Golden / Cyan professional sparks
        let color = Math.random() > 0.4 ? 0xffbb00 : 0x0de8a9;
        let m = new T.Mesh(new T.BoxGeometry(0.04, 0.04, 0.15), new T.MeshBasicMaterial({color: color, transparent: true}));
        m.userData.v = new T.Vector3((Math.random()-.5)*4, Math.random()*3, (Math.random()-.5)*4);
        m.lookAt(m.userData.v);
        g.add(m);
    }
    g.position.copy(p);
    aux.add(g);
    fx.push({g, t: performance.now()});
}
function fxloop(n){
    fx = fx.filter(f => {
        let p = Math.min((n - f.t) / 600, 1); // 600ms lifetime
        let ease = 1 - Math.pow(1 - p, 3);
        f.g.children.forEach(m => {
            m.position.copy(m.userData.v).multiplyScalar(ease);
            m.material.opacity = 1 - p;
        });
        if(p >= 1){ aux.remove(f.g); return false; }
        return true;
    });
}

// --- UI BINDINGS ---
$$('[data-m]').forEach(b => b.onclick = () => { tc.setMode(b.dataset.m); $$('[data-m]').forEach(x => x.classList.remove('on')); b.classList.add('on'); });
$('#t-clone').onclick = clone;
$('#t-del').onclick = del;
tc.addEventListener('dragging-changed', e => orbit.enabled = !e.value);
tc.addEventListener('objectChange', () => props());

// Keyboard Shortcuts
window.addEventListener('keydown', e => {
    if(/INPUT|TEXTAREA/.test(e.target.tagName)) return;
    let k = e.key.toLowerCase(), c = e.ctrlKey || e.metaKey;
    if(e.shiftKey && k === 'd'){ e.preventDefault(); clone(); }
    if(k === 'g') $('#tools button[data-m="translate"]').click();
    if(k === 'r') $('#tools button[data-m="rotate"]').click();
    if(k === 's') $('#tools button[data-m="scale"]').click();
    if(k === 'delete' || k === 'backspace') del();
    if(k === 'f' && S){
        let b = new T.Box3().setFromObject(S), c = b.getCenter(new T.Vector3());
        let r = Math.max(b.getSize(new T.Vector3()).length(), 1);
        orbit.target.copy(c);
        cam.position.copy(c.clone().add(new T.Vector3(r*1.5, r, r*1.5)));
    }
});

// --- CAMERA MODE FULLSCREEN ---
function activeCam(){ return root.children.find(o => o.isCamera && o.visible && o.userData.active) || root.children.find(o => o.isCamera && o.visible); }

function enterCamera(){
    let c = activeCam();
    if(!c) return toast('Buat objek Camera terlebih dahulu!', 'warn');
    camMode = true;
    // HIDE ALL HELPERS AND GRIDS (Blocks hidden, light remains)
    aux.visible = false;
    tc.detach();
    orbit.enabled = false;
    
    document.body.classList.add('cam-mode');
    $('#cam-ui').classList.remove('hidden');
    document.documentElement.requestFullscreen?.().catch(()=>{});
    resize();
    toast('Memasuki Mode Kamera', 'ok');
}
function exitCamera(){
    camMode = false;
    aux.visible = true; // Show helpers again
    orbit.enabled = true;
    if(S) tc.attach(S);
    
    document.body.classList.remove('cam-mode');
    $('#cam-ui').classList.add('hidden');
    if(document.fullscreenElement) document.exitFullscreen?.().catch(()=>{});
    resize();
}

$('#cam-close').onclick = exitCamera;
$('#cam-c-play').onclick = () => play = true;
$('#cam-c-pause').onclick = () => play = false;
$('#cam-c-stop').onclick = () => { play = false; setTime(0); };

document.addEventListener('fullscreenchange', () => { if(!document.fullscreenElement && camMode) exitCamera(); });

// --- ANIMATION / TIMELINE ---
function key(){
    if(!S) return toast('Pilih objek dulu untuk Keyframe', 'warn');
    let a = anim.keys[S.uuid] || (anim.keys[S.uuid] = []);
    let k = { t: +time.toFixed(2), p: S.position.toArray(), r: [S.rotation.x, S.rotation.y, S.rotation.z], s: S.scale.toArray() };
    let i = a.findIndex(x => Math.abs(x.t - k.t) < 0.01);
    if(i < 0) a.push(k); else a[i] = k;
    a.sort((x,y) => x.t - y.t);
    markers(); toast('Keyframe Ditambahkan!');
}
function setTime(v){
    time = Math.max(0, Math.min(anim.duration, +v));
    sample();
    $('#tr').value = time;
    $('#tt').textContent = time.toFixed(2) + 's';
}
function sample(){
    for(let id in anim.keys){
        let o = root.getObjectByProperty('uuid', id), a = anim.keys[id];
        if(!o || !a.length) continue;
        let A = a[0], B = a[a.length-1];
        for(let i=0; i<a.length-1; i++){
            if(time >= a[i].t && time <= a[i+1].t){ A = a[i]; B = a[i+1]; break; }
        }
        let f = A===B ? 0 : (time - A.t)/(B.t - A.t);
        let L = (x,y) => x.map((v,i) => v + (y[i]-v)*f);
        o.position.fromArray(L(A.p, B.p));
        o.rotation.set(...L(A.r, B.r));
        o.scale.fromArray(L(A.s, B.s));
    }
}
function markers(){
    let k = $('#kfs'); k.replaceChildren();
    (S ? anim.keys[S.uuid]||[] : []).forEach(x => {
        let i = document.createElement('i'); i.style.left = (x.t/anim.duration*100)+'%'; k.append(i);
    });
    $('#tr').max = anim.duration;
}
$('#tr').oninput = e => setTime(e.target.value);
$('#dur').onchange = e => { anim.duration = Math.max(1, Math.min(120, +e.target.value)); markers(); };
$('#btn-key').onclick = key;
$('#btn-play').onclick = () => play = true;
$('#btn-pause').onclick = () => play = false;
$('#btn-stop').onclick = () => { play = false; setTime(0); };

// --- HELPERS & PROPS ---
function helpers(){
    aux.children.filter(x => x!==grid && x!==ax && x!==box && !fx.some(f => f.g===x)).forEach(x => { aux.remove(x); x.dispose?.(); });
    root.children.forEach(o => {
        let h = o.isDirectionalLight ? new T.DirectionalLightHelper(o, 1) : o.isPointLight ? new T.PointLightHelper(o, 0.4) : o.isCamera ? new T.CameraHelper(o) : null;
        if(h){
            // Fix: If PointLightHelper, change material color so it looks nice
            if(o.isPointLight && h.material) h.material.color.setHex(0xffaa00);
            aux.add(h);
        }
    });
    renderOut();
}

function renderOut(){
    let x = $('#outl'); x.replaceChildren();
    root.children.forEach(o => {
        let r = document.createElement('div'); r.className = 'row' + (o===S ? ' on' : '');
        r.innerHTML = `<span>${o.isCamera ? '🎥' : o.isLight ? '💡' : '📦'}</span><span class="nm">${o.name}</span>`;
        let v = document.createElement('button'); v.textContent = o.visible ? '👁️' : '🚫';
        v.onclick = e => { e.stopPropagation(); o.visible = !o.visible; renderOut(); };
        r.append(v); r.onclick = () => select(o); x.append(r);
    });
}

function props(){
    let p = $('#props'); p.replaceChildren();
    if(!S){ p.innerHTML = '<div style="color:#888;text-align:center;padding:20px;">Pilih objek untuk diedit.</div>'; return; }
    
    let html = `<div class="section">TRANSFORM</div>
    <div class="g3">
        <label>X <input data-k="px" type="number" step="0.1" value="${S.position.x.toFixed(2)}"></label>
        <label>Y <input data-k="py" type="number" step="0.1" value="${S.position.y.toFixed(2)}"></label>
        <label>Z <input data-k="pz" type="number" step="0.1" value="${S.position.z.toFixed(2)}"></label>
    </div>
    <div class="g3">
        <label>Rot X <input data-k="rx" type="number" value="${T.MathUtils.radToDeg(S.rotation.x).toFixed(0)}"></label>
        <label>Rot Y <input data-k="ry" type="number" value="${T.MathUtils.radToDeg(S.rotation.y).toFixed(0)}"></label>
        <label>Rot Z <input data-k="rz" type="number" value="${T.MathUtils.radToDeg(S.rotation.z).toFixed(0)}"></label>
    </div>
    <div class="g3">
        <label>Scl X <input data-k="sx" type="number" step="0.1" value="${S.scale.x.toFixed(2)}"></label>
        <label>Scl Y <input data-k="sy" type="number" step="0.1" value="${S.scale.y.toFixed(2)}"></label>
        <label>Scl Z <input data-k="sz" type="number" step="0.1" value="${S.scale.z.toFixed(2)}"></label>
    </div>`;

    if(S.isMesh){
        html += `<div class="section">MATERIAL & TEKSTUR</div>
        <div class="line">Warna <input data-k="color" type="color" value="#${S.material.color.getHexString()}"></div>
        <div class="line">Metalness <input data-k="metal" type="range" min="0" max="1" step=".05" value="${S.material.metalness}"></div>
        <div class="line">Roughness <input data-k="rough" type="range" min="0" max="1" step=".05" value="${S.material.roughness}"></div>
        <div class="propBtns">
            <button id="p-tex-up" class="pri">📁 Upload PNG</button>
            <button id="p-tex-rm">🗑️ Hapus Gambar</button>
        </div>`;
    }
    
    if(S.isLight) html += `<div class="section">CAHAYA</div><div class="line">Intensitas <input data-k="int" type="range" min="0" max="100" step="1" value="${S.intensity}"></div>`;
    
    if(S.isCamera) html += `<div class="section">KAMERA</div><div class="line">FOV <input data-k="fov" type="range" min="20" max="120" value="${S.fov}"></div>
        <div class="propBtns">
            <button id="p-cam-act" class="pri">Jadikan Aktif</button>
            <button id="p-cam-view">Masuk Kamera</button>
        </div>`;
        
    p.innerHTML = html;
    
    p.querySelectorAll('input').forEach(i => i.oninput = () => {
        let k = i.dataset.k, v = +i.value;
        if(k[0]==='p') S.position.setComponent({px:0,py:1,pz:2}[k], v);
        else if(k[0]==='r') S.rotation.setComponent({rx:0,ry:1,rz:2}[k], T.MathUtils.degToRad(v));
        else if(k[0]==='s') S.scale.setComponent({sx:0,sy:1,sz:2}[k], v);
        else if(k==='color') S.material.color.set(i.value);
        else if(k==='metal') S.material.metalness = v;
        else if(k==='rough') S.material.roughness = v;
        else if(k==='int') S.intensity = v;
        else if(k==='fov'){ S.fov = v; S.updateProjectionMatrix(); }
        helpers();
    });

    // Texture Upload / Remove
    $('#p-tex-up')?.addEventListener('click', () => $('#tex-in').click());
    $('#p-tex-rm')?.addEventListener('click', () => {
        if(S.material.map){ S.material.map.dispose(); S.material.map = null; S.material.needsUpdate = true; toast('Tekstur Dihapus!'); }
    });
    
    $('#p-cam-act')?.addEventListener('click', () => {
        root.children.forEach(o => { if(o.isCamera) o.userData.active = false; });
        S.userData.active = true; toast('Kamera ini di set Aktif!');
    });
    $('#p-cam-view')?.addEventListener('click', enterCamera);
}

$('#tex-in').onchange = e => {
    let f = e.target.files[0]; e.target.value = '';
    if(!f || !S?.isMesh) return;
    new T.TextureLoader().load(URL.createObjectURL(f), t => {
        t.colorSpace = T.SRGBColorSpace;
        if(S.material.map) S.material.map.dispose();
        S.material.map = t;
        S.material.needsUpdate = true;
        toast('Tekstur PNG Berhasil Dipasang!');
    });
};

// --- MENUS & INITIALIZATION ---
function initMenus(){
    let D = {
        File: [['Baru', newScene], null, ['Export GLB', () => exp(true)], ['Export OBJ', () => exp(false)]],
        Add: [['Cube', ()=>add(mesh('Cube'))], ['Sphere', ()=>add(mesh('Sphere'))], ['Plane', ()=>add(mesh('Plane'))], null, ['Point Cahaya', ()=>add(light())], ['Cahaya Matahari', ()=>add(light('Directional'))], ['Kamera', ()=>add(camera())]],
        View: [['Mode Kamera (Fullscreen)', enterCamera], ['Reset Layout', resize]]
    };
    for(let n in D){
        let w = document.createElement('div'); w.className = 'mn';
        let b = document.createElement('button'); b.textContent = n;
        let d = document.createElement('div'); d.className = 'dd';
        D[n].forEach(i => {
            if(!i) return d.append(document.createElement('hr'));
            let q = document.createElement('button'); q.textContent = i[0];
            q.onclick = () => { w.classList.remove('on'); i[1](); };
            d.append(q);
        });
        b.onclick = () => { $$('.mn').forEach(x => { if(x!==w) x.classList.remove('on')}); w.classList.toggle('on'); };
        w.append(b, d); $('#menus').append(w);
    }
}
function exp(glb){
    let g = new T.Group(); root.children.filter(o => o.visible && (glb || o.isMesh)).forEach(o => g.add(o.clone()));
    if(glb) new GLTFExporter().parse(g, r => download(r, 'MiniBlender.glb', 'model/gltf-binary'), err=>toast('Error','err'), {binary:true});
    else download(new OBJExporter().parse(g), 'MiniBlender.obj', 'text/plain');
}
function download(data, name, type){
    let a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], {type})); a.download = name; a.click();
}

function newScene(){
    root.clear(); time = 0; anim = {duration:5, keys:{}};
    let f = mesh('Plane'); f.name = 'Lantai'; f.scale.setScalar(12); f.material.color.set('#202228'); f.material.roughness = 1;
    let c = mesh('Cube'); c.name = 'Kubus Awal';
    let k = camera(); k.position.set(5, 4, 6); k.lookAt(0,0,0);
    root.add(f, c, light('Ambient'), light('Directional'), k);
    helpers(); select(c); markers();
}

// Fitur Help
$('#btn-help').onclick = () => {
    let F = ['Mode Kamera Fullscreen Immersive', 'Sembunyikan helper & grid otomatis di Kamera (Cahaya Tetap Nyala)', 'Kamera Mengikuti Animasi Langsung', 'VFX Partikel Emas & Cyan (Bukan Rainbow)', 'Tombol & Shortcut Clone (Shift + D)', 'Upload Texture PNG ke Objek', 'Tombol Hapus Texture/Gambar', 'Tombol Tutup (X) di Kamera overlay', 'Kontrol Play/Pause di Kamera overlay', 'Desain UI Kaca/Blur Kekinian (100x Lebih Bagus)', 'Performa Rendering Kamera Anti-Hitam', 'Duplikasi Animasi saat Clone Objek', 'Material Color Picker Langsung', 'Rotasi, Skala, Pindah dengan Shortcut (G, R, S)', 'Fokus Objek (Shortcut F)', 'Export ke GLB/OBJ', 'Smooth Camera Damping', 'Indikator FPS Realtime', 'Auto-Seleksi setelah Cloning', 'Sistem Peringatan (Toast Notifications)'];
    $('#mb').innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:15px;">' + F.map((x,i) => `<div style="background:#303236;padding:10px;border-radius:8px;border:1px solid #444;"><b style="color:#0de8a9;">${i+1}.</b> ${x}</div>`).join('') + '</div>';
    $('#modal').hidden = false;
};
$('#mx').onclick = () => $('#modal').hidden = true;

// Raycaster (Click to Select)
R.domElement.addEventListener('pointerdown', e => R.domElement._d = [e.clientX, e.clientY]);
R.domElement.addEventListener('pointerup', e => {
    let d = R.domElement._d;
    if(!d || tc.dragging || camMode) return; // Disable click select in camMode
    if(Math.hypot(e.clientX-d[0], e.clientY-d[1]) > 5) return;
    let q = R.domElement.getBoundingClientRect();
    let m = new T.Vector2((e.clientX - q.left)/q.width*2 - 1, -((e.clientY - q.top)/q.height)*2 + 1);
    let rc = new T.Raycaster(); rc.setFromCamera(m, cam);
    let h = rc.intersectObjects(root.children.filter(o => o.visible && !o.isLight && !o.isCamera), true)[0];
    let o = h?.object; while(o && o.parent !== root) o = o.parent;
    select(o || null);
});

// Resize
new ResizeObserver(resize).observe(view);
function resize(){
    let w = view.clientWidth, h = view.clientHeight;
    R.setSize(w, h, false);
    if(camMode){
        let c = activeCam();
        if(c){ c.aspect = w/h; c.updateProjectionMatrix(); }
    } else {
        cam.aspect = w/h; cam.updateProjectionMatrix();
    }
}

// Main Loop
let last = performance.now(), fc = 0, ft = last;
function loop(n){
    requestAnimationFrame(loop);
    let dt = Math.min((n - last)/1000, 0.1); last = n;
    
    if(play){ time += dt; if(time > anim.duration) time = 0; setTime(time); }
    orbit.update();
    
    if(S && box.visible && !camMode) box.setFromObject(S);
    fxloop(n);
    
    // Fix: Jika mode kamera aktif, gunakan kamera tersebut untuk render utama! Menghindari layar hitam.
    if(camMode){
        let c = activeCam();
        if(c){
            c.aspect = window.innerWidth / window.innerHeight; // pastikan pas fullscreen
            c.updateProjectionMatrix();
            R.render(scene, c);
        }
    } else {
        R.render(scene, cam);
    }
    
    fc++; if(n - ft > 1000){ $('#info').textContent = Math.round(fc*1000/(n-ft)) + ' FPS'; fc=0; ft=n; }
}

initMenus(); newScene(); requestAnimationFrame(loop);
