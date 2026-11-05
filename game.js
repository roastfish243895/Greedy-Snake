/* Offline canvas game. No fetch, CDN, analytics, external image or API calls. */
(function(){
 'use strict';
 const C=window.FishSnakeV2,A=window.FISH_V2_ASSETS,SFX=window.FishBubbles,$=s=>document.querySelector(s);
 // Board scale: 24x16 cells at 44px each = 1056x704 native (was 40px / 960x640).
 const canvas=$('#board'),ctx=canvas.getContext('2d'),CELL=44,FACE=44,HEAD_W=44,HEAD_H=55,FOOD_SIZE=34;
 const labels={openai:'OpenAI',qwen:'Qwen',grok:'Grok',gemini:'Gemini',hunyuan:'混元',codex:'Codex',claude:'Claude'};
 const cache=new Map(),imagePaths={};
 Object.entries(A.head).forEach(([k,v])=>imagePaths['head/'+k]=v);
 Object.entries(A.fish).forEach(([k,v])=>imagePaths['fish/'+k]=v);
 Object.entries(A.foods).forEach(([k,v])=>imagePaths['food/'+k]=v);
 let loaded=false,failed=false,model=C.create(),clock=0,lastReal=null,accumulator=0;
 let effects=[],eventMessage='四边都是出口。吃一个 AI，多一个鱼头。',hudKey='',mouth='closed';
 const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
 const testEnabled=new URLSearchParams(location.search).has('qa');
 let manualClock=false;
 function preload(){return Promise.all(Object.entries(imagePaths).map(([key,src])=>new Promise((resolve,reject)=>{
  const img=new Image();cache.set(key,img);img.onload=resolve;img.onerror=()=>reject(new Error('素材载入失败：'+src));img.src=src;
 })))}
 function image(key,x,y,w,h){
  const im=cache.get(key);if(!im?.naturalWidth)return;
  ctx.imageSmoothingEnabled=false;ctx.drawImage(im,Math.round(x),Math.round(y),w,h);
 }
 // Toroidal visual copies prevent sprites from being clipped at a connected edge.
 function wrappedImage(key,cx,cy,w,h){
  for(const dx of [-canvas.width,0,canvas.width])for(const dy of [-canvas.height,0,canvas.height]){
   const x=cx-w/2+dx,y=cy-h/2+dy;
   if(x+w<=0||y+h<=0||x>=canvas.width||y>=canvas.height)continue;
   image(key,x,y,w,h);
  }
 }
function drawMap(){
 const W=canvas.width,H=canvas.height,MAJOR=CELL*5;
 ctx.fillStyle='#f8fafb';ctx.fillRect(0,0,W,H);
 ctx.strokeStyle='#e1e6ec';ctx.lineWidth=1;ctx.beginPath();
 for(let x=0;x<=W;x+=CELL){ctx.moveTo(x+.5,0);ctx.lineTo(x+.5,H);}
 for(let y=0;y<=H;y+=CELL){ctx.moveTo(0,y+.5);ctx.lineTo(W,y+.5);}
 ctx.stroke();
 // Slightly heavier five-cell divisions: drafting-paper feeling, not a checkerboard.
 ctx.strokeStyle='#d3dce5';ctx.beginPath();
 for(let x=MAJOR;x<W;x+=MAJOR){ctx.moveTo(x+.5,0);ctx.lineTo(x+.5,H);}
 for(let y=MAJOR;y<H;y+=MAJOR){ctx.moveTo(0,y+.5);ctx.lineTo(W,y+.5);}
 ctx.stroke();
}
function render(){
 drawMap();ctx.imageSmoothingEnabled=false;
 for(const food of model.foods){
  const s=reducedMotion.matches?1:C.popScale(clock-food.born),size=FOOD_SIZE*s;
  const x=(food.x+.5)*CELL,y=(food.y+.5)*CELL;
  ctx.save();ctx.imageSmoothingEnabled=false;
  const img=cache.get('food/'+food.kind);if(img?.naturalWidth)ctx.drawImage(img,x-size/2,y-size/2,size,size);
  ctx.restore();
 }
 // Every occupied body cell is one whole upright fish portrait, not a blue connector.
 for(let i=model.snake.length-1;i>=1;i--){
  const p=model.snake[i],face=model.faces[i-1]||'neutral';
  wrappedImage('fish/'+face,(p.x+.5)*CELL,(p.y+.5)*CELL,FACE,FACE);
 }
 const h=model.snake[0];mouth=C.mouthState(model,clock);
 wrappedImage('head/'+mouth,(h.x+.5)*CELL,(h.y+.5)*CELL,HEAD_W,HEAD_H);
 const v=C.DIR[model.direction];
 // A discreet front-side marker makes upright heads readable in all four travel directions.
 ctx.fillStyle='#486dac';const mx=(h.x+.5)*CELL+v[0]*24,my=(h.y+.5)*CELL+v[1]*31;
 if(mx>=0&&my>=0&&mx<canvas.width&&my<canvas.height){ctx.beginPath();ctx.arc(mx,my,1.9,0,Math.PI*2);ctx.fill();}
 updateHUD();
}
 function updateHUD(){
  const key=[loaded,failed,model.status,model.score,model.faces.length,mouth,eventMessage].join('|');if(key===hudKey)return;hudKey=key;
  $('#score').textContent=model.score;$('#bodyCount').textContent=model.faces.length;
  $('#mouthIndicator').textContent=mouth==='open'?'靠近了 · 张嘴':'牙齿合上';
  const statusLabels={ready:'准备下水',running:'正在觅食',paused:'暂停中',dead:'咬到自己了',won:'全吃完了'};
  $('#statusLabel').textContent=statusLabels[model.status];$('#runningDot').classList.toggle('active',model.status==='running');
  $('#eventText').textContent=loaded?eventMessage:failed?'未能加载素材。请保留 assets 文件夹。':'本地加载素材中…';
  $('#overlay').hidden=model.status==='running';
  const panel={
   ready:['已集结 '+model.faces.length+' 个大肥鱼','可以开始抽象了。','边界不是墙，自己才是。','开吃'],
   paused:['暂停 / 鱼头都还在','先停一停。','这条队伍暂时不动。','继续'],
   dead:['吞下 '+model.score+' 个 AI','你把自己的鱼咬了。','墙没拦住你，鱼头拦住了。','再来一串'],
   won:['全场都是大肥鱼','她们占领了地图。','所有格子都被这一串头占满。','重来']
  }[model.status];
  if(panel){$('#overlayKicker').textContent=panel[0];$('#overlayTitle').textContent=panel[1];$('#overlayDescription').textContent=panel[2];$('#overlayStart').innerHTML=(loaded?panel[3]:'准备贴图中…')+' <span>↗</span>';}
  $('#pauseButton').innerHTML=(model.status==='running'?'暂停':model.status==='paused'?'继续':['dead','won'].includes(model.status)?'再来':'开始')+' <kbd>Space</kbd>';
 }
 function reset(){model=C.create({now:clock});accumulator=0;effects=[];eventMessage='四边都是出口。吃一个 AI，多一个鱼头。';hudKey='';render();}
function syncSoundButton(){
 const button=$('#soundButton');if(!button)return;
 const on=!!SFX?.isEnabled();
 $('#soundLabel').textContent=on?'音效 开':'音效 关';
 button.setAttribute('aria-pressed',on?'true':'false');
 button.classList.toggle('muted',!on);
}
function toggleSound(){
 if(!SFX)return;
 SFX.toggle();syncSoundButton();
 if(SFX.isEnabled())SFX.playEat(); // Preview the very sound you just switched on.
 eventMessage=SFX.isEnabled()?'吃豆子会啵啵啵了。':'音效关了，安静吃。';
 render();
}
function toggle(){
 if(!loaded)return;
 SFX?.unlock(); // First real click/keypress is what lets the browser allow sound at all.
 if(['dead','won'].includes(model.status))reset();
  model.status=model.status==='running'?'paused':'running';
  accumulator=0;eventMessage=model.status==='paused'?'暂停了。按空格继续。':'开始了。喂，前面那个 AI 看起来挺好吃。';render();
 }
 function step(){
  const result=C.tick(model,clock);
  if(result.ate){effects.push({x:result.eaten.x,y:result.eaten.y,born:clock});eventMessage='吞下 '+labels[result.eaten.kind]+'。队伍里又多了一个大肥鱼。';SFX?.playEat();}
  else if(result.wrapped)eventMessage='穿过去了。地图这边没墙。';
  if(model.status==='dead')eventMessage='咬到自己的大肥鱼头像了。本局结束。';
  if(model.status==='won')eventMessage='所有格子都装满了。';
  effects=effects.filter(e=>clock-e.born<420);return result;
 }
 function advance(ms){
  // Ready keeps only food entrance animations alive; paused/dead/won freeze everything.
  if(!loaded||['paused','dead','won'].includes(model.status))return;
  clock+=ms;
  if(model.status==='running'){
   accumulator+=ms;const duration=Number($('#speed').value);let steps=0;
   while(accumulator>=duration&&model.status==='running'&&steps++<8){accumulator-=duration;step();}
  }
 }
 function loop(real){
  if(lastReal===null)lastReal=real;
  const dt=Math.min(50,Math.max(0,real-lastReal));lastReal=real;
  if(!manualClock)advance(dt);render();requestAnimationFrame(loop);
 }
 $('#overlayStart').addEventListener('click',()=>{toggle();canvas.focus({preventScroll:true});});
 $('#pauseButton').addEventListener('click',()=>{toggle();canvas.focus({preventScroll:true});});
 $('#restartButton').addEventListener('click',()=>{reset();canvas.focus({preventScroll:true});});
 $('#speed').addEventListener('change',()=>{accumulator=0;});
 $('#soundButton').addEventListener('click',()=>{toggleSound();canvas.focus({preventScroll:true});});
 document.querySelectorAll('[data-direction]').forEach(b=>b.addEventListener('click',()=>{if(model.status==='ready')toggle();C.enqueue(model,b.dataset.direction);}));
 window.addEventListener('keydown',e=>{
  if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;
  const key=e.key.toLowerCase(),dirs={arrowup:'n',arrowright:'e',arrowdown:'s',arrowleft:'w',w:'n',d:'e',s:'s',a:'w'};
  if(dirs[key]){
   e.preventDefault();if(model.status==='ready')toggle();if(['running','paused'].includes(model.status))C.enqueue(model,dirs[key]);return;
  }
  if((key===' '||key==='enter')&&e.target.tagName!=='BUTTON'){
   e.preventDefault();if(!e.repeat)toggle();
 }else if(key==='r'){e.preventDefault();if(!e.repeat)reset();}
 else if(key==='m'){e.preventDefault();if(!e.repeat)toggleSound();}
 else if(key==='escape'&&model.status==='running'){toggle();}
 });
 let pointerStart=null;
 canvas.addEventListener('pointerdown',e=>{pointerStart={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
 canvas.addEventListener('pointermove',e=>{
  if(!pointerStart)return;const dx=e.clientX-pointerStart.x,dy=e.clientY-pointerStart.y;
  if(Math.max(Math.abs(dx),Math.abs(dy))<18)return;
  const dir=Math.abs(dx)>Math.abs(dy)?dx>0?'e':'w':dy>0?'s':'n';
  if(model.status==='ready')toggle();C.enqueue(model,dir);pointerStart={x:e.clientX,y:e.clientY};
 });
 for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>{pointerStart=null;});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&model.status==='running'){model.status='paused';eventMessage='切换了页面，已自动暂停。';accumulator=0;render();}});
 $('#fullscreenButton').addEventListener('click',async()=>{
  try{if(document.fullscreenElement)await document.exitFullscreen();else await $('#canvasShell').requestFullscreen();}
  catch(error){eventMessage='当前浏览器没有进入全屏；仍可在页面正常游玩。';render();}
 });
 for(const [name,src]of Object.entries(A.foods)){
  const img=new Image();img.src=src;img.alt=labels[name];img.title=labels[name];$('#menuIcons').append(img);
 }
 window.FishGameV2={getState:()=>({loaded,failed,status:model.status,score:model.score,bodyCount:model.faces.length,head:{...model.snake[0]},snake:model.snake.map(p=>({...p})),faces:[...model.faces],direction:model.direction,mouth:C.mouthState(model,clock),closedUntil:model.closedUntil,clock,wraps:model.wraps,foods:model.foods.map(f=>({...f})),foodScales:model.foods.map(f=>({id:f.id,scale:C.popScale(clock-f.born)}))}),reset};
 // Deterministic fixture/clock hooks only on ?qa. Never part of normal gameplay controls.
 if(testEnabled)window.FishGameV2.qa={
  freeze:()=>{manualClock=true;},
  advance:ms=>{advance(ms);render();},
  tick:ms=>{clock+=ms||Number($('#speed').value);const r=step();render();return r;},
  set:fields=>{Object.assign(model,fields);accumulator=0;effects=[];hudKey='';render();},
  clock:value=>{clock=value;render();},
  toggle,render,
 };
 syncSoundButton();render();requestAnimationFrame(loop);
 preload().then(()=>{loaded=true;clock=0;model=C.create({now:0});lastReal=null;$('#overlayStart').disabled=false;$('#pauseButton').disabled=false;$('#restartButton').disabled=false;render();}).catch(error=>{
  failed=true;$('#loadError').hidden=false;$('#loadError').textContent=error.message+'。请完整保留该版本文件夹。';eventMessage=error.message;render();console.error(error);
 });
})();
