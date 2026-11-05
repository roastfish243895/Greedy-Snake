/* Optional local Playwright acceptance test; use bundled runtime or installed playwright. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const R=path.resolve(__dirname,'..');
const modulePath=process.env.PLAYWRIGHT_MODULE||'playwright';
const {chromium}=require(modulePath);
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});
 const errors=[],network=[],checks=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
 const state=()=>page.evaluate(()=>FishGameV2.getState());
 const record=name=>checks.push({name,status:'PASS'});
 try{
  await page.goto(pathToFileURL(path.join(R,'index.html')).href+'?qa');
  await page.waitForFunction(()=>FishGameV2.getState().loaded);
  await page.evaluate(()=>{FishGameV2.qa.freeze();FishGameV2.qa.advance(900);});
  let s=await state();assert.equal(s.status,'ready');assert.equal(s.bodyCount,10);assert.equal(s.foods.length,7);record('offline_assets_and_initial_10_fish_heads');
  const dimensions=await page.locator('#board').boundingBox();assert.equal(dimensions.width,1056);assert.equal(dimensions.height,704);record('native_1056x704_board');
  assert.equal(await page.evaluate(()=>FishBubbles.supports()),true);assert.equal(await page.evaluate(()=>FishBubbles.isEnabled()),true);record('web_audio_ready_offline_no_audio_files');
  await page.waitForFunction(()=>FishBubbles.sampleReady(),null,{timeout:5000});
  assert.equal(await page.evaluate(()=>FishBubbles.source()),'sample');record('embedded_pop_sample_decoded');
  await page.screenshot({path:path.join(R,'previews/新版首页.png'),fullPage:true});
  await page.locator('#overlayStart').click();assert.equal((await state()).status,'running');record('start_button');
  await page.locator('#board').screenshot({path:path.join(R,'previews/冷白地图_开局.png')});
  await page.evaluate(()=>FishGameV2.qa.tick(170));s=await state();assert.equal(s.head.x,14);assert.equal(s.mouth,'open');
  await page.locator('#board').screenshot({path:path.join(R,'previews/靠近张嘴.png')});record('near_food_open_mouth');
  const bitesBefore=await page.evaluate(()=>FishBubbles.plays());
  await page.evaluate(()=>FishGameV2.qa.tick(170));await page.evaluate(()=>FishGameV2.qa.tick(170));s=await state();assert.equal(s.score,1);assert.equal(s.bodyCount,11);assert.equal(s.mouth,'closed');assert.equal(s.foods.length,7);
  assert(s.foodScales.some(f=>f.scale===.015));record('bite_grows_one_fish_and_closes_teeth');assert.equal(await page.locator('#eventText').textContent(),'吞下 OpenAI。队伍里又多了一个大肥鱼。');record('brand_food_name_feedback');
  assert.equal(await page.evaluate(()=>FishBubbles.plays()),bitesBefore+1);record('one_bubble_pop_per_bite');
  await page.locator('#board').screenshot({path:path.join(R,'previews/吞下合齿.png')});
  await page.keyboard.press('Space');assert.equal((await state()).status,'paused');
  const before=(await state()).clock;await page.evaluate(()=>FishGameV2.qa.advance(1000));assert.equal((await state()).clock,before);record('keyboard_pause_freezes_simulation');
  await page.keyboard.press('Space');assert.equal((await state()).status,'running');
  await page.keyboard.press('ArrowUp');await page.evaluate(()=>FishGameV2.qa.tick(170));assert.equal((await state()).direction,'n');record('keyboard_turn');
  await page.locator('#restartButton').click();s=await state();assert.equal(s.score,0);assert.equal(s.bodyCount,10);assert.equal(s.status,'ready');record('restart_keeps_10_starting_fish');
  await page.locator('#soundButton').click();
  assert.equal(await page.evaluate(()=>FishBubbles.isEnabled()),false);assert.equal(await page.locator('#soundLabel').textContent(),'音效 关');
  assert.equal(await page.locator('#soundButton').getAttribute('aria-pressed'),'false');record('sound_button_switches_off');
  const quiet=await page.evaluate(()=>FishBubbles.plays());
  await page.evaluate(()=>{const now=FishGameV2.getState().clock;FishGameV2.qa.set({snake:[{x:5,y:5}],faces:[],direction:'e',foods:[{x:6,y:5,kind:'openai',id:99,born:now}],status:'running',queue:[]});FishGameV2.qa.tick(170);});
  assert.equal((await state()).score,1);assert.equal(await page.evaluate(()=>FishBubbles.plays()),quiet);record('muted_bite_stays_silent');
  await page.keyboard.press('m');
  assert.equal(await page.evaluate(()=>FishBubbles.isEnabled()),true);assert.equal(await page.locator('#soundLabel').textContent(),'音效 开');record('keyboard_m_toggles_sound_back_on');
  const fixtures=[
   ['e',[{x:23,y:6},{x:22,y:6}],{x:0,y:6}],['w',[{x:0,y:6},{x:1,y:6}],{x:23,y:6}],
   ['s',[{x:10,y:15},{x:10,y:14}],{x:10,y:0}],['n',[{x:10,y:0},{x:10,y:1}],{x:10,y:15}],
  ];
  for(const [direction,snake,target]of fixtures){
   await page.evaluate(f=>{FishGameV2.qa.set({snake:f.snake,faces:['happy'],direction:f.direction,foods:[],status:'running',queue:[],closedUntil:-1});}, {snake,direction});
   await page.evaluate(()=>FishGameV2.qa.tick(170));s=await state();assert.deepEqual(s.head,target);assert.equal(s.status,'running');record('browser_wrap_'+direction);
  }
  await page.locator('#board').screenshot({path:path.join(R,'previews/穿越上边界.png')});
  await page.evaluate(()=>FishGameV2.qa.set({snake:[{x:3,y:3},{x:2,y:3},{x:2,y:4},{x:3,y:4},{x:4,y:4}],faces:['happy','angry','cry','smug'],direction:'s',foods:[],status:'running',queue:[]}));
  await page.evaluate(()=>FishGameV2.qa.tick(170));assert.equal((await state()).status,'dead');assert.equal(await page.locator('#overlayTitle').textContent(),'你把自己的鱼咬了。');record('self_bite_loss_overlay');
  await page.locator('#overlayStart').click();assert.equal((await state()).status,'running');assert.equal((await state()).bodyCount,10);record('loss_restart_button');
  // Entrance animation screenshots at deterministic phases, snake stopped in ready state.
  await page.evaluate(()=>{FishGameV2.qa.clock(0);FishGameV2.reset();});
  const scales=[];
  for(const t of [0,60,140,280,460]){
   await page.evaluate(t=>FishGameV2.qa.clock(t),t);scales.push((await state()).foodScales[0].scale);
   await page.locator('#board').screenshot({path:path.join(R,'previews/品牌豆子入场_'+String(t).padStart(3,'0')+'ms.png')});
  }
  assert(scales[0]<.02&&scales[4]===1);assert(scales[1]-scales[0]>scales[4]-scales[3]);record('visible_pop_from_dot_ease_out');
  // Check all seven supplied icon assets are the active foods.
  assert.deepEqual((await state()).foods.map(f=>f.kind),['openai','qwen','grok','gemini','hunyuan','codex','claude']);record('seven_user_supplied_brand_icons_as_simple_food');
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{FishGameV2.reset();FishGameV2.qa.advance(900);});
  const layout=await page.evaluate(()=>({width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,dpad:getComputedStyle(document.querySelector('.touch-controls')).display}));
  assert.equal(layout.scrollWidth,layout.width);assert.notEqual(layout.dpad,'none');record('mobile_layout_no_horizontal_overflow');
  await page.locator('#overlayStart').click();await page.locator('[data-direction="n"]').click();await page.evaluate(()=>FishGameV2.qa.tick(170));assert.equal((await state()).direction,'n');record('mobile_direction_button');
  const box=await page.locator('#board').boundingBox();await page.mouse.move(box.x+box.width*.6,box.y+box.height*.6);await page.mouse.down();await page.mouse.move(box.x+box.width*.35,box.y+box.height*.6,{steps:2});await page.mouse.up();await page.evaluate(()=>FishGameV2.qa.tick(170));assert.equal((await state()).direction,'w');record('pointer_swipe_direction');
  await page.evaluate(()=>FishGameV2.reset());await page.screenshot({path:path.join(R,'previews/手机布局.png'),fullPage:true});
  // The sound switch is remembered locally; nothing about it leaves the machine.
  await page.evaluate(()=>FishBubbles.setEnabled(false));
  await page.reload();
  await page.waitForFunction(()=>FishGameV2.getState().loaded);
  assert.equal(await page.evaluate(()=>FishBubbles.isEnabled()),false);
  assert.equal(await page.locator('#soundLabel').textContent(),'音效 关');record('sound_preference_survives_reload');
  await page.evaluate(()=>FishBubbles.setEnabled(true));
  // Render the identical synthesis offline: it must be audible, short, unclipped, and land on
  // the bite rather than trailing behind it. A WAV sample is exported for a human to judge.
  const wave=await page.evaluate(async()=>{
   const Ctx=window.OfflineAudioContext||window.webkitOfflineAudioContext,rate=44100;
   const offline=new Ctx(1,Math.round(rate*1.2),rate);
   FishBubbles.useContextFactory(()=>offline);FishBubbles.unlock();
   const startedAt=Date.now();
   while(!FishBubbles.sampleReady()&&Date.now()-startedAt<5000)await new Promise(r=>setTimeout(r,10));
   const usedSample=FishBubbles.source();
   FishBubbles.playEat(0);FishBubbles.playEat(.35);FishBubbles.playEat(.7);
   const data=(await offline.startRendering()).getChannelData(0);
   const rms=(from,to)=>{let sum=0,n=0;for(let i=Math.floor(from*rate);i<Math.floor(to*rate)&&i<data.length;i++){sum+=data[i]*data[i];n++;}return Math.sqrt(sum/Math.max(1,n));};
   let peak=0;for(let i=0;i<data.length;i++){const a=Math.abs(data[i]);if(a>peak)peak=a;}
   let attackMs=-1;for(let i=0;i<data.length;i++){if(Math.abs(data[i])>peak*.5){attackMs=i/rate*1000;break;}}
   const view=new DataView(new ArrayBuffer(44+data.length*2)),wr=(o,s)=>{for(let i=0;i<s.length;i++)view.setUint8(o+i,s.charCodeAt(i));};
   wr(0,'RIFF');view.setUint32(4,36+data.length*2,true);wr(8,'WAVE');wr(12,'fmt ');
   view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);
   view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);wr(36,'data');view.setUint32(40,data.length*2,true);
   for(let i=0;i<data.length;i++){const v=Math.max(-1,Math.min(1,data[i]));view.setInt16(44+i*2,v<0?v*0x8000:v*0x7fff,true);}
   const bytes=new Uint8Array(view.buffer);let binary='';
   for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000));
   // A single bite must render exactly one pop, ending well before a second hit could start.
   const solo=new Ctx(1,Math.round(rate*.4),rate);
   FishBubbles.useContextFactory(()=>solo);FishBubbles.unlock();
   const soloStart=Date.now();
   while(!FishBubbles.sampleReady()&&Date.now()-soloStart<5000)await new Promise(r=>setTimeout(r,10));
   FishBubbles.playEat(0);
   const soloData=(await solo.startRendering()).getChannelData(0);
   const frameLen=Math.round(rate*.005),env=[];
   for(let i=0;i+frameLen<=soloData.length;i+=frameLen){let s=0;for(let j=0;j<frameLen;j++)s+=soloData[i+j]*soloData[i+j];env.push(Math.sqrt(s/frameLen));}
   const envMax=Math.max.apply(null,env);let pops=0,sounding=false;
   for(const v of env){const on=v>envMax*.3;if(on&&!sounding)pops++;sounding=on;}
   let lastSounding=0;for(let i=0;i<soloData.length;i++)if(Math.abs(soloData[i])>.004)lastSounding=i;
   const soloTailMs=lastSounding/rate*1000;
   return {peak,rmsHead:rms(0,.3),rmsTail:rms(1,1.2),attackMs,usedSample,pops,soloTailMs,b64:btoa(binary)};
  });
  fs.writeFileSync(path.join(R,'previews/音效_吃豆啵声样张.wav'),Buffer.from(wave.b64,'base64'));
  await page.evaluate(()=>FishBubbles.useContextFactory(null));
  assert.equal(wave.usedSample,'sample');assert.equal(wave.pops,1);assert(wave.soloTailMs<150);record('one_pop_per_bite_no_repeat');
  assert(wave.peak>.05&&wave.peak<.995);assert(wave.attackMs>=0&&wave.attackMs<20);
  assert(wave.rmsHead>wave.rmsTail*8);assert(wave.rmsTail<.002);record('bubble_sfx_waveform_audible_short_unclipped');
  assert.equal(errors.length,0);assert.equal(network.length,0);record('zero_page_errors_zero_external_requests');
  fs.writeFileSync(path.join(R,'docs/浏览器验收.json'),JSON.stringify({date:new Date().toISOString().slice(0,10),browser:'local Chrome headless',entry:'file://',status:'PASS',checks,pageErrors:errors,externalRequests:network,entranceScales:scales,limitations:['手机布局为浏览器模拟验证，未在实体手机运行；未测试Safari。','音效验收为无头浏览器内的播放计数、内嵌采样解码状态与离线渲染波形，未在真人听觉下确认音色。']},null,2));
  console.log(checks.length+' browser acceptance checks passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});


