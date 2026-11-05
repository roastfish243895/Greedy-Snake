/* Eat SFX: one "pop" per bite, sampled from a locally supplied reference clip. Everything is
   local — the sample is embedded as base64 (file:// cannot fetch a sibling audio file), and the
   synthesised pop stays only as a fallback if decoding ever fails. */
(function(){
 'use strict';
 const STORE_KEY='fishSnakeV2.sound',BASE_HZ=520,POP=.11;
 const SAMPLE_SRC=window.FISH_POP_SAMPLE||'',SAMPLE_GAIN=.38;
 let ctx=null,master=null,noise=null,plays=0,contextFactory=null,sampleBuffer=null,sampleState='idle';

 function readPref(){try{const v=localStorage.getItem(STORE_KEY);return v===null?true:v==='on';}catch(error){return true;}}
 function writePref(){try{localStorage.setItem(STORE_KEY,enabled?'on':'off');}catch(error){}}
 let enabled=readPref();

 function ensure(){
  if(ctx)return ctx;
  const AC=window.AudioContext||window.webkitAudioContext;
  try{
   const audio=contextFactory?contextFactory():(AC?new AC():null);
   if(!audio)return null;
   master=audio.createGain();master.gain.value=.9;master.connect(audio.destination);
   // One short decaying noise burst is enough to give every pop its "wet" crack.
   const len=Math.floor(audio.sampleRate*.05),buffer=audio.createBuffer(1,len,audio.sampleRate),data=buffer.getChannelData(0);
   for(let i=0;i<len;i++){const decay=1-i/len;data[i]=(Math.random()*2-1)*decay*decay;}
   noise=buffer;ctx=audio;
  }catch(error){ctx=null;master=null;noise=null;return null;}
  return ctx;
 }
 function decodeSample(audio){
  if(sampleState!=='idle')return;
  if(!SAMPLE_SRC||!audio||!audio.decodeAudioData){sampleState='failed';return;}
  sampleState='decoding';
  let settled=false;
  const done=buffer=>{if(settled)return;settled=true;sampleBuffer=buffer;sampleState='ready';};
  const fail=()=>{if(settled)return;settled=true;sampleState='failed';};
  try{
   const binary=atob(SAMPLE_SRC),bytes=new Uint8Array(binary.length);
   for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
   const result=audio.decodeAudioData(bytes.buffer,done,fail);
   if(result&&typeof result.then==='function')result.then(done,fail);
  }catch(error){fail();}
 }
 function unlock(){
  const audio=ensure();if(!audio)return false;
  decodeSample(audio);
  if(canResume(audio))audio.resume().catch(()=>{});
  return true;
 }
 // OfflineAudioContext also exposes resume(), but calling it would start an empty render and
 // swallow the graph we are about to schedule. Only realtime contexts get unlocked.
 function canResume(audio){return audio.state==='suspended'&&typeof audio.resume==='function'&&typeof audio.startRendering!=='function';}
 // A single upward-shrinking sine gives the "bo" body; the noise layer gives the "p".
 function pop(audio,at,freq){
  const osc=audio.createOscillator(),gain=audio.createGain();
  osc.type='sine';
  osc.frequency.setValueAtTime(freq,at);
  osc.frequency.exponentialRampToValueAtTime(freq*.25,at+POP*.8);
  gain.gain.setValueAtTime(.0001,at);
  gain.gain.exponentialRampToValueAtTime(.22,at+.006);
  gain.gain.exponentialRampToValueAtTime(.0001,at+POP);
  osc.connect(gain);gain.connect(master);
  osc.start(at);osc.stop(at+POP+.02);
 }
 function crackle(audio,at){
  if(!noise)return;
  const source=audio.createBufferSource(),band=audio.createBiquadFilter(),gain=audio.createGain();
  source.buffer=noise;
  band.type='bandpass';band.frequency.value=1500;band.Q.value=1.2;
  gain.gain.setValueAtTime(.07,at);
  gain.gain.exponentialRampToValueAtTime(.0001,at+.03);
  source.connect(band);band.connect(gain);gain.connect(master);
  source.start(at);source.stop(at+.05);
 }
 // The sampled hit, played exactly as supplied: one bite, one pop, no transposition.
 function playSample(audio,at){
  const source=audio.createBufferSource(),gain=audio.createGain();
  source.buffer=sampleBuffer;
  gain.gain.value=SAMPLE_GAIN;
  source.connect(gain);gain.connect(master);
  source.start(at);
 }
 function playEat(startAt){
  if(!enabled)return false;
  const audio=ensure();if(!audio)return false;
  if(canResume(audio))audio.resume().catch(()=>{});
  decodeSample(audio);
  plays++;
  const t0=(typeof startAt==='number'?startAt:audio.currentTime)+.01;
  if(sampleBuffer)playSample(audio,t0);
  else{pop(audio,t0,BASE_HZ);crackle(audio,t0);}
  return true;
}
const api={
  unlock,playEat,
  isEnabled:()=>enabled,
  setEnabled(value){enabled=!!value;writePref();if(enabled)unlock();return enabled;},
  toggle(){return api.setEnabled(!enabled);},
  plays:()=>plays,
  supports:()=>!!(window.AudioContext||window.webkitAudioContext),
  source:()=>sampleBuffer?'sample':sampleState==='failed'?'synth-fallback':'decoding',
  sampleReady:()=>!!sampleBuffer,
  // Acceptance hook: render the very same synthesis through an OfflineAudioContext so the
  // waveform can be measured (and a WAV sample exported) without relying on anyone's ears.
  useContextFactory(factory){contextFactory=factory||null;ctx=null;master=null;noise=null;sampleBuffer=null;sampleState='idle';return api;},
};
window.FishBubbles=api;
// Warm the decoder during load so the first bite already carries the real sample.
setTimeout(()=>{decodeSample(ensure());},0);
})();
