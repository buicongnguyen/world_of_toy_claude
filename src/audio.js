// Original synthesized notes: no external audio, network calls, or licensed samples.
export class Soundscape {
  constructor(){this.enabled=false;this.context=null;this.timer=null;this.index=0;this.music=false;}
  setEnabled(value){this.enabled=value;if(value){this.context??=new (window.AudioContext||window.webkitAudioContext)();this.context.resume().catch(()=>{});this.start();}else{clearInterval(this.timer);this.timer=null;this.context?.suspend().catch(()=>{});}}
  tone(frequency,delay=0,length=.7,gain=.055){if(!this.enabled||!this.context)return;const t=this.context.currentTime+delay;const osc=this.context.createOscillator(),amp=this.context.createGain();osc.type='sine';osc.frequency.value=frequency;amp.gain.setValueAtTime(0,t);amp.gain.linearRampToValueAtTime(gain,t+.02);amp.gain.exponentialRampToValueAtTime(.0001,t+length);osc.connect(amp);amp.connect(this.context.destination);osc.start(t);osc.stop(t+length+.05);}
  discover(){[659.25,783.99,987.77].forEach((n,i)=>this.tone(n,i*.09,.6,.05));}
  restore(){[261.63,329.63,392,523.25,659.25].forEach((n,i)=>this.tone(n,i*.17,1.6,.055));}
  start(){if(this.timer)return;const notes=[523.25,659.25,783.99,659.25,587.33,493.88,392,0,440,523.25,659.25,587.33,523.25,392,329.63,0];this.timer=setInterval(()=>{if(document.hidden||!this.enabled)return;const n=notes[this.index++%notes.length];if(n){this.tone(n,0,2.1,this.music?.024:.012);if(this.index%4===0)this.tone(n/2,0,3,.014);}},1000);}
}
