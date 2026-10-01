import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {FRUITS} from './picnic-game.js';
import {makePicnicToy,makeBubbleJar} from './picnic-wishes-art.js';
const TAU=Math.PI*2;
export function texture(w,h,draw){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
export class ToyMaker {
 picnic(level){return makePicnicToy(this,level);}
 bubbleJar(){return makeBubbleJar(this);}
 constructor(){this.materials=new Map();}
 mat(color,roughness=.44){const k=color+roughness;if(!this.materials.has(k))this.materials.set(k,new THREE.MeshPhysicalMaterial({color,roughness,clearcoat:.28,clearcoatRoughness:.34}));return this.materials.get(k);}
 mesh(geo,color,parent){const m=new THREE.Mesh(geo,typeof color==='string'?this.mat(color):color);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
 box(w,h,d,color,x,y,z,parent,r=.08){const m=this.mesh(new RoundedBoxGeometry(w,h,d,2,Math.min(r,w/2,h/2,d/2)),color,parent);m.position.set(x,y,z);return m;}
 ball(r,color,x,y,z,parent,scale=[1,1,1]){const m=this.mesh(new THREE.SphereGeometry(r,24,18),color,parent);m.position.set(x,y,z);m.scale.set(...scale);return m;}
 cyl(rt,rb,h,color,x,y,z,parent){const m=this.mesh(new THREE.CylinderGeometry(rt,rb,h,32),color,parent);m.position.set(x,y,z);return m;}
 curve(points,r,color,parent){return this.mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),20,r,7,false),color,parent);}
 leaf(x,y,z,angle,parent,size=1,color='#20cfa1'){const m=this.ball(.2,color,x,y,z,parent,[size,.17*size,.52*size]);m.rotation.set(.2,angle,-.35);return m;}
 stem(parent,y=1){this.curve([[0,y-.1,0],[.02,y+.13,.015],[.1,y+.2,0]],.029,'#658848',parent);this.leaf(.18,y+.1,.015,.3,parent);}
 face(parent,y=.48,z=.39,width=.14,scale=1){const face=new THREE.Group();face.position.set(0,y+.19,z*.95);face.rotation.x=-.55;face.scale.setScalar(scale);parent.add(face);for(const side of [-1,1]){this.ball(.049,'#302142',side*width,0,.01,face,[.92,1.13,.48]);this.ball(.016,'#ffffff',side*width-.014,.018,.035,face,[1,1,.5]);this.ball(.006,'#fff5cd',side*width+.015,-.015,.035,face);this.ball(.068,'#ff75ac',side*(width+.075),-.064,-.004,face,[1,.53,.18]);}this.curve([[-.048,-.05,.028],[0,-.081,.039],[.048,-.05,.028]],.013,'#663056',face);return face;}
 candy(geometry,bottom,top,parent){const a=new THREE.Color(bottom),b=new THREE.Color(top),colors=[],p=geometry.attributes.position;geometry.computeBoundingBox();const {min,max}=geometry.boundingBox;for(let i=0;i<p.count;i++){const t=(p.getY(i)-min.y)/(max.y-min.y),c=a.clone().lerp(b,THREE.MathUtils.smoothstep(t,.15,.95));colors.push(c.r,c.g,c.b);}geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));const key='candy';if(!this.materials.has(key))this.materials.set(key,new THREE.MeshPhysicalMaterial({vertexColors:true,roughness:.3,clearcoat:.72,clearcoatRoughness:.2}));return this.mesh(geometry,this.materials.get(key),parent);}
 candyBall(r,bottom,top,x,y,z,parent,scale=[1,1,1]){const m=this.candy(new THREE.SphereGeometry(r,28,20),bottom,top,parent);m.position.set(x,y,z);m.scale.set(...scale);return m;}
 sparkle(parent,x,y,z,size=.06){const s=new THREE.Shape();for(let i=0;i<8;i++){const a=i*Math.PI/4,r=i%2?size*.27:size;const px=Math.sin(a)*r,py=Math.cos(a)*r;i?s.lineTo(px,py):s.moveTo(px,py);}s.closePath();const key='star-glaze';if(!this.materials.has(key))this.materials.set(key,new THREE.MeshBasicMaterial({color:'#fff5b2',side:THREE.DoubleSide}));const m=this.mesh(new THREE.ShapeGeometry(s),this.materials.get(key),parent);m.position.set(x,y,z);m.rotation.x=-.55;m.castShadow=false;return m;}
 batch(group){group.updateMatrixWorld(true);const batches=new Map();group.traverse(m=>{if(!m.isMesh||Array.isArray(m.material))return;if(!batches.has(m.material.uuid))batches.set(m.material.uuid,[]);batches.get(m.material.uuid).push(m);});for(const meshes of batches.values()){if(meshes.length<2)continue;const geos=meshes.map(m=>{const local=new THREE.Matrix4().copy(group.matrixWorld).invert().multiply(m.matrixWorld),copy=m.geometry.clone().applyMatrix4(local);if(!copy.index)return copy;const unindexed=copy.toNonIndexed();copy.dispose();return unindexed;});const combined=mergeGeometries(geos);if(combined){const mesh=new THREE.Mesh(combined,meshes[0].material);mesh.castShadow=true;mesh.receiveShadow=true;meshes.forEach(m=>{m.removeFromParent();m.geometry.dispose();});group.add(mesh);}geos.forEach(g=>g.dispose());}}
 fruit(level){const g=new THREE.Group();const green='#13b990';
  if(level===0){for(const s of [-1,1]){this.candyBall(.29,s===-1?'#e20a65':'#ef164a',s===-1?'#ff5b9b':'#ff827d',s*.21,.3,s===-1?.02:0,g);this.curve([[s*.21,.54,0],[s*.19,.83,-.02],[.02,1.06,0]],.025,green,g);const face=this.face(g,.20,.274,.10,.57);face.position.x=s*.21;}this.leaf(.17,1.02,.015,.5,g,1.1);this.sparkle(g,-.34,.47,.18,.044);}
  if(level===1){const pts=[[.01,.04],[.12,.10],[.28,.25],[.39,.43],[.40,.61],[.31,.75],[.12,.78],[.01,.79]].map(([r,y])=>new THREE.Vector2(r,y));this.candy(new THREE.LatheGeometry(pts,40),'#ee126d','#ff6eae',g);for(let row=0;row<3;row++){const y=.23+row*.17,r=[.26,.37,.40][row];for(let i=0;i<9;i++){const a=i*TAU/9+row*.32;const seed=this.ball(.026,'#fff1a2',Math.sin(a)*(r+.005),y,Math.cos(a)*(r+.005),g,[.58,1,.3]);seed.rotation.y=a;}}for(let i=0;i<5;i++){const a=i*TAU/5;this.leaf(Math.sin(a)*.12,.79,Math.cos(a)*.12,a,g,1.2);}this.stem(g,.83);this.face(g,.43,.397,.13);}
  if(level===2){let grape=0;for(const [x,y,z,r]of [[-.2,.5,0,.24],[.2,.51,0,.25],[0,.76,-.01,.23],[-.25,.27,.08,.23],[.15,.28,.17,.25],[.34,.3,-.10,.20],[-.02,.09,.10,.19],[-.08,.53,.29,.23]])this.candyBall(r,['#6825e5','#354be0','#9525d7'][grape%3],['#a854ff','#6c94ff','#d669ff'][grape++%3],x,y+.1,z,g);this.curve([[0,.9,0],[.05,1.15,0],[.22,1.14,0],[.24,1.03,0]],.025,green,g);this.leaf(-.19,1.04,0,-.4,g,1.25);this.sparkle(g,.24,.82,.19,.067);}
  if(level===3){this.candyBall(.48,'#ff641a','#ffba27',0,.49,0,g);this.stem(g,.92);this.face(g,.51,.456,.145);this.sparkle(g,-.24,.80,.258,.06);}
  if(level===4){const lemon=this.candyBall(.47,'#ffbb08','#fff22e',0,.43,0,g,[1.12,.86,.83]);lemon.rotation.z=-.19;this.ball(.085,'#ffc918',-.49,.52,0,g,[1,.7,.7]);this.ball(.07,'#ffc918',.49,.34,0,g,[1,.7,.7]);this.leaf(-.19,.83,-.03,-.3,g);this.face(g,.40,.397,.15);this.sparkle(g,.28,.65,.24,.05);}
  if(level===5){const pts=[[.01,.02],[.27,.06],[.43,.24],[.45,.43],[.34,.67],[.22,.86],[.19,1.02],[.08,1.1],[.01,1.1]].map(([r,y])=>new THREE.Vector2(r,y));this.candy(new THREE.LatheGeometry(pts,40),'#08bcae','#9aef57',g);this.stem(g,1.12);this.face(g,.43,.451,.135);this.sparkle(g,-.23,.72,.30,.07);this.sparkle(g,.28,.43,.36,.035);}
  if(level===6){for(const side of [-1,1])this.candyBall(.39,'#b74ce5',side<0?'#ff87ab':'#ffb48b',side*.12,.43,0,g,[1,1.13,1.13]);this.curve([[0,.81,.06],[0,.72,.32],[0,.48,.457],[0,.17,.32]],.013,'#cf4b9b',g);this.stem(g,.87);this.face(g,.43,.463,.17);this.sparkle(g,-.28,.69,.31,.06);}
  if(level===7){this.candyBall(.44,'#ff9113','#ffe156',0,.55,0,g,[.95,1.18,.9]);for(let row=0;row<6;row++){const y=.15+row*.15,r=.42*Math.sqrt(Math.max(.05,1-((y-.55)/.54)**2));for(let i=0;i<10;i++){const a=i*TAU/10+(row%2)*.31;const mark=this.box(.068,.068,.015,'#e5a023',Math.sin(a)*r,y,Math.cos(a)*r*.94,g,.013);mark.rotation.set(0,a,Math.PI/4);}}for(let i=0;i<9;i++){const a=i*2.4;this.curve([[0,.93,0],[Math.sin(a)*.15,1.27,Math.cos(a)*.15],[Math.sin(a)*.39,1.45+(i%3)*.05,Math.cos(a)*.39]],.052,i%2?'#16b7b3':'#47dfbf',g);}}
  if(level===8){const stripes=texture(512,256,(c,w,h)=>{const grad=c.createLinearGradient(0,0,0,h);grad.addColorStop(0,'#7dffd1');grad.addColorStop(1,'#24dacb');c.fillStyle=grad;c.fillRect(0,0,w,h);for(let i=0;i<10;i++){c.fillStyle=i%2?'#0e939f':'#2185bc';c.beginPath();for(let y=0;y<=h;y+=4){const x=i*w/10+Math.sin(y*.033+i)*4;y?c.lineTo(x,y):c.moveTo(x,y);}for(let y=h;y>=0;y-=4)c.lineTo(i*w/10+19+Math.sin(y*.033+i)*4,y);c.fill();}});this.ball(.49,new THREE.MeshPhysicalMaterial({map:stripes,roughness:.3,clearcoat:.7}),0,.49,0,g,[1.05,1,.96]);this.stem(g,.96);this.face(g,.46,.481,.145);this.sparkle(g,-.23,.77,.29,.07);this.sparkle(g,.30,.61,.36,.04);}
  if(level===9){
   const points=[[.01,.05],[.21,.06],[.38,.19],[.46,.43],[.45,.68],[.33,.83],[.18,.86],[.07,.79],[.01,.78]].map(([r,y])=>new THREE.Vector2(r,y));
   this.candy(new THREE.LatheGeometry(points,40),'#d50b64','#ff6558',g);
   this.curve([[0,.79,0],[.01,.96,0],[-.06,1.1,.015]],.036,'#875d56',g);
   this.leaf(.18,.99,0,-.25,g,1.35,'#25e1ba');this.face(g,.41,.44,.14);
   this.sparkle(g,-.24,.68,.31,.064);
  }
  if(level===10){
   this.candyBall(.43,'#5137b4','#9d8bff',0,.51,0,g,[.93,1.2,.94]);
   this.curve([[.10,.96,.10],[.17,.81,.29],[.20,.53,.365],[.12,.21,.27]],.014,'#b1a2ff',g);
   this.curve([[0,.98,0],[-.035,1.12,0],[.02,1.2,0]],.027,'#697984',g);
   this.leaf(.17,1.09,0,.1,g,1.1,'#6ee7db');this.face(g,.40,.406,.12,.87);
   this.sparkle(g,-.21,.79,.25,.059);
  }
  if(level===11){
   this.candyBall(.43,'#d52b98','#ff83c9',0,.52,0,g,[.94,1.18,.92]);
   const bract=new THREE.Shape();bract.moveTo(0,0);bract.bezierCurveTo(-.17,.12,-.13,.28,0,.46);bract.bezierCurveTo(.06,.28,.15,.13,0,0);
   const tip=new THREE.Shape();tip.moveTo(-.063,.29);tip.quadraticCurveTo(-.04,.36,0,.46);tip.quadraticCurveTo(.028,.37,.052,.29);tip.quadraticCurveTo(0,.33,-.063,.29);
   const tipMaterial=this.mat('#a0f270',.35);tipMaterial.side=THREE.DoubleSide;
   for(let row=0;row<3;row++)for(let i=0;i<6;i++){
    const angle=i*TAU/6+row*.48,y=.17+row*.24,r=[.28,.39,.32][row],leaf=new THREE.Group();
    leaf.rotation.set(.48,0,0);const holder=new THREE.Group();holder.rotation.y=angle;
    leaf.position.set(0,y,r);holder.add(leaf);g.add(holder);
    this.mesh(new THREE.ExtrudeGeometry(bract,{depth:.027,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.013,bevelThickness:.013}),row%2?'#ff519f':'#ed369d',leaf);
    const cap=this.mesh(new THREE.ExtrudeGeometry(tip,{depth:.065,bevelEnabled:false}),tipMaterial,leaf);cap.position.z=-.02;
   }
   this.sparkle(g,-.16,.74,.365,.06);this.sparkle(g,.15,.47,.42,.035);
  }
  this.batch(g);g.scale.setScalar(FRUITS[level].radius*2);return g;
 }
 pip(){const g=new THREE.Group(),body=new THREE.Group();g.add(body);const linen='#edcca0',green='#52a895';this.box(.55,.59,.39,'#daba8e',0,.62,0,body,.17);this.box(.72,.61,.53,linen,0,1.2,0,body,.22);
  for(const s of [-1,1]){this.ball(.095,linen,s*.37,1.2,0,body,[.6,1,.8]);this.ball(.049,'#574b40',s*.16,1.21,.268,body,[1,1,.36]);this.ball(.010,'#f8e4bd',s*.16-.008,1.221,.284,body);this.ball(.051,'#e5a48e',s*.24,1.11,.246,body,[1,.5,.15]);this.box(.19,.44,.22,linen,s*.36,.57,0,body,.09).rotation.z=s*.22;this.box(.22,.22,.31,'#b99268',s*.16,.19,.04,body,.08);}
  this.curve([[-.06,1.07,.276],[0,1.049,.282],[.06,1.07,.276]],.01,'#977454',body);for(let i=0;i<5;i++)this.box(.035,.01,.02,'#c59f71',.035,.99+i*.1,.279,body,.003);for(let i=0;i<3;i++)this.curve([[-.14+i*.13,1.5,-.06],[-.15+i*.13,1.55,0],[-.11+i*.13,1.49,.09]],.015,'#ae8b64',body);
  this.box(.61,.115,.45,green,0,.93,.02,body,.045).rotation.z=-.08;this.box(.18,.36,.055,green,.15,.74,.233,body,.04).rotation.z=.15;this.ball(.039,'#ba925a',-.09,.63,.20,body);this.ball(.039,'#ba925a',-.09,.47,.20,body);g.userData.body=body;return g;
 }
 basket(){const g=new THREE.Group();this.box(1.65,.61,1.0,'#d5aa72',0,.32,0,g,.19);this.box(1.7,.10,1.08,'#efcc98',0,.66,0,g,.05);this.box(1.46,.05,.87,'#bb8e58',0,.695,0,g,.14);for(let i=0;i<9;i++)this.box(.075,.5,1.015,'#ebc591',-.7+i*.175,.34,0,g,.02);for(const y of [.15,.3,.47])this.box(1.66,.035,1.015,'#bc915f',0,y,0,g,.012);this.curve([[-.68,.65,0],[-.61,1.6,0],[.6,1.6,0],[.68,.65,0]],.065,'#d8ae76',g);
  const cloth=this.box(1.15,.10,.7,'#eee7fa',0,.73,.13,g,.065);cloth.rotation.z=.03;for(const [level,x,z]of [[0,-.4,.16],[1,0,-.06],[2,.38,.1]]){const f=this.fruit(level);f.scale.multiplyScalar(.63);f.position.set(x,.76,z);g.add(f);}this.batch(g);return g;
 }
 plate(){const g=new THREE.Group();this.cyl(1.02,.87,.1,'#f7e8c7',0,.08,0,g);this.cyl(.9,.92,.08,'#fff8e9',0,.14,0,g);const ring=this.mesh(new THREE.TorusGeometry(.93,.043,12,64),'#edb094',g);ring.rotation.x=Math.PI/2;ring.position.y=.17;this.cyl(.64,.71,.02,'#f2e0bd',0,.185,0,g);for(let i=0;i<12;i++){const a=i*TAU/12;this.ball(.035,'#dba786',Math.cos(a)*.85,.19,Math.sin(a)*.85,g,[1,.3,1]);}this.batch(g);return g;}
 flower(color='#faaf91'){const g=new THREE.Group();this.curve([[0,0,0],[.02,.34,0],[0,.55,0]],.02,'#72ad6a',g);for(let i=0;i<5;i++){const a=i*TAU/5;this.ball(.105,color,Math.cos(a)*.12,.56,Math.sin(a)*.12,g,[1,.35,1]);}this.ball(.07,'#f7d565',0,.60,0,g,[1,.4,1]);this.leaf(.1,.24,0,0,g,.55);this.batch(g);return g;}
}
