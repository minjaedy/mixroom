import {peaks} from './audio.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export const preciseTime=t=>{
  const ms=Math.round(Math.max(0,t||0)*1000);
  return `${String(Math.floor(ms/60000)).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}.${String(ms%1000).padStart(3,'0')}`;
};
export function waveWindow(duration,zoom,start){
  const span=duration/Math.max(1,zoom);
  return {start:clamp(start,0,Math.max(0,duration-span)),span};
}
export function waveTime(fraction,view,duration){return clamp(view.start+clamp(fraction,0,1)*view.span,0,duration);}

export class WaveEditor{
  constructor({audio,ready,select,notify}){Object.assign(this,{audio,ready,select,notify});this.reset();}
  reset(){this.zoom=1;this.start=0;this.markers={start:null,end:null};this.scrub=null;}
  view(){return waveWindow(this.audio.duration(),this.zoom,this.start);}
  range(){this.markers={...this.audio.range};this.sync();}
  sync(){
    const view=this.view(),span=view.span||1;
    for(const wrap of document.querySelectorAll('.wave-wrap')){
      const selection=wrap.querySelector('.wave-selection');
      const left=clamp((this.audio.range.start-view.start)/span,0,1),right=clamp((this.audio.range.end-view.start)/span,0,1);
      selection.hidden=this.markers.start===null||this.markers.end===null;
      selection.style.left=100*left+'%';selection.style.width=100*Math.max(0,right-left)+'%';
      for(const side of ['start','end']){
        const marker=wrap.querySelector('.range-marker.'+side),time=this.markers[side],x=(time-view.start)/span;
        marker.hidden=time===null||x<0||x>1;marker.style.left=100*clamp(x,0,1)+'%';
        marker.title=(side==='start'?'시작 ':'끝 ')+preciseTime(time);
        const label=marker.querySelector('span');label.textContent=marker.title;label.style.left=x>.5?'auto':'4px';label.style.right=x>.5?'4px':'auto';
      }
    }
    for(const side of ['start','end']){
      const input=document.querySelector('#range-'+side);if(input&&document.activeElement!==input)input.value=this.audio.range[side].toFixed(3);
      const button=document.querySelector('[data-action="mark-'+side+'"]');if(button)button.classList.toggle('marked',this.markers[side]!==null);
    }
    const label=document.querySelector('#comment-range');if(label)label.textContent=preciseTime(this.audio.range.start)+' — '+preciseTime(this.audio.range.end);
    const loop=document.querySelector('[data-action="loop"]');if(loop){loop.classList.toggle('loop-active',this.audio.loop);loop.setAttribute('aria-pressed',String(this.audio.loop));}
    const status=document.querySelector('#range-status');if(status)status.textContent=this.markers.start===null&&this.markers.end===null?'재생선을 옮긴 뒤 시작점과 끝점을 찍으세요.':this.markers.end===null?'끝으로 이동해 끝점을 찍으세요.':this.markers.start===null?'시작으로 이동해 시작점을 찍으세요.':`${preciseTime(this.audio.range.start)} — ${preciseTime(this.audio.range.end)}`;
    this.tick(this.audio.time(),false);
  }
  tick(time,follow=true){
    let view=this.view();
    if(follow&&this.audio.playing&&!this.scrub&&(time<view.start||time>view.start+view.span)){
      this.start=waveWindow(this.audio.duration(),this.zoom,time-view.span*.15).start;this.draw();view=this.view();
    }
    for(const wrap of document.querySelectorAll('.wave-wrap')){
      const x=(time-view.start)/(view.span||1),head=wrap.querySelector('.playhead');head.hidden=x<0||x>1;head.style.left=100*clamp(x,0,1)+'%';
      const badge=wrap.querySelector('.playhead-time');badge.textContent=preciseTime(time);badge.style.left=`clamp(42px, ${100*clamp(x,0,1)}%, calc(100% - 42px))`;badge.hidden=head.hidden;
      wrap.setAttribute('aria-valuemax',String(this.audio.duration()));wrap.setAttribute('aria-valuenow',time.toFixed(3));wrap.setAttribute('aria-valuetext',preciseTime(time));
    }
    const timeLabel=document.querySelector('#time-current');if(timeLabel)timeLabel.textContent=preciseTime(time);
  }
  draw(){
    const view=this.view();this.start=view.start;
    for(const key of ['A','B']){
      const canvas=document.querySelector('#wave-'+key),buffer=this.audio.buffers[key];if(!canvas||!buffer||!canvas.clientWidth)continue;
      const width=canvas.clientWidth,height=canvas.clientHeight,dpr=devicePixelRatio||1;canvas.width=width*dpr;canvas.height=height*dpr;
      const context=canvas.getContext('2d');context.scale(dpr,dpr);
      const offset=key==='B'?this.audio.offset:0,values=peaks(buffer,Math.max(100,Math.floor(width/3)),view.start+offset,view.start+view.span+offset),max=Math.max(...values,.05);
      context.fillStyle=getComputedStyle(document.documentElement).getPropertyValue(key===this.audio.selected?'--wave-active':'--wave-idle').trim();
      values.forEach((value,i)=>{const h=Math.max(2,value/max*(height-10));context.fillRect(i*width/values.length,(height-h)/2,Math.max(1,width/values.length-1),h);});
      const track=canvas.closest('.track');track.querySelector('.wave-start').textContent=preciseTime(view.start);track.querySelector('.wave-duration').textContent=preciseTime(view.start+view.span);
    }
    const pan=document.querySelector('#wave-pan');if(pan){pan.max=String(Math.max(0,this.audio.duration()-view.span));pan.value=String(view.start);pan.disabled=this.zoom===1;}
    const zoom=document.querySelector('#wave-zoom');if(zoom)zoom.textContent=this.zoom+'×';
    for(const action of ['zoom-in','zoom-out']){const button=document.querySelector('[data-action="'+action+'"]');if(button)button.disabled=!this.ready()||(action==='zoom-in'?this.zoom>=256:this.zoom<=1);}
    this.sync();
  }
  async action(name){
    if(!['zoom-in','zoom-out','zoom-reset','rewind','mark-start','mark-end','clear-range'].includes(name))return false;
    if(!this.ready())return true;
    const audio=this.audio;
    if(name.startsWith('zoom-')){
      const old=this.view(),time=audio.time(),anchor=time>=old.start&&time<=old.start+old.span?time:old.start+old.span/2,fraction=(anchor-old.start)/(old.span||1);
      this.zoom=name==='zoom-reset'?1:clamp(this.zoom*(name==='zoom-in'?2:.5),1,256);
      this.start=waveWindow(audio.duration(),this.zoom,anchor-fraction*audio.duration()/this.zoom).start;this.draw();
    }else if(name==='rewind'){
      await audio.setLoop(false);await audio.seek(0);this.start=0;this.draw();
    }else if(name==='clear-range'){
      await audio.setLoop(false);await audio.setRange(0,audio.duration());this.markers={start:null,end:null};this.sync();
    }else{
      const side=name==='mark-start'?'start':'end',next={...this.markers,[side]:audio.time()};
      if((side==='start'&&next.start>audio.duration()-.05)||(side==='end'&&next.end<.05)){this.notify('반복할 수 있도록 음원 안에서 0.05초 이상 길이를 남겨 주세요.');return true;}
      if(next.start!==null&&next.end!==null&&next.end-next.start<.05){this.notify('끝점은 시작점보다 0.05초 이상 뒤에 찍어 주세요.');return true;}
      await audio.setLoop(false);this.markers=next;
      await audio.setRange(next.start??0,next.end??audio.duration());
      if(next.start!==null&&next.end!==null)await audio.setLoop(true);
      this.sync();
    }
    return true;
  }
  bind(){
    for(const track of document.querySelectorAll('.track')){
      const choose=()=>this.select(track.dataset.track);
      track.addEventListener('click',event=>{if(!event.target.closest('select,.wave-wrap'))choose();});
      track.addEventListener('keydown',event=>{if(event.target===track&&['Enter',' '].includes(event.key)){event.preventDefault();event.stopPropagation();choose();}});
    }
    for(const wrap of document.querySelectorAll('.wave-wrap')){
      const position=event=>waveTime((event.clientX-wrap.getBoundingClientRect().left)/wrap.clientWidth,this.view(),this.audio.duration());
      wrap.addEventListener('pointerdown',event=>{
        if(!this.ready()||event.button!==0||this.scrub)return;
        event.preventDefault();this.select(wrap.dataset.wave);wrap.focus({preventScroll:true});
        this.scrub={pointer:event.pointerId,playing:this.audio.playing};this.audio.pause();wrap.setPointerCapture(event.pointerId);
        void this.audio.seek(position(event));
      });
      wrap.addEventListener('pointermove',event=>{if(this.scrub?.pointer===event.pointerId)void this.audio.seek(position(event));});
      const finish=async event=>{
        if(this.scrub?.pointer!==event.pointerId)return;
        const resume=this.scrub.playing;this.scrub=null;
        if(wrap.hasPointerCapture(event.pointerId))wrap.releasePointerCapture(event.pointerId);
        if(resume)await this.audio.play();this.tick(this.audio.time());
      };
      for(const type of ['pointerup','pointercancel','lostpointercapture'])wrap.addEventListener(type,event=>{finish(event).catch(error=>this.notify(error.message));});
      wrap.addEventListener('keydown',event=>{
        if(!this.ready())return;
        if(['ArrowLeft','ArrowRight','Home'].includes(event.key)){
          event.preventDefault();const step=event.shiftKey ? .01 : this.zoom>1 ? .1 : 1;
          if(event.key==='Home')void this.action('rewind');else void this.audio.seek(this.audio.time()+(event.key==='ArrowLeft'?-step:step));
        }
      });
    }
    document.querySelector('#wave-pan')?.addEventListener('input',event=>{this.start=Number(event.target.value);this.draw();});
  }
}
