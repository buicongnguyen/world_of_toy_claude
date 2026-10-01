import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TREASURES, RESTORATIONS } from './game.js';

const TAU=Math.PI*2;
const palette={wall:'#c6c8ac',wood:'#aa7750',edge:'#957048',cream:'#f2e5c9',dark:'#64513d',sage:'#879374',rose:'#bf8d81'};
function rng(seed){return()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}
function canvasTexture(w,h,draw){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
function clothTexture(color){return canvasTexture(128,128,(c,w,h)=>{c.fillStyle=color;c.fillRect(0,0,w,h);const r=rng(42);for(let y=0;y<h;y+=3)for(let x=0;x<w;x+=3){c.fillStyle=`rgba(${r()>.5?'255,255,235':'74,60,40'},${r()*.13})`;c.fillRect(x,y,2,1);c.fillRect(x,y,1,3);}});}
function woodTexture(){return canvasTexture(1024,1024,(c,w,h)=>{const r=rng(44);for(let row=0;row<16;row++){const y=row*64;c.fillStyle=['#cba576','#d2ae7e','#c6a071','#d7b487','#cda87b'][row%5];c.fillRect(0,y,w,64);c.fillStyle='#b58e63';c.fillRect(0,y,w,2);for(let x=(row%2)*180-160;x<w;x+=340){c.fillStyle='#b99269';c.fillRect(x,y,2,64);}for(let i=0;i<85;i++){c.beginPath();const x=r()*w,yy=y+r()*64;c.moveTo(x,yy);c.bezierCurveTo(x+40,yy-2,x+160,yy+3,x+220,yy);c.strokeStyle=`rgba(108,70,36,${.025+r()*.065})`;c.lineWidth=.5+r();c.stroke();}}});}
function wallpaperTexture(){return canvasTexture(512,512,(c,w,h)=>{c.fillStyle='#cbd0b4';c.fillRect(0,0,w,h);for(let x=0;x<w;x+=8){c.fillStyle=x%16===0?'#ffffff06':'#6c795d06';c.fillRect(x,0,1,h);}for(let y=24;y<h;y+=70)for(let x=24;x<w;x+=70){let xx=x+(y%140>50?35:0);c.strokeStyle='#a4b39377';c.lineWidth=1;c.beginPath();c.moveTo(xx,y+11);c.bezierCurveTo(xx+9,y+4,xx-9,y-2,xx,y-13);c.stroke();c.fillStyle='#a8b69666';for(const sign of [-1,1]){c.beginPath();c.ellipse(xx+sign*4,y+sign*3,5,2.2,sign*.7,0,TAU);c.fill();}c.fillStyle='#e7e5cb99';c.beginPath();c.arc(xx,y-12,2.5,0,TAU);c.fill();}});}
function rugTexture(){return canvasTexture(1024,1024,(c,w,h)=>{c.fillStyle='#bd9385';c.fillRect(0,0,w,h);const r=rng(5);for(let i=500;i>15;i-=3){c.beginPath();c.arc(512,512,i,0,TAU);c.strokeStyle=i>450||i<55?'#ddbd9e':i>425&&i<440?'#846f65':`rgba(235,197,168,${.12+r()*.21})`;c.lineWidth=1.4;c.stroke();}for(let a=0;a<TAU;a+=.19){c.save();c.translate(512+Math.cos(a)*392,512+Math.sin(a)*392);c.rotate(a);c.fillStyle='#dbc0a0';c.beginPath();c.ellipse(0,0,9,4,0,0,TAU);c.fill();c.restore();}for(let i=0;i<15000;i++){c.fillStyle=r()>.5?'#fff5cf0c':'#59473709';c.fillRect(r()*w,r()*h,2,2);}});}
function skyTexture(){return canvasTexture(256,256,(c,w,h)=>{const g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,'#acc5c0');g.addColorStop(.65,'#e1dbc0');g.addColorStop(1,'#c0bd8c');c.fillStyle=g;c.fillRect(0,0,w,h);c.fillStyle='#faf0caaa';c.beginPath();c.arc(164,65,32,0,TAU);c.fill();for(let i=0;i<7;i++){c.fillStyle=['#9cad89','#a8b795','#bdc59e'][i%3];c.beginPath();c.ellipse(i*53-30,265-i%3*13,63,95,0,0,TAU);c.fill();}});}
function pictureTexture(){return canvasTexture(256,310,(c,w,h)=>{c.fillStyle='#e9dbb8';c.fillRect(0,0,w,h);c.fillStyle='#c5ba93';c.fillRect(17,17,w-34,h-34);c.fillStyle='#e9ddbd';c.fillRect(22,22,w-44,h-44);c.strokeStyle='#7e926c';c.lineWidth=4;for(let i=0;i<5;i++){const x=78+i*27,y=105+(i%2)*25;c.beginPath();c.moveTo(125,240);c.quadraticCurveTo(x+10,160,x,y);c.stroke();c.fillStyle='#93a079';c.beginPath();c.ellipse(x+4,y+60,18,6,-.7,0,TAU);c.fill();for(let a=0;a<TAU;a+=TAU/5){c.fillStyle=['#b47763','#b5a25f','#e2bd8b'][i%3];c.beginPath();c.ellipse(x+Math.cos(a)*12,y+Math.sin(a)*12,11,8,a,0,TAU);c.fill();}c.fillStyle='#7d7453';c.beginPath();c.arc(x,y,5,0,TAU);c.fill();}c.fillStyle='#b7b69a';c.beginPath();c.moveTo(95,208);c.lineTo(160,208);c.lineTo(150,265);c.lineTo(109,265);c.fill();});}

