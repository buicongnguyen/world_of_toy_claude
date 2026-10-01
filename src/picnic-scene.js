import * as THREE from 'three';
import {ToyMaker,texture} from './picnic-art.js';
import {FRUITS,nextItemLevel,PLATE,BASKET,BUBBLE_JAR,allItems,itemInfo,family,catalogue,mergePlan,additionMergePlan,nextFruit,distance} from './picnic-game.js';
import {GRID,isChallenge,cellAt,cellPoint,challengePlan} from './picnic-challenge.js';
const TAU=Math.PI*2;
export class PicnicScene {
 constructor(canvas,state,callbacks){
  this.canvas=canvas;this.state=state;this.callbacks=callbacks;this.maker=new ToyMaker();this.fruits=new Map();this.particles=[];this.time=0;this.selection=null;this.drag=null;this.paused=false;this.frame={width:14,depth:9.8};this.targetIds=new Set();this.groupRings=[];this.pipBounce=0;
  this.touchDevice=matchMedia('(pointer: coarse)').matches;
  this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#f7eee3');this.camera=new THREE.OrthographicCamera(-9,9,6,-6,.1,100);this.camera.position.set(0,16,10);this.camera.lookAt(0,0,0);
  this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:!this.touchDevice});this.renderer.setPixelRatio(Math.min(devicePixelRatio,this.touchDevice?1.25:1.6));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.07;
  this.scene.add(new THREE.HemisphereLight('#fff5e2','#d8c5bb',1.8));const sun=new THREE.DirectionalLight('#fff0cf',2.3);sun.position.set(-5,13,9);sun.castShadow=true;const shadowSize=this.touchDevice?1024:2048;sun.shadow.mapSize.set(shadowSize,shadowSize);Object.assign(sun.shadow.camera,{left:-10,right:10,top:10,bottom:-10,near:.1,far:40});sun.shadow.normalBias=.035;sun.shadow.bias=-.0002;sun.shadow.radius=4;this.scene.add(sun);const fill=new THREE.DirectionalLight('#ddeafa',1.0);fill.position.set(6,6,-4);this.scene.add(fill);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({opacity:.11}));ground.rotation.x=-Math.PI/2;ground.position.y=-.46;ground.receiveShadow=true;this.scene.add(ground);
  this.board=new THREE.Group();this.scene.add(this.board);this.props=new THREE.Group();this.scene.add(this.props);
  this.basket=this.maker.basket();this.props.add(this.basket);this.jar=this.maker.bubbleJar();this.props.add(this.jar);this.plate=this.maker.plate();this.props.add(this.plate);this.pip=this.maker.pip();this.pip.rotation.y=-.19;this.props.add(this.pip);
  this.gifts=[];this.makeGifts();this.harvest=[];if(isChallenge(state))for(let i=0;i<2;i++){const melon=this.maker.fruit(8);melon.scale.setScalar(.54);this.harvest.push(melon);this.props.add(melon);}
  this.raycaster=new THREE.Raycaster();this.pointer=new THREE.Vector2();this.plane=new THREE.Plane(new THREE.Vector3(0,1,0),-.09);
  this.ring=new THREE.Mesh(new THREE.RingGeometry(.86,.93,64),new THREE.MeshBasicMaterial({color:'#ffde77',transparent:true,opacity:.95,side:THREE.DoubleSide,depthWrite:false}));this.ring.rotation.x=-Math.PI/2;this.ring.position.y=.115;this.ring.visible=false;this.scene.add(this.ring);
  this.reachRing=new THREE.Mesh(new THREE.RingGeometry(.985,1,80),new THREE.MeshBasicMaterial({color:'#b5a368',transparent:true,opacity:.5,side:THREE.DoubleSide,depthWrite:false}));this.reachRing.rotation.x=-Math.PI/2;this.reachRing.visible=false;this.scene.add(this.reachRing);
  const landingTexture=texture(128,128,(c,w,h)=>{const glow=c.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);glow.addColorStop(0,'rgba(255,255,255,.55)');glow.addColorStop(.68,'rgba(255,255,255,.28)');glow.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=glow;c.fillRect(0,0,w,h);});
  this.cellGlow=new THREE.Mesh(new THREE.CircleGeometry(.5,64),new THREE.MeshBasicMaterial({map:landingTexture,color:'#e7ba57',transparent:true,opacity:.8,depthWrite:false,side:THREE.DoubleSide}));this.cellGlow.rotation.x=-Math.PI/2;this.cellGlow.visible=false;this.scene.add(this.cellGlow);
  this.landingRim=new THREE.Mesh(new THREE.RingGeometry(.425,.44,64),new THREE.MeshBasicMaterial({color:'#d3ad59',transparent:true,opacity:.7,depthWrite:false,side:THREE.DoubleSide}));this.landingRim.rotation.x=-Math.PI/2;this.landingRim.visible=false;this.scene.add(this.landingRim);
  this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas.parentElement);this.resize();this.sync(true);
  // Source labels live outside the canvas. WebKit may retain them as the
  // release target despite capture, so track the active pointer at window level.
  canvas.addEventListener('pointerdown',e=>this.down(e));window.addEventListener('pointermove',e=>this.move(e),{passive:false});window.addEventListener('pointerup',e=>this.up(e));window.addEventListener('pointercancel',e=>{if(this.drag?.pointerId===e.pointerId)this.cancel();});canvas.addEventListener('lostpointercapture',e=>{if(this.drag?.pointerId===e.pointerId)this.cancel();});canvas.addEventListener('contextmenu',e=>e.preventDefault());canvas.addEventListener('keydown',e=>this.key(e));window.addEventListener('blur',()=>this.cancel());
  this.last=performance.now();this.raf=requestAnimationFrame(t=>this.animate(t));
 }
 world(p,y=.1){return new THREE.Vector3((p.x-.5)*this.frame.width,y,(p.y-.5)*this.frame.depth);}
 normalized(v){return{x:v.x/this.frame.width+.5,y:v.z/this.frame.depth+.5};}
 project(p,height=.1){const q=this.world(p,height).project(this.camera);return{x:(q.x*.5+.5)*this.canvas.clientWidth,y:(-.5*q.y+.5)*this.canvas.clientHeight};}
 buildBoard(){this.disposeGroup(this.board);this.board.scale.set(1,1,1);const m=this.maker,w=this.frame.width,d=this.frame.depth;this.boardBaseDepth=d;
  m.box(w+.28,.25,d+.25,'#d8b897',0,-.23,0,this.board,.4);m.box(w+.13,.12,d+.12,'#f5d9bc',0,-.065,0,this.board,.4);
  const mat=texture(1024,1024,(c,W,H)=>{const linen=c.createLinearGradient(0,0,W,H);linen.addColorStop(0,'#e7eed5');linen.addColorStop(.55,'#e1eacc');linen.addColorStop(1,'#dbe5c3');c.fillStyle=linen;c.fillRect(0,0,W,H);
   // Fine woven threads keep the surface tactile without a checkerboard.
   c.fillStyle='#fff9e619';for(let y=0;y<H;y+=4)c.fillRect(0,y,W,1);c.fillStyle='#899b7310';for(let x=0;x<W;x+=5)c.fillRect(x,0,1,H);
  });
  const matMesh=m.box(w,.08,d,new THREE.MeshStandardMaterial({map:mat,roughness:1}),0,.04,0,this.board,.4);matMesh.castShadow=false;
  for(const sign of [-1,1]){for(let x=-w/2+.35;x<w/2-.35;x+=.23)m.box(.1,.014,.025,'#fbf7df',x,.092,sign*(d/2-.18),this.board,.006);for(let z=-d/2+.35;z<d/2-.35;z+=.23)m.box(.025,.014,.10,'#fbf7df',sign*(w/2-.18),.092,z,this.board,.006);}
  // A scalloped linen runner makes the basket and plate part of the toy world.
  const runner=m.box(w-.4,.026,d*.22,'#fbf1df',0,.098,d*.375,this.board,.2);runner.receiveShadow=true;
  for(let i=0;i<6;i++){const star=this.maker.flower(i%2?'#f6bdaf':'#f9e4a0');star.scale.setScalar(.30);star.position.set(-w/2+.36+(i%2)*.08,.11,-d/2+.47+i*.36);this.board.add(star);}
  m.batch(this.board);
 }
 makeGifts(){
  const flower=new THREE.Group();this.maker.cyl(.19,.15,.35,'#f1a697',0,.19,0,flower);for(const [x,z,c]of [[-.10,0,'#ffbe90'],[.08,.04,'#f6b4cb'],[0,-.09,'#fff1b6']]){const f=this.maker.flower(c);f.position.set(x,.28,z);flower.add(f);}this.gifts.push(flower);
  const tea=new THREE.Group();this.maker.cyl(.27,.22,.34,'#91c9cd',0,.2,0,tea);this.maker.cyl(.22,.22,.015,'#deb679',0,.38,0,tea);const handle=this.maker.mesh(new THREE.TorusGeometry(.14,.045,8,24),'#91c9cd',tea);handle.position.set(.27,.22,0);this.gifts.push(tea);
  const blooms=new THREE.Group();for(let i=0;i<9;i++){const f=this.maker.flower(['#ec9cb8','#ffce70','#bdabed'][i%3]);f.position.set((i%3-.9)*.35,0,Math.floor(i/3)*.28);blooms.add(f);}this.gifts.push(blooms);this.gifts.forEach(g=>this.props.add(g));
 }
 layout(){this.basket.position.copy(this.world(BASKET));this.jar.position.copy(this.world(BUBBLE_JAR));this.jar.visible=!isChallenge(this.state);this.plate.position.copy(this.world(PLATE));this.pip.position.copy(this.world(this.state.pip));const mobile=this.frame.width<10;this.basket.scale.setScalar(mobile?.75:1);this.jar.scale.setScalar(mobile?.85:1);this.plate.scale.setScalar(mobile?.86:1);this.pip.scale.setScalar(mobile?.84:1);for(const [i,p]of [{x:.52,y:.94},{x:.55,y:.81},{x:.93,y:.76}].entries())this.gifts[i].position.copy(this.world(p));this.gifts[2].scale.setScalar(mobile?.55:.8);this.harvest.forEach((melon,i)=>{melon.position.copy(this.world({x:PLATE.x+(i? .032:-.032),y:PLATE.y},.29));melon.visible=i<this.state.challenge.harvested;});}
 fruitScale(fruit){return isChallenge(this.state)?Math.min(itemInfo(fruit).radius*2,Math.min(this.frame.width*GRID.width/GRID.cols,this.frame.depth*GRID.height/GRID.rows)*.74):itemInfo(fruit).radius*2;}
 resize(){const w=this.canvas.clientWidth,h=this.canvas.clientHeight;if(!w||!h)return;const mobile=w<700,landscape=w/h>1.6&&h<430&&!isChallenge(this.state);const previous={...this.frame};this.frame=landscape?{width:14,depth:6.4}:mobile?{width:7.4,depth:Math.min(11.8,Math.max(8.8,h/w*7.4*1.02))}:{width:14,depth:9.8};if(previous.width!==this.frame.width||!this.board.children.length)this.buildBoard();else this.board.scale.z=this.frame.depth/this.boardBaseDepth;this.renderer.setSize(w,h,false);const aspect=w/h;const span=Math.max(this.frame.depth*.89+1.25,(this.frame.width+.9)/aspect);this.camera.left=-span*aspect/2;this.camera.right=span*aspect/2;this.camera.top=span/2;this.camera.bottom=-span/2;this.camera.updateProjectionMatrix();this.layout();for(const f of allItems(this.state)){const mesh=this.fruits.get(f.id);if(mesh)mesh.position.copy(this.world(f));}this.cancel();this.callbacks.onResize?.();}
 sync(initial=false){const ids=new Set(allItems(this.state).map(f=>f.id));for(const [id,g]of this.fruits)if(!ids.has(id)){this.scene.remove(g);this.disposeGroup(g);this.fruits.delete(id);}for(const f of allItems(this.state)){if(!this.fruits.has(f.id)){const g=family(f)==='picnic'?this.maker.picnic(f.level):this.maker.fruit(f.level);g.position.copy(this.world(f));g.rotation.y=((f.id*17)%13-6)*.035;g.userData={fruitId:f.id,level:f.level,baseScale:itemInfo(f).radius*2,born:initial?-10:this.time};this.fruits.set(f.id,g);this.scene.add(g);}}
  for(let i=0;i<this.gifts.length;i++)this.gifts[i].visible=this.state.kindness>=[3,8,15][i];this.layout();
 }
 disposeGroup(group){const textured=new Set();group.traverse(o=>{if(o.isMesh){o.geometry?.dispose();if(o.material?.map)textured.add(o.material);}});for(const material of textured){material.map.dispose();material.dispose();}for(const c of [...group.children])group.remove(c);}
 pointerPoint(e){const r=this.canvas.getBoundingClientRect();this.pointer.set((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2);this.raycaster.setFromCamera(this.pointer,this.camera);const v=new THREE.Vector3();this.raycaster.ray.intersectPlane(this.plane,v);return this.normalized(v);}
 hit(e){this.pointerPoint(e);const objects=[...this.fruits.values(),this.basket,...(this.jar.visible?[this.jar]:[]),this.pip,this.plate];const hits=this.raycaster.intersectObjects(objects,true);if(hits.length){let obj=hits[0].object;while(obj.parent&&!objects.includes(obj))obj=obj.parent;if(obj===this.basket)return{type:'basket'};if(obj===this.jar)return{type:'jar'};if(obj===this.pip)return{type:'pip'};if(obj===this.plate)return{type:'plate'};if(obj.userData.fruitId)return{type:'fruit',id:obj.userData.fruitId};}
  // A forgiving touch target without changing the actual fruit shapes.
  const rect=this.canvas.getBoundingClientRect(),px=e.clientX-rect.x,py=e.clientY-rect.y;
  let nearest=null;for(const f of allItems(this.state)){const p=this.project(f,.6);const dist=Math.hypot(px-p.x,py-p.y);if(dist<(e.pointerType==='touch'?30:25)&&(!nearest||dist<nearest.dist))nearest={type:'fruit',id:f.id,dist};}return nearest??{type:'floor'};
 }
 start(type,id,e,point,fromSelection=false){if(this.paused||this.drag)return;if(isChallenge(this.state)){if(type==='basket'||type==='jar'){this.callbacks.onAdd?.();return;}if(this.state.challenge.status==='won'){this.callbacks.onHint?.('Two watermelons! Picnic complete. Play again or undo.');return;}}const current=type==='fruit'?allItems(this.state).find(f=>f.id===id):type==='pip'?this.state.pip:type==='jar'?BUBBLE_JAR:BASKET;if(!current)return;const hitPoint=this.pointerPoint(e);this.selection={type,id,point:{x:current.x,y:current.y}};this.drag={pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,moved:false,fromSelection,offset:fromSelection||type==='basket'||type==='jar'?{x:0,y:0}:{x:current.x-hitPoint.x,y:current.y-hitPoint.y}};if(fromSelection)this.selection.point=point;this.canvas.setPointerCapture(e.pointerId);this.canvas.focus({preventScroll:true});this.canvas.classList.add('grabbing');
  if(type==='basket'||type==='jar'){this.preview=type==='jar'?this.maker.picnic(0):this.maker.fruit(nextFruit(this.state));this.preview.position.copy(this.world(type==='jar'?BUBBLE_JAR:BASKET,.9));this.scene.add(this.preview);}
  this.callbacks.onPick?.(type,id);this.updatePreview();
 }
 down(e){if(this.paused||this.drag||e.button!==0||e.isPrimary===false)return;e.preventDefault();const point=this.pointerPoint(e),hit=this.hit(e);
  if(this.selection){if(hit.type==='fruit'&&hit.id===this.selection.id){this.cancel();return;}const old=this.selection;this.start(old.type,old.id,e,point,true);return;}
  if(['fruit','basket','jar','pip'].includes(hit.type))this.start(hit.type,hit.id,e,point);else if(hit.type==='plate')this.callbacks.onHint?.('Drag a fruit or picnic treasure onto this plate to share it with Pip.');
 }
 startBasket(e){if(e.isPrimary===false||this.drag||this.paused)return;e.preventDefault();this.cancel();this.start('basket',null,e,this.pointerPoint(e));}
 startJar(e){if(e.isPrimary===false||this.drag||this.paused)return;e.preventDefault();this.cancel();this.start('jar',null,e,this.pointerPoint(e));}
 move(e){if(!this.drag||this.drag.pointerId!==e.pointerId)return;e.preventDefault();const p=this.pointerPoint(e);this.drag.moved ||=Math.hypot(e.clientX-this.drag.startX,e.clientY-this.drag.startY)>5;this.selection.point={x:p.x+this.drag.offset.x,y:p.y+this.drag.offset.y};this.updatePreview();}
 up(e){if(!this.drag||this.drag.pointerId!==e.pointerId)return;this.move(e);const{moved,fromSelection}=this.drag;const selected=this.selection;this.drag=null;this.canvas.classList.remove('grabbing');if(this.canvas.hasPointerCapture(e.pointerId))this.canvas.releasePointerCapture(e.pointerId);
  if(selected.type==='fruit'&&!moved&&!fromSelection){this.callbacks.onHint?.(`${itemInfo(allItems(this.state).find(f=>f.id===selected.id)).name} picked up. Tap a matching toy or a new spot.`);return;}
  const point=!moved&&selected.type==='basket'?{x:.18,y:.66}:!moved&&selected.type==='jar'?{x:.43,y:.65}:selected.point;this.selection=null;this.hideHighlights();this.clearPreview();this.callbacks.onPreview?.(null);if(selected.type==='basket')this.callbacks.onAdd?.(point,moved);else if(selected.type==='jar')this.callbacks.onBubble?.(point,moved);else if(selected.type==='pip')this.callbacks.onPip?.(point);else this.callbacks.onDrop?.(selected.id,point);this.sync();
 }
 updatePreview(){if(!this.selection)return;if(isChallenge(this.state)){this.gridPreview();return;}const s=this.selection;let target=null;if(s.type==='fruit'){
   if(distance(s.point,PLATE,this.frame)<1.03)target={type:'share',point:PLATE};else{const plan=mergePlan(this.state,s.id,s.point,this.frame);if(plan?.position)target={type:'merge',point:plan.position,...plan};}
  }else if((s.type==='basket'||s.type==='jar')&&this.drag?.moved){const plan=additionMergePlan(this.state,s.point,this.frame,s.type==='jar'?'picnic':'fruit');if(plan?.position)target={type:'merge',point:plan.position,...plan};}
  this.hideHighlights();
  const held=s.type==='jar'?{kind:'picnic',level:0}:s.type==='basket'?{level:nextFruit(this.state)}:s.type==='fruit'?allItems(this.state).find(f=>f.id===s.id):null;
  if(held&&nextItemLevel(held)!==null&&target?.type!=='share'){
    this.reachRing.visible=true;this.reachRing.position.copy(this.world(s.point,.113));this.reachRing.scale.setScalar(itemInfo(held).radius*2+.16);
  }
  if(target?.type==='share'){
    this.ring.visible=true;this.ring.position.copy(this.world(PLATE,.118));this.ring.scale.setScalar(1.04/.9);this.ring.material.color.set('#f3a095');
  }else if(target?.type==='merge'){
    this.targetIds=new Set(target.removed);
    for(let i=0;i<target.members.length;i++){
      if(!this.groupRings[i]){const ring=this.ring.clone();ring.material=new THREE.MeshBasicMaterial({color:'#ffbf39',transparent:true,opacity:.95,side:THREE.DoubleSide,depthWrite:false});this.scene.add(ring);this.groupRings.push(ring);}
      const ring=this.groupRings[i];ring.visible=true;ring.position.copy(this.world(target.members[i],.118));ring.scale.setScalar((itemInfo(target.members[i]).radius+.19)/.9);
    }
  }
  this.callbacks.onPreview?.(target);
 }
 gridPreview(){this.hideHighlights();const s=this.selection;if(s.type!=='fruit'){this.callbacks.onPreview?.(null);return;}const f=this.state.fruits.find(f=>f.id===s.id);if(!f)return;let target=null;
  if(distance(s.point,PLATE,this.frame)<.82){target={type:'share',point:PLATE};this.ring.visible=true;this.ring.position.copy(this.world(PLATE,.14));this.ring.scale.setScalar(.9);this.ring.material.color.set('#f3a095');}
  else{const cell=cellAt(s.point);if(cell!==null&&cell!==f.cell){const plan=challengePlan(this.state,s.id,s.point),point=cellPoint(cell),blocked=!plan&&this.state.fruits.some(fruit=>fruit.id!==s.id&&fruit.cell===cell);target=plan?{type:'merge',point,...plan}:{type:blocked?'blocked':'move',point};this.cellGlow.visible=true;this.cellGlow.position.copy(this.world(point,.14));const landingSize=Math.min(this.frame.width*GRID.width/GRID.cols,this.frame.depth*GRID.height/GRID.rows)*.94;this.cellGlow.scale.set(landingSize,landingSize,1);this.landingRim.visible=true;this.landingRim.position.copy(this.cellGlow.position);this.landingRim.scale.copy(this.cellGlow.scale);this.landingRim.material.color.set(blocked?'#c9827b':'#d3ad59');this.cellGlow.material.color.set(blocked?'#e49691':'#eac569');if(plan){this.targetIds=new Set(plan.removed);for(let i=0;i<plan.members.length;i++){if(!this.groupRings[i]){const ring=this.ring.clone();ring.material=this.ring.material.clone();this.scene.add(ring);this.groupRings.push(ring);}const ring=this.groupRings[i];ring.visible=true;ring.material.color.set('#e6b13d');ring.position.copy(this.world(plan.members[i],.15));ring.scale.setScalar(this.fruitScale(plan.members[i])*.7);}}}}
  this.callbacks.onPreview?.(target);
 }
 hideHighlights(){this.ring.visible=false;this.reachRing.visible=false;if(this.cellGlow)this.cellGlow.visible=false;if(this.landingRim)this.landingRim.visible=false;this.targetIds.clear();this.groupRings.forEach(r=>r.visible=false);}
 clearPreview(){if(this.preview){this.scene.remove(this.preview);this.disposeGroup(this.preview);this.preview=null;}}
 cancel(){const pointerId=this.drag?.pointerId;this.drag=null;this.selection=null;this.hideHighlights();this.clearPreview();this.canvas.classList.remove('grabbing');if(pointerId!==undefined&&this.canvas.hasPointerCapture(pointerId))this.canvas.releasePointerCapture(pointerId);this.callbacks.onPreview?.(null);}
 key(e){if(this.paused)return;const k=e.key.toLowerCase();if(k==='escape'){this.cancel();return;}if(k==='u'){e.preventDefault();this.callbacks.onUndo?.();return;}if(isChallenge(this.state)&&this.state.challenge.status==='won')return;if(k==='b'){e.preventDefault();this.callbacks.onAdd?.({x:.18,y:.65});return;}
  if(k==='j'){e.preventDefault();this.callbacks.onBubble?.({x:.43,y:.65});return;}
  if(k==='t'&&isChallenge(this.state)&&this.selection?.type==='fruit'){e.preventDefault();const id=this.selection.id;this.cancel();this.callbacks.onDrop?.(id,PLATE);return;}
  if(k==='n'||(k==='enter'&&!this.selection)){e.preventDefault();const i=allItems(this.state).findIndex(f=>f.id===this.selection?.id),f=allItems(this.state)[(i+1)%allItems(this.state).length];if(f){this.selection={type:'fruit',id:f.id,point:{x:f.x,y:f.y}};this.callbacks.onPick?.('fruit',f.id);this.callbacks.onHint?.(`${itemInfo(f).name} picked up. Arrow keys move; Enter places.`);}return;}
  if(this.selection&&['arrowleft','arrowright','arrowup','arrowdown'].includes(k)){e.preventDefault();if(isChallenge(this.state)){const cell=cellAt(this.selection.point),col=cell===null?0:cell%GRID.cols,row=cell===null?0:Math.floor(cell/GRID.cols);this.selection.point=cellPoint(Math.max(0,Math.min(GRID.rows-1,row+(k==='arrowdown'?1:k==='arrowup'?-1:0)))*GRID.cols+Math.max(0,Math.min(GRID.cols-1,col+(k==='arrowright'?1:k==='arrowleft'?-1:0))));}else{const step=e.shiftKey?.7:.22;this.selection.point.x+=(k==='arrowright'?step:k==='arrowleft'?-step:0)/this.frame.width;this.selection.point.y+=(k==='arrowdown'?step:k==='arrowup'?-step:0)/this.frame.depth;}this.updatePreview();}
  if(k==='enter'&&this.selection){e.preventDefault();const s=this.selection;this.cancel();this.callbacks.onDrop?.(s.id,s.point);}
 }
 react(feast=false){this.pipBounce=feast?2:1;}
 releaseBasket(items){items.forEach((f,i)=>{const mesh=this.fruits.get(f.id);if(mesh)mesh.userData.delivery={start:this.time+i*.12};});this.basketBounce=this.time+1;}
 burst(point,color='#ffce64',amount=20){if(this.state.reducedMotion)return;if(this.touchDevice)amount=Math.min(amount,28);for(let i=0;i<amount;i++){const mat=new THREE.MeshBasicMaterial({color:i%3?color:['#fff2c2','#f2a1c4','#9bca85'][i%3],transparent:true});const mesh=new THREE.Mesh(i%2?new THREE.SphereGeometry(.025,8,6):new THREE.BoxGeometry(.055,.022,.055),mat);mesh.position.copy(this.world(point,.4));this.scene.add(mesh);this.particles.push({mesh,life:1.1+Math.random()*.4,vx:(Math.random()-.5)*3,vy:1.4+Math.random()*2,vz:(Math.random()-.5)*3});}}
 animate(now){this.raf=requestAnimationFrame(t=>this.animate(t));const dt=Math.min((now-this.last)/1000,.04);this.last=now;if(document.hidden)return;this.time+=dt;const t=this.time,quiet=this.state.reducedMotion;
  for(const f of allItems(this.state)){const g=this.fruits.get(f.id);if(!g)continue;const picked=this.selection?.type==='fruit'&&this.selection.id===f.id;const point=picked?this.selection.point:f;const bob=!quiet&&family(f)==='picnic'&&f.level<2?Math.sin(t*2+f.id)*.045:0;const target=this.world(point,picked?.85:.1+bob);if(g.userData.delivery&&!quiet&&!picked){const progress=Math.max(0,Math.min(1,(t-g.userData.delivery.start)/.65)),from=this.world(BASKET,.9);g.position.copy(from.lerp(target,progress));g.position.y+=Math.sin(progress*Math.PI)*1.6;if(progress===1)delete g.userData.delivery;}else{delete g.userData.delivery;g.position.lerp(target,Math.min(1,dt*(picked?23:15)));}const age=t-g.userData.born;const pop=quiet?1:age<.36?1+Math.sin(age/.36*Math.PI)*.23:1;g.scale.setScalar(this.fruitScale(f)*pop*(picked?1.08:1));g.rotation.z=quiet?0:picked?Math.sin(t*5)*.045:this.targetIds.has(f.id)?Math.sin(t*10)*.035:0;}
  this.basket.rotation.z=!quiet&&this.basketBounce>t?Math.sin((this.basketBounce-t)*18)*.055:0;
  if(this.preview&&this.selection){this.preview.position.lerp(this.world(this.selection.point,.85),Math.min(1,dt*25));}
  const pipPoint=this.selection?.type==='pip'?this.selection.point:this.state.pip;this.pip.position.lerp(this.world(pipPoint,this.selection?.type==='pip'?.8:.1),Math.min(1,dt*20));this.pipBounce=Math.max(0,this.pipBounce-dt);this.pip.userData.body.position.y=quiet?0:this.pipBounce>0?Math.abs(Math.sin(this.pipBounce*13))*.18:Math.sin(t*2)*.012;
  for(let i=this.particles.length-1;i>=0;i--){const p=this.particles[i];p.life-=dt;if(p.life<=0){this.scene.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose();this.particles.splice(i,1);continue;}p.mesh.position.x+=p.vx*dt;p.mesh.position.y+=p.vy*dt;p.mesh.position.z+=p.vz*dt;p.vy-=5*dt;p.mesh.rotation.z+=dt*3;p.mesh.material.opacity=Math.min(1,p.life*2);}
  this.renderer.render(this.scene,this.camera);this.callbacks.onFrame?.();
 }
 photo(){this.renderer.render(this.scene,this.camera);return this.canvas.toDataURL('image/png');}
}
