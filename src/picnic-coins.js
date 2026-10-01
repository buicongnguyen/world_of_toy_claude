// Rewards are committed by the game immediately. This layer only animates the
// displayed balance, so saving, undo, and interrupted flights cannot lose coins.
let coinId=0;
export function coinIcon(size=34){
 const id=`joy-gold-${coinId++}`;
 return `<svg class="gold-coin" width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#fff7b0"/><stop offset=".32" stop-color="#ffe075"/><stop offset=".66" stop-color="#f5b731"/><stop offset="1" stop-color="#dc8c19"/></linearGradient></defs><circle cx="24" cy="26" r="20" fill="#bd7617"/><circle cx="24" cy="23" r="20" fill="url(#${id})" stroke="#e4a329" stroke-width="1.3"/><circle cx="24" cy="23" r="15.8" fill="none" stroke="#fff0a2" stroke-width="1.5"/><circle cx="24" cy="23" r="13.7" fill="none" stroke="#d99522" stroke-width=".8"/><path d="m24 10 2.2 4.3 4.8.7-3.5 3.4.8 4.8-4.3-2.3-4.3 2.3.8-4.8L17 15l4.8-.7Z" fill="#fff3b0" stroke="#daa02c" stroke-width=".7"/><g fill="#a25e20"><ellipse cx="18.5" cy="27" rx="1.5" ry="1.9"/><ellipse cx="29.5" cy="27" rx="1.5" ry="1.9"/></g><path d="M21 31q3 3 6 0" fill="none" stroke="#a25e20" stroke-width="1.4" stroke-linecap="round"/><g fill="#f49354" opacity=".65"><ellipse cx="15.5" cy="30" rx="2.2" ry="1.1"/><ellipse cx="32.5" cy="30" rx="2.2" ry="1.1"/></g><path d="M9 18q2-7 9-9" fill="none" stroke="#fffce0" stroke-width="2.5" stroke-linecap="round"/></svg>`;
}

export class PicnicCoins {
 constructor({layer,score,counter,origin,total,quiet,onCollect,format=value=>value.toLocaleString(),label=value=>`${format(value)} little joys earned`,icon=coinIcon}){
  Object.assign(this,{layer,score,counter,origin,total,quiet,onCollect,format,label,icon});this.flights=[];this.raf=0;this.shown=total();this.render();
 }
 render(){this.score.textContent=this.format(this.shown);this.counter.setAttribute('aria-label',this.label(this.shown));}
 settle(){cancelAnimationFrame(this.raf);this.raf=0;this.flights.forEach(f=>f.element.remove());this.flights=[];this.shown=this.total();this.render();this.pulse?.cancel();}
 award(point,amount,count=2){
  if(this.quiet()||document.hidden){this.settle();return;}
  // A bounded handful of coins represents the whole reward, even for a feast.
  const n=Math.min(9,Math.max(3,count+2)),start=this.origin(point),now=performance.now();
  for(let i=0;i<n;i++){
   const element=document.createElement('span');element.className='flying-coin';element.innerHTML=this.icon(34);element.style.opacity='0';this.layer.append(element);
   this.flights.push({element,start,at:now+i*65,fan:(i-(n-1)/2)*22,tilt:(i%2?1:-1)*(12+i*3),value:Math.floor(amount/n)+(i<amount%n?1:0)});
  }
  if(!this.raf)this.raf=requestAnimationFrame(now=>this.tick(now));
 }
 tick(now){
  this.raf=0;if(this.quiet()||document.hidden){this.settle();return;}
  const r=this.counter.querySelector('.gold-coin').getBoundingClientRect(),end={x:r.x+r.width/2,y:r.y+r.height/2};let arrived=false;
  for(let i=this.flights.length-1;i>=0;i--){
   const f=this.flights[i],t=(now-f.at)/1150;if(t<0)continue;
   if(t>=1){this.shown+=f.value;f.element.remove();this.flights.splice(i,1);arrived=true;continue;}
   let x,y,scale;
   const peak={x:f.start.x+f.fan,y:f.start.y-76-Math.abs(f.fan)*.2};
   if(t<.32){const u=1-(1-t/.32)**3;x=f.start.x+(peak.x-f.start.x)*u;y=f.start.y+(peak.y-f.start.y)*u;scale=.45+u*.65;}
   else{const u=((t-.32)/.68)**1.5,v=1-u,control={x:peak.x+(end.x-peak.x)*.28,y:Math.min(peak.y,end.y)-85};x=v*v*peak.x+2*v*u*control.x+u*u*end.x;y=v*v*peak.y+2*v*u*control.y+u*u*end.y;scale=1.1-u*.48;}
   f.element.style.opacity=String(Math.min(1,t*18));f.element.style.transform=`translate3d(${x-17}px,${y-17}px,0) rotate(${f.tilt*Math.sin(t*Math.PI)}deg) scale(${scale})`;
  }
  if(arrived){this.render();this.pulse?.cancel();this.pulse=this.counter.animate([{transform:'scale(1)',filter:'brightness(1)'},{transform:'scale(1.12)',filter:'brightness(1.15)',offset:.35},{transform:'scale(1)',filter:'brightness(1)'}],{duration:260,easing:'ease-out'});this.onCollect?.();}
  if(this.flights.length)this.raf=requestAnimationFrame(time=>this.tick(time));else{this.shown=this.total();this.render();}
 }
}