export class Room {
  constructor(canvas,state,{onInteract,onCollect,onMove,onReady}) {
    this.canvas=canvas;this.state=state;this.handlers={onInteract,onCollect,onMove,onReady};this.time=0;this.reduced=state.reducedMotion;this.zoom=1;this.moving=false;this.paused=false;this.pendingInteraction=null;this.keys=new Set();this.treasures=new Map();this.keepsakes=new Map();this.decorations=new Map();this.particles=[];this.obstacles=[];
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#f4f0e8');
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.7));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.05;
    this.camera=new THREE.OrthographicCamera(-9,9,7,-7,.1,100);this.camera.position.set(12,11,15);this.camera.lookAt(0,1.12,0);
    this.raycaster=new THREE.Raycaster();this.pointer=new THREE.Vector2();this.floorPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);this.target=new THREE.Vector3(state.position.x,0,state.position.z);this.position=this.target.clone();
    this.materials=new Map();this.makeLighting();this.makeArchitecture();this.makeFurniture();this.makeDoll();this.makeTreasures();this.makeDecorations();this.makeDust();this.batchStaticMeshes();this.sync();
    this.marker=new THREE.Mesh(new THREE.RingGeometry(.14,.17,48),new THREE.MeshBasicMaterial({color:'#f9efc5',transparent:true,opacity:.85,side:THREE.DoubleSide,depthWrite:false}));this.marker.rotation.x=-Math.PI/2;this.marker.position.y=.035;this.marker.visible=false;this.scene.add(this.marker);
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas.parentElement);this.resize();
    canvas.addEventListener('pointerdown',e=>this.pointerDown(e));
    canvas.addEventListener('keydown',e=>this.keyDown(e));
    window.addEventListener('keyup',e=>this.keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>this.keys.clear());
    this.last=performance.now();this.frame=requestAnimationFrame(t=>this.animate(t));onReady?.();
  }
  mat(color,roughness=.9){const key=`${color}:${roughness}`;if(!this.materials.has(key))this.materials.set(key,new THREE.MeshStandardMaterial({color,roughness}));return this.materials.get(key);}
  fabric(color){const key=`cloth:${color}`;if(!this.materials.has(key)){const tex=clothTexture(color);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(3,3);this.materials.set(key,new THREE.MeshStandardMaterial({map:tex,roughness:1}));}return this.materials.get(key);}
  mesh(geometry,material,parent=this.scene){const m=new THREE.Mesh(geometry,typeof material==='string'?this.mat(material):material);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
  box(w,h,d,color,x=0,y=0,z=0,r=.03,parent=this.scene){const m=this.mesh(r?new RoundedBoxGeometry(w,h,d,2,Math.min(r,w/2,h/2,d/2)):new THREE.BoxGeometry(w,h,d),color,parent);m.position.set(x,y,z);return m;}
  ball(r,color,x,y,z,parent=this.scene,scale){const m=this.mesh(new THREE.SphereGeometry(r,24,16),color,parent);m.position.set(x,y,z);if(scale)m.scale.set(...scale);return m;}
  cylinder(rt,rb,h,color,x,y,z,parent=this.scene){const m=this.mesh(new THREE.CylinderGeometry(rt,rb,h,40),color,parent);m.position.set(x,y,z);return m;}
  curve(points,r,color,parent=this.scene){const m=this.mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),Math.max(12,points.length*5),r,6,false),color,parent);return m;}
  group(x,y,z,parent=this.scene){const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);return g;}
  obstacle(x,z,w,d){this.obstacles.push({x,z,w:w+.24,d:d+.24});}
  makeLighting(){
    this.scene.add(new THREE.HemisphereLight('#fff7df','#d7c3a0',1.7));
    const sun=new THREE.DirectionalLight('#ffe6ae',2.4);sun.position.set(-3,8,1);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-8,right:8,top:8,bottom:-8,near:.5,far:25});sun.shadow.bias=-.0005;sun.shadow.normalBias=.03;sun.shadow.radius=4;this.scene.add(sun);
    const fill=new THREE.DirectionalLight('#e5ebdc',.9);fill.position.set(7,5,7);this.scene.add(fill);
    this.lampLight=new THREE.PointLight('#ffd186',0,7,2);this.lampLight.position.set(-3.3,1.95,-2.2);this.scene.add(this.lampLight);
    const ground=this.mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({opacity:.12}));ground.rotation.x=-Math.PI/2;ground.position.y=-.37;ground.castShadow=false;
  }
  makeArchitecture(){
    this.box(10.25,.32,8.25,'#ae895f',0,-.19,0,.07);
    const wood=woodTexture();this.box(10,.08,8,new THREE.MeshStandardMaterial({map:wood,roughness:.95}),0,-.005,0,.015);
    this.box(10.2,.12,.1,'#99794f',0,-.09,4.08);this.box(.1,.12,8.2,'#b89567',5.08,-.09,0);
    const wallTex=wallpaperTexture();wallTex.wrapS=wallTex.wrapT=THREE.RepeatWrapping;wallTex.repeat.set(3,1.25);
    const wallMat=new THREE.MeshStandardMaterial({map:wallTex,roughness:1});
    this.box(10.18,3.65,.15,wallMat,0,1.79,-4.02,.025);
    this.box(.15,3.65,8.18,wallMat,-5.02,1.79,0,.025);
    this.box(10.23,.12,.22,'#e1d6b9',0,3.63,-4.02,.025);this.box(.22,.12,8.2,'#e1d6b9',-5.02,3.63,0,.025);
    this.box(10,.75,.065,'#bec1a6',0,.39,-3.9,.01);this.box(.065,.75,8,'#bec1a6',-4.91,.39,0,.01);
    this.box(10,.075,.12,'#e1ddc4',0,.79,-3.87,.015);this.box(.12,.075,8,'#e1ddc4',-4.87,.79,0,.015);
    this.box(10,.16,.12,'#e5dcc3',0,.11,-3.87,.015);this.box(.12,.16,8,'#e5dcc3',-4.87,.11,0,.015);
    for(let x=-4.6;x<5;x+=.8)this.box(.023,.59,.018,'#acb194',x,.42,-3.855,0);
    for(let z=-3.5;z<4;z+=.8)this.box(.018,.59,.023,'#acb194',-4.855,.42,z,0);
    this.makeWindow();
    const rug=this.mesh(new THREE.CircleGeometry(1,96),new THREE.MeshStandardMaterial({map:rugTexture(),roughness:1}));rug.rotation.x=-Math.PI/2;rug.scale.set(2.78,1.97,1);rug.position.set(.05,.047,.75);rug.castShadow=false;
    for(let i=0;i<100;i++){const a=i*TAU/100,x=Math.cos(a)*2.81,z=Math.sin(a)*1.995;const tassel=this.box(.06,.017,.09,'#d6b99b',x+.05,.047,z+.75,.008);tassel.rotation.y=-a;}
    this.makePicture(1.02,2.22,-3.89,1.1,1.34,pictureTexture());
    this.makePicture(2.4,2.62,-3.89,.65,.77,canvasTexture(180,180,c=>{c.fillStyle='#e5cfa6';c.fillRect(0,0,180,180);c.fillStyle='#869177';c.beginPath();c.arc(90,98,49,0,TAU);c.fill();c.fillStyle='#e7dcbb';c.beginPath();c.arc(78,91,34,0,TAU);c.fill();}));
    const cord=[];for(let i=0;i<=16;i++){const x=-4.6+i*.57;cord.push([x,3.36-.3*Math.sin(i/16*Math.PI),-3.65]);}
    this.curve(cord,.011,'#94876b');this.bulbs=[];
    for(let i=0;i<16;i++){const x=-4.35+i*.55,y=3.35-.31*Math.sin(i/16*Math.PI);this.cylinder(.025,.025,.05,'#ad9361',x,y-.03,-3.65);const bulb=this.ball(.048,new THREE.MeshStandardMaterial({color:'#fff0c5',emissive:'#ffc45e',emissiveIntensity:.6}),x,y-.09,-3.65);this.bulbs.push(bulb);}
  }
  makeWindow(){
    const g=this.group(-2.65,2.16,-3.89);
    this.box(2.23,2.15,.12,'#b9a684',0,0,0,.05,g);
    this.box(2.04,1.96,.07,new THREE.MeshStandardMaterial({map:skyTexture(),emissive:'#c8d6bb',emissiveIntensity:.2,roughness:.6}),0,0,.07,.015,g);
    for(const x of [-1.04,0,1.04])this.box(.075,2.04,.14,'#f2e3c4',x,0,.13,.015,g);
    for(const y of [-1.01,0,1.01])this.box(2.17,.075,.14,'#f2e3c4',0,y,.13,.015,g);
    this.box(2.46,.13,.47,'#f1dfbe',0,-1.12,.12,.025,g);
    this.cylinder(.032,.032,2.9,'#a3885f',0,1.2,.14,g).rotation.z=Math.PI/2;
    for(const x of [-1.5,1.5])this.ball(.06,'#b09a72',x,1.2,.14,g);
    for(const side of [-1,1]){
      const geo=new THREE.PlaneGeometry(.61,2.12,16,20),pos=geo.attributes.position;
      for(let i=0;i<pos.count;i++){const y=pos.getY(i);pos.setZ(i,.08+Math.sin(pos.getX(i)*38)*.065);pos.setX(i,pos.getX(i)+side*.1*Math.sin((y+1)*1.45));}geo.computeVertexNormals();
      const curtain=this.mesh(geo,new THREE.MeshStandardMaterial({map:clothTexture('#e8dbc3'),roughness:1,side:THREE.DoubleSide}),g);curtain.position.set(side*1.03,.05,.22);
      this.box(.3,.05,.12,'#c3b08b',side*1.08,-.28,.24,.02,g);
    }
    // A broad translucent pool of afternoon light sits below the window.
    const light=this.mesh(new THREE.PlaneGeometry(3.5,2.4),new THREE.MeshBasicMaterial({color:'#fff0b7',transparent:true,opacity:.095,depthWrite:false}));light.rotation.x=-Math.PI/2;light.rotation.z=.35;light.position.set(-2.25,.057,-.8);light.castShadow=false;light.receiveShadow=false;
  }
  makePicture(x,y,z,w,h,texture){this.box(w+.12,h+.12,.07,'#a9875b',x,y,z,.02);this.box(w+.04,h+.04,.03,'#f1e3c5',x,y,z+.05,.01);const p=this.mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map:texture,roughness:1}));p.position.set(x,y,z+.075);p.castShadow=false;}
  makeFurniture(){
    // A hand-painted bedside cabinet.
    const cabinet=this.group(-3.35,0,-2.25);this.box(1.65,.95,1.04,'#b5baa0',0,.64,0,.045,cabinet);this.box(1.78,.12,1.15,'#d4c09a',0,1.15,0,.025,cabinet);
    for(const x of [-.65,.65])for(const z of [-.33,.33])this.box(.12,.32,.13,'#b19b76',x,.2,z,.018,cabinet);
    for(const y of [.42,.84]){this.box(1.44,.34,.07,'#c1c5ac',0,y,.554,.025,cabinet);for(const x of [-.43,.43])this.ball(.039,'#c3a66e',x,y,.607,cabinet);}
    this.obstacle(-3.35,-2.25,1.75,1.15);
    const lamp=this.group(-3.45,1.23,-2.25);this.cylinder(.25,.29,.09,'#ac9468',0,0,0,lamp);this.cylinder(.036,.043,.63,'#a88f62',0,.35,0,lamp);this.lampshade=this.cylinder(.26,.48,.47,new THREE.MeshStandardMaterial({map:clothTexture('#ead8ac'),roughness:1,emissive:'#ffd087',emissiveIntensity:0}),0,.81,0,lamp);
    this.cylinder(.275,.275,.025,'#ddc399',0,1.05,0,lamp);this.cylinder(.485,.485,.025,'#d2b789',0,.57,0,lamp);this.ball(.045,'#ba9e6c',0,1.095,0,lamp);
    this.keepsakes.set('lamp',lamp);this.book(-2.78,1.27,-2.2,.38,.07,.5,'#b58067',-.14);
    // A welcoming reading chair.
    const chair=this.group(3.67,0,-2.55);chair.rotation.y=-.24;
    for(const x of [-.49,.49])for(const z of [-.43,.43])this.cylinder(.065,.047,.38,'#a78761',x,.2,z,chair);
    const green=this.fabric('#9aa17a');this.box(1.38,.26,1.42,green,0,.52,0,.13,chair);this.box(1.17,.26,1.1,green,0,.72,.07,.13,chair);this.box(1.33,1.33,.29,green,0,1.16,-.57,.13,chair);this.box(.22,.55,1.22,green,-.65,.88,.02,.1,chair);this.box(.22,.55,1.22,green,.65,.88,.02,.1,chair);
    const pillow=this.box(.67,.64,.23,this.fabric('#e0c6a1'),0,1.04,-.27,.13,chair);pillow.rotation.z=.18;pillow.rotation.x=-.14;this.ball(.035,'#ba9e7f',0,1.04,-.13,chair);
    this.obstacle(3.67,-2.55,1.65,1.62);
    // An old hatbox holds a bear and the letter.
    this.cylinder(.59,.57,.56,'#b79070',-.25,.31,-2.86);this.cylinder(.61,.61,.09,'#c6a382',-.25,.62,-2.86);this.cylinder(.595,.58,.02,'#e0c397',-.25,.22,-2.86);
    this.obstacle(-.25,-2.86,1.2,1.15);const bear=this.makeBear(-.25,.66,-2.86);this.keepsakes.set('bear',bear);
    const label=this.box(.32,.14,.01,'#e7d5b0',-.25,.4,-2.286,.008);label.rotation.z=.04;
    // The music box waits on a low table.
    const table=this.group(2.6,0,-.9);this.cylinder(.63,.6,.12,'#c4a17d',0,.7,0,table);for(const [x,z] of [[-.37,-.25],[.37,-.25],[0,.4]])this.cylinder(.044,.075,.66,'#ac8966',x,.34,z,table);this.obstacle(2.6,-.9,1.1,1.1);
    const music=this.group(2.65,.8,-.95);this.box(.67,.22,.48,'#ae7e60',0,.08,0,.035,music);this.box(.73,.07,.53,'#c09573',0,.215,0,.025,music);this.box(.57,.025,.36,'#dbbe85',0,.255,0,.016,music);this.cylinder(.075,.075,.024,'#b29967',0,.279,0,music);this.ball(.025,'#dec38b',.38,.12,0,music);this.musicFigure=this.ball(.055,'#e9d9b7',0,.39,0,music,[.6,1.5,.6]);this.keepsakes.set('music',music);
    // A low bookcase against the left wall, plus books with uneven spines.
    const shelf=this.group(-4.43,0,.45);this.box(.1,1.6,2.13,'#b2936c',-.36,.85,0,.025,shelf);for(const z of [-1.035,1.035])this.box(.85,1.48,.08,'#bba17d',0,.86,z,.01,shelf);
    for(const y of [.15,.79,1.47])this.box(.92,.08,2.2,'#c1a27b',.06,y,0,.02,shelf);
    for(let i=0;i<9;i++){const z=-.87+i*.21,h=.35+(i%3)*.075;const b=this.box(.66,h,.145,['#ad7460','#899880','#c0a56f','#8a9ca0'][i%4],.11,.83+h/2,z,.01,shelf);b.rotation.x=(i===7?.1:0);this.box(.01,.025,.13,'#d8c6a0',.447,.92+h/2,z,.002,shelf);}
    for(let i=0;i<6;i++)this.box(.66,.07,1.07-i*.04,['#99a184','#cab591','#aa7f69'][i%3],.12,.22+i*.071,.22,.01,shelf);
    this.obstacle(-4.43,.45,1,2.25);this.plant(-4.45,1.56,.04,.62);
    // Two packing boxes, a folded blanket, and a handwritten moving label.
    const box=this.group(3.85,0,2.52);box.rotation.y=-.2;this.box(1.15,.8,1.02,'#c7a981',0,.42,0,.025,box);this.box(1.21,.065,1.07,'#d3b58e',0,.855,0,.01,box);this.box(.21,.017,1.08,'#ded0ab',0,.896,0,.003,box);this.box(.4,.22,.012,'#e9dcbb',0,.47,.52,.003,box);this.obstacle(3.85,2.52,1.25,1.15);
    this.book(3.82,.95,2.52,.77,.09,.6,'#8e9b86',-.2);this.book(3.83,1.045,2.52,.73,.07,.51,'#bd8c76',-.12);
    const folded=this.box(.86,.13,.7,this.fabric('#ded2b2'),3.9,1.16,2.55,.07);folded.rotation.y=-.18;
    // A spool basket in the foreground.
    const basket=this.group(-2.3,0,2.86);this.cylinder(.4,.3,.39,this.fabric('#b8a280'),0,.23,0,basket);this.cylinder(.415,.415,.05,'#c9b18a',0,.44,0,basket);
    for(let i=0;i<10;i++){const a=i*TAU/10;this.curve([[Math.cos(a)*.3,.06,Math.sin(a)*.3],[Math.cos(a)*.36,.25,Math.sin(a)*.36],[Math.cos(a)*.4,.42,Math.sin(a)*.4]],.012,'#d1b994',basket);}
    this.ball(.19,this.fabric('#b97e71'),-.13,.43,0,basket);this.ball(.18,this.fabric('#a5ad85'),.14,.45,.04,basket);this.curve([[-.25,.51,0],[-.11,.93,0],[.18,.92,0],[.32,.49,0]],.025,'#c1a17a',basket);this.obstacle(-2.3,2.86,.65,.65);
    this.book(1.12,.13,-3.05,.78,.18,1.02,'#8e9b86',-.23);this.book(1.14,.27,-3.05,.71,.09,.93,'#c5a171',-.32);
    this.plant(4.27,0,-.14,.97);this.obstacle(4.27,-.14,.58,.58);
  }
  book(x,y,z,w,h,d,color,angle=0){const g=this.group(x,y,z);g.rotation.y=angle;this.box(w,h,d,'#e2d3b2',0,0,0,.01,g);for(const yy of [-h/2,h/2])this.box(w+.045,.027,d+.03,color,0,yy,0,.008,g);this.box(.04,h+.02,d+.03,color,-w/2,0,0,.008,g);for(let i=0;i<3;i++)this.box(.01,.009,d*.7,'#b3aa91',w/2+.006,-h/2+.03+i*.03,0,0,g);return g;}
  plant(x,y,z,scale){const g=this.group(x,y,z);g.scale.setScalar(scale);this.cylinder(.28,.21,.4,'#ba8a6b',0,.22,0,g);this.cylinder(.29,.29,.075,'#c89b7e',0,.43,0,g);this.cylinder(.245,.245,.015,'#81714e',0,.47,0,g);
    for(let i=0;i<9;i++){const a=i*2.4,h=.45+(i%4)*.14;this.curve([[0,.46,0],[Math.cos(a)*.1,h,Math.sin(a)*.1],[Math.cos(a)*.29,h+.15,Math.sin(a)*.29]],.012,'#7f8e64',g);const leaf=this.ball(.18,['#8c9f75','#9dab83','#76896a'][i%3],Math.cos(a)*.3,h+.19,Math.sin(a)*.3,g,[.6,1.5,.2]);leaf.rotation.set(.3,a,-Math.cos(a)*.6);}return g;}
  makeBear(x,y,z){const g=this.group(x,y,z);g.rotation.y=.2;const mat=this.fabric('#b89771');this.ball(.25,mat,0,.29,0,g,[1,1.15,.8]);this.ball(.245,mat,0,.65,0,g,[1,.9,.85]);for(const side of [-1,1]){this.ball(.1,mat,side*.185,.82,0,g);this.ball(.066,this.fabric('#d4b58a'),side*.19,.82,.052,g);this.ball(.13,mat,side*.2,.13,.15,g,[1,.65,1.4]);this.ball(.1,mat,side*.26,.4,.015,g,[.7,1.5,.8]);}this.ball(.108,this.fabric('#d6ba90'),0,.6,.18,g,[1,.76,.44]);this.ball(.032,'#57493b',0,.642,.223,g,[1,.7,.5]);this.ball(.022,'#493f35',-.084,.711,.18,g);this.bearEye=this.ball(.023,'#a39372',.084,.711,.18,g);this.curve([[.055,.738,.197],[.108,.686,.197]],.008,'#5a4b3c',g);this.curve([[.055,.686,.197],[.108,.738,.197]],.008,'#5a4b3c',g);this.box(.24,.085,.07,this.fabric('#8a9578'),0,.465,.14,.02,g);return g;}
  makeDoll(){
    this.doll=this.group(this.position.x,0,this.position.z);this.doll.rotation.y=.45;this.dollBody=this.group(0,0,0,this.doll);
    const linen=this.fabric('#e0c49a'),bodyMat=this.fabric('#c9ad83');
    this.box(.4,.43,.29,bodyMat,0,.43,0,.11,this.dollBody);
    this.head=this.box(.52,.46,.4,linen,0,.87,0,.15,this.dollBody);
    // A center seam makes Pip feel stitched, rather than plastic.
    for(let i=0;i<5;i++)this.box(.033,.009,.012,'#bca17a',.07,.71+i*.07,.208,.002,this.dollBody);
    for(const side of [-1,1]){
      this.ball(.074,linen,side*.273,.85,0,this.dollBody,[.65,1,.8]);
      const eye=this.cylinder(.044,.044,.023,'#514b3e',side*.118,.89,.202,this.dollBody);eye.rotation.x=Math.PI/2;
      for(const yy of [-1,1])this.ball(.006,'#bbac86',side*.118+.011,.89+yy*.013,.219,this.dollBody);
      this.ball(.033,'#d5a08a',side*.184,.8,.192,this.dollBody,[1,.47,.22]);
    }
    this.curve([[-.045,.774,.212],[0,.758,.218],[.045,.774,.212]],.007,'#8f7456',this.dollBody);
    for(let i=0;i<3;i++)this.curve([[-.12+i*.1,1.067,-.07],[-.14+i*.1,1.12,-.02],[-.1+i*.1,1.08,.055]],.011,'#aa8b63',this.dollBody);
    this.scarf=this.box(.44,.092,.34,this.fabric('#7e8c6c'),0,.624,.025,.03,this.dollBody);this.scarf.rotation.z=-.09;
    const tail=this.box(.13,.27,.052,this.fabric('#879472'),.14,.49,.199,.02,this.dollBody);tail.rotation.z=.18;
    this.arms=[];this.legs=[];for(const side of [-1,1]){const arm=this.group(side*.27,.54,0,this.dollBody);this.box(.13,.3,.145,linen,0,-.095,0,.06,arm);arm.rotation.z=side*.18;this.arms.push(arm);const leg=this.group(side*.12,.26,0,this.dollBody);this.box(.145,.22,.19,bodyMat,0,-.11,.025,.057,leg);this.box(.16,.08,.23,this.fabric('#9a8464'),0,-.2,.045,.035,leg);this.legs.push(leg);}
    this.ball(.03,'#b59662',-.075,.44,.155,this.dollBody);this.ball(.03,'#b59662',-.075,.34,.155,this.dollBody);
    this.doll.userData.kind='doll';
  }
  makeTreasures(){for(const [index,item]of TREASURES.entries()){
    const g=this.group(item.x,.07,item.z);g.userData={id:item.id,kind:'treasure'};g.rotation.y=index*1.76;
    if(item.kind==='spool'){this.cylinder(.095,.095,.23,this.fabric(item.color),0,.125,0,g);for(const y of [.025,.245])this.cylinder(.13,.13,.035,'#dfc9a3',0,y,0,g);this.cylinder(.025,.025,.005,'#8f7655',0,.265,0,g);this.curve([[.09,.08,0],[.22,.015,.05],[.3,.015,-.1],[.4,.015,-.08]],.008,item.color,g);}
    else if(item.kind==='button'){this.cylinder(.145,.145,.047,item.color,0,.025,0,g);const rim=this.mesh(new THREE.TorusGeometry(.116,.008,6,32),'#e4cc9d',g);rim.rotation.x=-Math.PI/2;rim.position.y=.051;for(const x of [-.045,.045])for(const z of [-.045,.045])this.cylinder(.015,.015,.002,'#716550',x,.051,z,g);}
    else {const shape=new THREE.Shape();for(let i=0;i<10;i++){const a=i*Math.PI/5,r=i%2?.073:.18;const x=Math.sin(a)*r,y=Math.cos(a)*r;i?shape.lineTo(x,y):shape.moveTo(x,y);}shape.closePath();const star=this.mesh(new THREE.ExtrudeGeometry(shape,{depth:.024,bevelEnabled:true,bevelSize:.01,bevelThickness:.01,bevelSegments:1,steps:1}),item.color,g);star.rotation.x=-Math.PI/2;star.position.y=.025;}
    const halo=this.mesh(new THREE.RingGeometry(.27,.29,40),new THREE.MeshBasicMaterial({color:'#eee4b0',transparent:true,opacity:.48,side:THREE.DoubleSide,depthWrite:false}),g);halo.rotation.x=-Math.PI/2;halo.position.y=.007;halo.castShadow=false;
    const sparkle=this.mesh(new THREE.OctahedronGeometry(.032),new THREE.MeshBasicMaterial({color:'#ffefbd',transparent:true,opacity:.85}),g);sparkle.position.y=.43;g.userData.sparkle=sparkle;g.userData.halo=halo;
    this.treasures.set(item.id,g);
  }}
  makeDecorations(){
    const flowers=this.group(-2.05,1.12,-3.5);this.cylinder(.12,.16,.32,'#e9d7b8',0,.17,0,flowers);for(let i=0;i<5;i++){const a=i*2.4,x=Math.cos(a)*.14,z=Math.sin(a)*.14,h=.54+(i%2)*.1;this.curve([[0,.27,0],[x,h,z]],.007,'#7f966c',flowers);this.ball(.038,'#d8b365',x,h,z,flowers);for(let j=0;j<6;j++){const b=j*TAU/6;this.ball(.039,'#f2e5c6',x+Math.cos(b)*.055,h,z+Math.sin(b)*.055,flowers,[1,.25,1]);}}this.decorations.set('flowers',flowers);
    const bunting=this.group(0,0,0);const pts=[];for(let i=0;i<12;i++){let x=-4.4+i*.8,y=2.81-.41*Math.sin(i/11*Math.PI);pts.push([x,y,-3.64]);const shape=new THREE.Shape();shape.moveTo(-.15,0);shape.lineTo(.15,0);shape.lineTo(0,-.31);shape.closePath();const flag=this.mesh(new THREE.ShapeGeometry(shape),new THREE.MeshStandardMaterial({color:['#be8d7e','#c6b17a','#8e9b7c','#b4a1b3'][i%4],roughness:1,side:THREE.DoubleSide}),bunting);flag.position.set(x,y,-3.63);}this.curve(pts,.009,'#c1ad7c',bunting);this.decorations.set('bunting',bunting);
    const cushion=this.group(.8,.15,2.5);const pad=this.box(.75,.24,.7,this.fabric('#bd8c84'),0,0,0,.11,cushion);pad.rotation.y=.35;this.ball(.037,'#a77471',0,.126,0,cushion,[1,.3,1]);this.decorations.set('cushion',cushion);
  }
  makeDust(){const r=rng(9);const positions=[];for(let i=0;i<75;i++)positions.push(r()*10-5,r()*3.5,r()*8-4);const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));this.dust=new THREE.Points(geo,new THREE.PointsMaterial({color:'#fff4ca',size:.024,transparent:true,opacity:.5,depthWrite:false}));this.scene.add(this.dust);}
  sync(){for(const [id,g]of this.treasures)g.visible=!this.state.collected.includes(id);for(const [id,g]of this.decorations)g.visible=this.state.decorations.includes(id);const lit=this.state.restored.includes('lamp');this.lampshade.material.emissiveIntensity=lit?.5:0;this.lampLight.intensity=lit?5:0;for(const b of this.bulbs)b.material.emissiveIntensity=lit?1.6:.3;this.bearEye.material=this.mat(this.state.restored.includes('bear')?'#514839':'#a39372');this.reduced=this.state.reducedMotion;}
  batchStaticMeshes(){
    const dynamic=new Set([this.doll,...this.keepsakes.values(),...this.treasures.values(),...this.decorations.values(),...this.bulbs]);
    this.scene.updateMatrixWorld(true);const groups=new Map();
    this.scene.traverse(mesh=>{if(!mesh.isMesh||Array.isArray(mesh.material))return;for(let p=mesh;p;p=p.parent)if(dynamic.has(p))return;const key=`${mesh.material.uuid}:${mesh.castShadow}:${mesh.receiveShadow}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(mesh);});
    for(const meshes of groups.values()){if(meshes.length<2)continue;const geometries=meshes.map(m=>{const g=m.geometry.clone().applyMatrix4(m.matrixWorld);return g.index?g.toNonIndexed():g;});const merged=mergeGeometries(geometries);if(!merged)continue;const mesh=new THREE.Mesh(merged,meshes[0].material);mesh.castShadow=meshes[0].castShadow;mesh.receiveShadow=meshes[0].receiveShadow;for(const original of meshes){original.removeFromParent();original.geometry.dispose();}for(const g of geometries)g.dispose();this.scene.add(mesh);}
  }
  resize(){const w=this.canvas.clientWidth,h=this.canvas.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h,false);const aspect=w/h;const span=(window.innerWidth<701?Math.max(10.3,14.8/aspect):Math.max(10.7,15.3/aspect))/this.zoom;this.camera.left=-span*aspect/2;this.camera.right=span*aspect/2;this.camera.top=span/2;this.camera.bottom=-span/2;this.camera.updateProjectionMatrix();}
  setZoom(delta){this.zoom=THREE.MathUtils.clamp(this.zoom+delta,.85,1.45);this.resize();}
  pointerDown(e){if(this.paused)return;this.canvas.focus({preventScroll:true});const rect=this.canvas.getBoundingClientRect();this.pointer.set((e.clientX-rect.left)/rect.width*2-1,-((e.clientY-rect.top)/rect.height)*2+1);this.raycaster.setFromCamera(this.pointer,this.camera);
    const hits=this.raycaster.intersectObjects([...this.keepsakes.values(),...[...this.treasures.values()].filter(g=>g.visible)],true);
    if(hits.length){let obj=hits[0].object;while(obj.parent&&obj.parent!==this.scene)obj=obj.parent;for(const [id,g]of this.keepsakes)if(obj===g){this.goToKeepsake(id);return;}if(obj.userData.kind==='treasure'){this.goTo(obj.position.x,obj.position.z);return;}}
    const point=new THREE.Vector3();if(this.raycaster.ray.intersectPlane(this.floorPlane,point))this.goTo(point.x,point.z);
  }
  keyDown(e){if(this.paused)return;const key=e.key.toLowerCase();if(['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d'].includes(key)){e.preventDefault();this.keys.add(key);this.pendingInteraction=null;}if(key==='e'){e.preventDefault();let nearest=RESTORATIONS.reduce((a,b)=>this.distanceTo(b.approach)<this.distanceTo(a.approach)?b:a);if(this.distanceTo(nearest.approach)<1.5)this.handlers.onInteract(nearest.id);else this.goToKeepsake(nearest.id);} }
  isWalkable(x,z){return x>-4.57&&x<4.57&&z>-3.55&&z<3.62&&!this.obstacles.some(o=>Math.abs(x-o.x)<o.w/2&&Math.abs(z-o.z)<o.d/2);}
  nearestWalkable(x,z){x=THREE.MathUtils.clamp(x,-4.5,4.5);z=THREE.MathUtils.clamp(z,-3.4,3.5);if(this.isWalkable(x,z))return{x,z};for(let r=.2;r<2;r+=.2)for(let a=0;a<TAU;a+=.35){const px=x+Math.cos(a)*r,pz=z+Math.sin(a)*r;if(this.isWalkable(px,pz))return{x:px,z:pz};}return{x:this.position.x,z:this.position.z};}
  pathTo(x,z){
    // A small deterministic A* grid prevents Pip walking through the furniture.
    const step=.22,key=(x,z)=>`${x},${z}`,start={x:Math.round(this.position.x/step),z:Math.round(this.position.z/step)},goal={x:Math.round(x/step),z:Math.round(z/step)};
    const open=[{...start,g:0,f:0}],cost=new Map([[key(start.x,start.z),0]]),parents=new Map();let end=null,iterations=0;
    while(open.length&&iterations++<2500){open.sort((a,b)=>a.f-b.f);const current=open.shift();if(Math.hypot(current.x-goal.x,current.z-goal.z)<1.5){end=current;break;}
      for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const nx=current.x+dx,nz=current.z+dz;if(!this.isWalkable(nx*step,nz*step))continue;if(dx&&dz&&(!this.isWalkable((current.x+dx)*step,current.z*step)||!this.isWalkable(current.x*step,(current.z+dz)*step)))continue;const g=current.g+Math.hypot(dx,dz),k=key(nx,nz);if(g>=(cost.get(k)??Infinity))continue;cost.set(k,g);parents.set(k,current);open.push({x:nx,z:nz,g,f:g+Math.hypot(nx-goal.x,nz-goal.z)});}
    }
    if(!end)return[];const path=[];let current=end;while(current.x!==start.x||current.z!==start.z){path.unshift(new THREE.Vector3(current.x*step,0,current.z*step));current=parents.get(key(current.x,current.z));if(!current)break;}path.push(new THREE.Vector3(x,0,z));return path;
  }
  goTo(x,z){if(this.paused)return;this.pendingInteraction=null;const p=this.nearestWalkable(x,z);this.path=this.pathTo(p.x,p.z);this.target.set(p.x,0,p.z);this.marker.position.set(p.x,.06,p.z);this.marker.visible=true;this.handlers.onMove?.();}
  goToKeepsake(id){const item=RESTORATIONS.find(t=>t.id===id);if(!item)return;this.goTo(item.approach.x,item.approach.z);this.pendingInteraction=id;}
  distanceTo(p){return Math.hypot(this.position.x-p.x,this.position.z-p.z);}
  project(position){const p=new THREE.Vector3(position.x,position.y??0,position.z).project(this.camera);return{x:(p.x*.5+.5)*this.canvas.clientWidth,y:(-p.y*.5+.5)*this.canvas.clientHeight};}
  burst(x,z){if(this.reduced)return;for(let i=0;i<14;i++){const material=new THREE.MeshBasicMaterial({color:i%2?'#edcf8b':'#e7ddb5',transparent:true});const m=this.mesh(new THREE.OctahedronGeometry(.025+Math.random()*.02),material);m.position.set(x,.22,z);m.castShadow=false;this.particles.push({mesh:m,life:1.4,vx:(Math.random()-.5)*1.1,vz:(Math.random()-.5)*1.1,vy:.8+Math.random()});}}
  setPaused(value){this.paused=value;this.keys.clear();if(value)this.moving=false;}
  animate(now){this.frame=requestAnimationFrame(t=>this.animate(t));const dt=Math.min((now-this.last)/1000,.04);this.last=now;this.time+=dt;const t=this.time;
    if(!this.paused){
      let direction=null;const k=this.keys;if(k.size){const sx=(k.has('arrowright')||k.has('d')?1:0)-(k.has('arrowleft')||k.has('a')?1:0),sz=(k.has('arrowdown')||k.has('s')?1:0)-(k.has('arrowup')||k.has('w')?1:0);direction=new THREE.Vector3(sx*.78+sz*.625,0,-sx*.625+sz*.78).normalize();this.path=[];this.handlers.onMove?.();}
      else if(this.path?.length){const waypoint=this.path[0];direction=waypoint.clone().sub(this.position);if(direction.length()<.08){this.path.shift();direction=this.path.length?this.path[0].clone().sub(this.position):null;}if(direction)direction.normalize();}
      this.moving=!!direction&&direction.lengthSq()>.01;
      if(this.moving){const step=1.72*dt;const nx=this.position.x+direction.x*step,nz=this.position.z+direction.z*step;if(this.isWalkable(nx,nz)){this.position.x=nx;this.position.z=nz;}else{if(this.isWalkable(nx,this.position.z))this.position.x=nx;if(this.isWalkable(this.position.x,nz))this.position.z=nz;}
        const angle=Math.atan2(direction.x,direction.z);let diff=angle-this.doll.rotation.y;diff=Math.atan2(Math.sin(diff),Math.cos(diff));this.doll.rotation.y+=diff*Math.min(1,dt*12);this.state.position={x:this.position.x,z:this.position.z};
      }else{this.marker.visible=false;if(this.pendingInteraction){const id=this.pendingInteraction;this.pendingInteraction=null;this.handlers.onInteract(id);}}
      for(const [id,g]of this.treasures)if(g.visible&&this.distanceTo(g.position)<.55){this.handlers.onCollect(id);this.burst(g.position.x,g.position.z);}
    }
    this.doll.position.copy(this.position);this.dollBody.position.y=this.reduced?0:this.moving?Math.abs(Math.sin(t*12))*.035:Math.sin(t*2.1)*.012;
    const stride=this.reduced?0:this.moving?Math.sin(t*12)*.43:0;this.legs[0].rotation.x=stride;this.legs[1].rotation.x=-stride;this.arms[0].rotation.x=-stride*.65;this.arms[1].rotation.x=stride*.65;
    for(const [id,g]of this.treasures)if(g.visible){g.userData.sparkle.position.y=this.reduced?.4:.41+Math.sin(t*2+g.position.x)*.07;g.userData.sparkle.rotation.y=this.reduced?0:t;g.userData.halo.material.opacity=this.reduced?.4:.3+Math.sin(t*2+g.position.z)*.12;}
    if(!this.reduced){this.dust.rotation.y=Math.sin(t*.06)*.035;if(this.state.restored.includes('music'))this.musicFigure.rotation.y=t*.8;}
    for(let i=this.particles.length-1;i>=0;i--){const p=this.particles[i];p.life-=dt;if(p.life<=0){this.scene.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose();this.particles.splice(i,1);continue;}p.mesh.position.x+=p.vx*dt;p.mesh.position.z+=p.vz*dt;p.mesh.position.y+=p.vy*dt;p.vy-=1.7*dt;p.mesh.material.opacity=p.life/1.4;}
    this.renderer.render(this.scene,this.camera);this.onFrame?.();
  }
  photo(){this.renderer.render(this.scene,this.camera);return this.canvas.toDataURL('image/png');}
}
