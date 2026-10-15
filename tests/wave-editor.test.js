import test from 'node:test';
import assert from 'node:assert/strict';
import {WaveEditor,waveWindow,waveTime,preciseTime} from '../public/wave-editor.js';
import {peaks,CompareAudio} from '../public/audio.js';

test('zoomed waveform positions map to real seconds and clamp at both edges',()=>{
  const view=waveWindow(100,4,90);
  assert.deepEqual(view,{start:75,span:25});
  assert.equal(waveTime(.5,view,100),87.5);
  assert.equal(waveTime(-1,view,100),75);
  assert.equal(waveTime(2,view,100),100);
  assert.equal(preciseTime(59.9999),'01:00.000');
  assert.equal(preciseTime(12.345),'00:12.345');
});

test('waveform zoom samples the visible audio interval, including offset silence',()=>{
  const buffer={duration:4,sampleRate:2,getChannelData:()=>Float32Array.from([0,0,.2,.3,.6,.7,1,.8])};
  assert.deepEqual(peaks(buffer,2,0,1),[0,0]);
  assert.deepEqual(peaks(buffer,2,3,4),[1,Math.fround(.8)]);
  assert.deepEqual(peaks(buffer,2,-1,0),[0,0]);
});

test('bookmark pairs enable loop; invalid end preserves range; reset and rewind are distinct',async()=>{
  let time=10,warning='';
  const audio={range:{start:0,end:100},loop:false,duration:()=>100,time:()=>time,setRange:async(start,end)=>{audio.range={start,end};},setLoop:async value=>{audio.loop=value;},seek:async value=>{time=value;}};
  const editor=new WaveEditor({audio,ready:()=>true,select:()=>{},notify:text=>warning=text});editor.sync=()=>{};editor.draw=()=>{};
  await editor.action('mark-start');assert.equal(audio.loop,false);assert.deepEqual(editor.markers,{start:10,end:null});
  time=5;await editor.action('mark-end');assert.ok(warning);assert.equal(editor.markers.end,null);
  time=20.25;await editor.action('mark-end');assert.equal(audio.loop,true);assert.deepEqual(audio.range,{start:10,end:20.25});
  await editor.action('rewind');assert.equal(time,0);assert.equal(audio.loop,false);assert.equal(editor.markers.end,20.25);
  await editor.action('clear-range');assert.deepEqual(editor.markers,{start:null,end:null});assert.deepEqual(audio.range,{start:0,end:100});
  time=100;await editor.action('mark-start');assert.equal(editor.markers.start,null);
  time=0;await editor.action('mark-end');assert.equal(editor.markers.end,null);
});

test('loading another file clears old loop and uses the full duration',()=>{
  const audio=new CompareAudio();audio.pause=()=>{};audio.loop=true;audio.range={start:5,end:12};
  audio.setBuffers({duration:90},{duration:80});assert.equal(audio.loop,false);assert.deepEqual(audio.range,{start:0,end:80});
});
