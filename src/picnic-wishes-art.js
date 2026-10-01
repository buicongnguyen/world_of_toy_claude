import * as THREE from 'three';
import {PICNIC_ITEMS} from './picnic-game.js';

// Original shapes informed by real picnic cups, sandwiches, teapots and hampers.
// The bubble shell uses a lightweight rim shader rather than a full-screen blur.
export function makePicnicToy(m,level){
 const g=new THREE.Group();
 if(level<2){
  const key=`bubble-shell-${level}`;
  if(!m.materials.has(key))m.materials.set(key,new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{tint:{value:new THREE.Color(level?'#b59aff':'#62dcf5')}},vertexShader:'varying vec3 vNormal; varying vec3 vPosition; void main(){vec4 p=modelViewMatrix*vec4(position,1.0);vPosition=p.xyz;vNormal=normalize(normalMatrix*normal);gl_Position=projectionMatrix*p;}',fragmentShader:'uniform vec3 tint; varying vec3 vNormal; varying vec3 vPosition; void main(){float rim=pow(1.0-abs(dot(normalize(vNormal),normalize(-vPosition))),2.0);vec3 rainbow=mix(tint,vec3(1.0,.65,.86),smoothstep(-.4,.6,vNormal.x));gl_FragColor=vec4(mix(rainbow,vec3(1.0),rim*.45),.17+rim*.65);}'}));
  const shell=m.ball(.49,m.materials.get(key),0,.57,0,g);shell.castShadow=false;shell.receiveShadow=false;
  if(!m.materials.has('bubble-shine'))m.materials.set('bubble-shine',new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.9}));const shine=m.materials.get('bubble-shine');
  m.curve([[-.31,.81,.24],[-.26,.91,.24],[-.12,.98,.22]],.023,shine,g).castShadow=false;
  m.ball(.035,shine,.26,.84,.28,g).castShadow=false;
  if(!m.materials.has('wish-star'))m.materials.set('wish-star',new THREE.MeshBasicMaterial({color:'#ffd671'}));const star=m.sparkle(g,0,.68,.36,level?.15:.12);star.material=m.materials.get('wish-star');if(level)m.sparkle(g,-.25,.49,.36,.052);
  const glowKey=`bubble-glow-${level}`;if(!m.materials.has(glowKey))m.materials.set(glowKey,new THREE.MeshBasicMaterial({color:PICNIC_ITEMS[level].color,transparent:true,opacity:.16,depthWrite:false}));const glow=new THREE.Mesh(new THREE.CircleGeometry(.55,40),m.materials.get(glowKey));glow.rotation.x=-Math.PI/2;glow.position.y=.026;g.add(glow);
  m.face(g,.16,.40,.12,.72);
 }else if(level===2){
  // Tapered lemonade glass, lemon wheel, and a jaunty striped straw.
  m.cyl(.30,.24,.62,'#ffdb56',0,.38,0,g);m.cyl(.315,.315,.035,'#fff1b5',0,.71,0,g);m.cyl(.27,.27,.025,'#ffd240',0,.73,0,g);m.cyl(.255,.255,.035,'#a8ebe7',0,.06,0,g);
  m.curve([[.12,.5,-.02],[.16,1.10,-.03],[.32,1.2,-.03]],.03,'#eb76b0',g);for(const y of [.8,.9,1])m.cyl(.032,.032,.035,'#fff7f0',.12+(y-.5)*.067,y,-.02,g);
  const lemon=m.cyl(.15,.15,.045,'#ffbd1d',-.24,.76,0,g);lemon.rotation.x=Math.PI/2;const pulp=m.cyl(.12,.12,.049,'#fff0a1',-.24,.76,.002,g);pulp.rotation.x=Math.PI/2;
  m.face(g,.20,.31,.105,.75);m.sparkle(g,-.12,.52,.26,.045);
 }else if(level===3){
  // A thick triangular sandwich makes its layers legible from above.
  const triangle=(size,depth,color,y)=>{const s=new THREE.Shape();s.moveTo(-size/2,-size*.35);s.lineTo(size/2,-size*.35);s.lineTo(0,size*.48);s.closePath();const mesh=m.mesh(new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:true,bevelSize:.025,bevelThickness:.02,bevelSegments:2,steps:1}),color,g);mesh.rotation.x=-Math.PI/2;mesh.position.y=y;return mesh;};
  triangle(.95,.12,'#cd8c4c',.10);triangle(.91,.075,'#ffca42',.25);triangle(1,.045,'#56ce96',.34);triangle(.86,.055,'#f4718c',.42);triangle(.97,.13,'#d9a065',.51);triangle(.84,.014,'#fff0bd',.66);
  const face=m.face(g,.5,.08,.12,.9);face.position.set(0,.70,.07);face.rotation.x=-Math.PI/2;
  for(const [x,z]of [[-.20,-.15],[.12,-.19],[.26,-.10]])m.ball(.022,'#e4c68a',x,.702,z,g,[1,.3,1]);
 }else if(level===4){
  m.candyBall(.37,'#ad66df','#dfb1ff',0,.43,0,g,[1.1,.92,1]);m.cyl(.24,.29,.045,'#eed2ff',0,.76,0,g);m.ball(.063,'#ffcf67',0,.84,0,g);
  m.curve([[.29,.38,0],[.48,.45,0],[.56,.72,0]],.075,'#c994ed',g);const spout=m.cyl(.09,.085,.035,'#f4d8ff',.56,.73,0,g);spout.rotation.z=-.2;
  const handle=m.mesh(new THREE.TorusGeometry(.23,.057,10,30,Math.PI*1.8),'#b77ce1',g);handle.position.set(-.36,.49,0);handle.rotation.z=.3;
  m.face(g,.28,.363,.12,.85);m.sparkle(g,-.17,.59,.28,.055);
 }else{
  m.box(1.0,.52,.70,'#d99c59',0,.31,0,g,.13);m.box(1.04,.09,.74,'#f3c784',0,.59,0,g,.04);m.box(.86,.035,.58,'#a87646',0,.65,0,g,.06);
  for(let i=0;i<7;i++)m.box(.035,.39,.712,'#efc58a',-.42+i*.14,.30,0,g,.01);for(const y of [.19,.35,.46])m.box(1.01,.025,.72,'#c48948',0,y,0,g,.008);
  m.curve([[-.4,.6,0],[-.36,1.16,0],[.35,1.16,0],[.4,.6,0]],.047,'#ecb66c',g);
  m.box(.63,.04,.46,'#ff9dca',.05,.69,.05,g,.05);for(let i=0;i<4;i++)m.box(.055,.045,.47,'#ffe8f2',-.18+i*.14,.69,.05,g,.01);
  m.ball(.13,'#ff7187',-.21,.80,.08,g);m.leaf(-.16,.93,.08,0,g,.45);m.ball(.15,'#ffe15c',.24,.79,-.07,g);m.face(g,.16,.364,.14,.85);m.sparkle(g,.26,.46,.36,.055);
 }
 m.batch(g);if(level<2)g.traverse(o=>{if(o.isMesh)o.castShadow=false;});g.scale.setScalar(PICNIC_ITEMS[level].radius*2);return g;
}

export function makeBubbleJar(m){
 const g=new THREE.Group();m.cyl(.38,.31,.61,'#a18ce6',0,.34,0,g);m.cyl(.41,.41,.08,'#dac7ff',0,.66,0,g);m.cyl(.32,.32,.025,'#6c67a2',0,.71,0,g);m.face(g,.17,.34,.12,.75);m.sparkle(g,0,.52,.36,.075);
 for(let i=0;i<3;i++){const bubble=makePicnicToy(m,i===2?1:0);bubble.scale.setScalar(.20+i*.07);bubble.position.set((i-1)*.2,.72+i*.2,(i%2)*.08);g.add(bubble);}
 return g;
}
