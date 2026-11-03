const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),mock=require(root+'/tests/ae_mock');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'noir-browser-'));
mock.install({temp:tmp,fonts:['Inter-Bold','TimesNewRomanPSMT']});
global.$.fileName=root+'/cep/host/bridge.jsx';
(0,eval)(fs.readFileSync(global.$.fileName,'utf8')); NOIR_CEP.load(root);
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:880,height:360}});
 page.setDefaultTimeout(15000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let hostCalls=0,bridgeDelay=0;const commands=[];
 await page.exposeFunction('hostEval',script=>{
   hostCalls++;const match=/^NOIR_CEP\.request\((.*)\)$/.exec(script);
   if(match)commands.push(JSON.parse(JSON.parse(match[1])));
   if(bridgeDelay){const delay=bridgeDelay;return new Promise(resolve=>setTimeout(()=>resolve((0,eval)(script)),delay));}
   return (0,eval)(script);
 });
 const server = require('http').createServer((req,res)=>{
   const relative=decodeURIComponent(req.url.split('?')[0]).replace(/^\//,'');
   const file=path.resolve(root,'cep',relative||'index.html');
   if(!file.startsWith(path.join(root,'cep')+path.sep)){res.writeHead(403);res.end();return;}
   try { const data=fs.readFileSync(file);const ext=path.extname(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.mp4':'video/mp4','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'})[ext]||'application/octet-stream');res.end(data); }
   catch(e){res.writeHead(404);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 await page.addInitScript(()=>{window.__adobe_cep__={evalScript:(script,cb)=>window.hostEval(script).then(cb)};});
 await page.goto('http://127.0.0.1:'+server.address().port+'/index.html');
 await page.waitForFunction(()=>{const logo=document.querySelector('.brand-mark img');return logo && logo.complete && logo.naturalWidth>0;});
 const loadedFaces=await page.evaluate(async()=>(await document.fonts.load('12px "Open Sans"','Субтитры Open Sans')).length);
 assert.ok(loadedFaces>0,"Bundled Open Sans must load instead of a fallback font");
 assert.ok(await page.evaluate(()=>document.fonts.check('12px "Open Sans"') && getComputedStyle(document.body).fontFamily.includes('Open Sans')),'Open Sans must load locally');
 await page.waitForTimeout(400);
 await page.evaluate(()=>{window.idleMutations=0;window.idleObserver=new MutationObserver(items=>window.idleMutations+=items.length);window.idleObserver.observe(document.getElementById('app'),{subtree:true,attributes:true,childList:true,characterData:true});});
 const idleCalls=hostCalls;await page.waitForTimeout(2200);assert.strictEqual(hostCalls,idleCalls,'Idle panel must not invoke AE repeatedly');
 assert.strictEqual(await page.evaluate(()=>{window.idleObserver.disconnect();return window.idleMutations;}),0,'Idle panel must not rewrite its DOM every second');
 const navCalls=hostCalls;
 await page.getByRole('tab',{name:'Текст',exact:true}).click();
 await page.getByRole('tab',{name:'Видео',exact:true}).click();
 await page.getByRole('tab',{name:'Стиль',exact:true}).click();
 assert.strictEqual(hostCalls,navCalls,'Navigation must stay local to the browser');
 await page.getByRole('tab',{name:'Стиль',exact:true}).click();
 // Recognition is the only source of scheduled host calls; completion opens the editor.
 const nativeRecognition={getAudioSource:NOIR.getAudioSource,modelCached:NOIR.modelCached,startRecognition:NOIR.startRecognition};
 let recognitionCallbacks;
 NOIR.getAudioSource=()=>({file:'test.wav'});NOIR.modelCached=()=>true;
 NOIR.startRecognition=(src,options,callbacks)=>{recognitionCallbacks=callbacks;callbacks.onStatus({state:'recognizing',message:'Тест распознавания',progress:.25});};
 await page.getByRole('tab',{name:'Видео',exact:true}).click();
 await page.locator('.create-action').click();
 await page.waitForFunction(()=>document.querySelector('.workflow-status').dataset.state==='busy');
 const pollsBefore=commands.filter(c=>c.action==='poll').length;
 await page.waitForTimeout(2200);
 assert.ok(commands.filter(c=>c.action==='poll').length>pollsBefore,'Active recognition must receive status polls');
 recognitionCallbacks.onDone({schema:'noir-captions/1',language:'ru',segments:[{words:[{text:'Готово',start:1,end:2}]}]},{link:null});
 Object.assign(NOIR,nativeRecognition);
 await page.waitForFunction(()=>document.querySelector('.workflow-status').dataset.state==='ready' && document.querySelector('#textPage').hidden===false);
 const completedCalls=hostCalls;await page.waitForTimeout(1300);assert.strictEqual(hostCalls,completedCalls,'Polling must stop after recognition completes');
 await page.getByRole('tab',{name:'Стиль',exact:true}).click();
 const area=page.locator('.workspace');
 await page.waitForFunction(()=>document.querySelector('.scroll-body').scrollHeight>document.querySelector('.scroll-body').clientHeight);
 const initialItems=app.project.numItems;
 for(let i=0;i<3 && !(await page.locator('.style-tile.has-reference').count());i++){
   await page.getByRole('button',{name:'Стили →',exact:true}).click();await page.waitForTimeout(100);
 }
 assert.ok(await page.locator('.style-tile.selected').count(),'Saved style must be on the initial gallery page');
 const tile=page.locator('.style-tile.has-reference').first();
 await tile.hover();
 await page.waitForFunction(()=>{const v=document.querySelector('.style-tile.has-reference video');return v && v.currentTime>0 && !v.paused;});
 assert.strictEqual(app.project.numItems,initialItems,'Hover previews must not create AE project items');
 const tabs=page.locator('.tabs'); const before=await tabs.boundingBox();
 await area.evaluate(e=>{e.scrollTop=e.scrollHeight;});
 await page.waitForFunction(()=>document.querySelector('.style-tile.has-reference video').paused);
 await area.evaluate(e=>{e.scrollTop=0;});
 await page.mouse.move(300,330);await page.mouse.wheel(0,450);await page.waitForTimeout(200);
 assert.ok(await area.evaluate(e=>e.scrollTop)>0,'wheel over contents must scroll');
 assert.strictEqual((await tabs.boundingBox()).y,before.y,'tabs must remain pinned');
 await area.evaluate(e=>{e.scrollTop=0;});
 const current=await area.evaluate(e=>e.scrollTop);
 await page.mouse.move(before.x+30,before.y+10);await page.mouse.wheel(0,300);await page.waitForTimeout(100);
 assert.ok(await area.evaluate(e=>e.scrollTop)>current,'wheel over pinned tabs must scroll content');
 await page.mouse.wheel(0,-3000);await page.waitForTimeout(100);
 assert.strictEqual(await area.evaluate(e=>e.scrollTop),0,'wheel up must reach top');
 const input=area.locator('select:visible').first(),value=await input.inputValue();
 await input.hover();await page.mouse.wheel(0,200);await page.waitForTimeout(100);
 assert.ok(await area.evaluate(e=>e.scrollTop)>0,'wheel over dropdown must scroll content');
 assert.strictEqual(await input.inputValue(),value,'wheel must not change dropdown value');
 assert.strictEqual((await tabs.boundingBox()).y,before.y);
 await page.mouse.wheel(0,100000); await page.waitForTimeout(100);
 const end=await area.evaluate(e=>({top:e.scrollTop,max:e.scrollHeight-e.clientHeight}));
 assert.ok(Math.abs(end.top-end.max)<2,'Scroll must stop at the end of visible content');
 await page.mouse.wheel(0,100000); await page.waitForTimeout(100);
 assert.strictEqual(await area.evaluate(e=>e.scrollTop),end.top,'No scrolling into empty space');
 await area.evaluate(e=>{e.scrollTop=0;});
 // Inspector stays on the right without replacing the current main page.
 await page.getByRole('button',{name:'Настройки',exact:true}).click();
 await page.getByLabel('Раздел настроек').selectOption('font');
 assert.ok(await page.getByRole('tab',{name:'Стиль',exact:true}).getAttribute('aria-selected')==='true');
 assert.ok(await page.locator('#stylePage').isVisible());
 await page.waitForTimeout(250);
 let drawer=await page.locator('.settings-drawer').boundingBox();
 assert.ok(drawer.x>400 && drawer.x+drawer.width<=881);
 await page.getByLabel('Раздел настроек').selectOption('animationPage');
 await page.waitForTimeout(850);
 assert.ok(await page.locator('[data-role="animationPage"]').isVisible(),'Legacy inspector controls survive host polling');
 await page.getByRole('button',{name:'Закрыть настройки',exact:true}).last().click();
 assert.ok(await page.getByRole('tab',{name:'Стиль',exact:true}).getAttribute('aria-selected')==='true');
 // Narrow inspector is an overlay, traps keyboard focus and closes with Escape.
 await page.setViewportSize({width:320,height:560});
 await page.getByRole('button',{name:'Настройки',exact:true}).click();
 await page.waitForTimeout(250);
 drawer=await page.locator('.settings-drawer').boundingBox();
 assert.ok(drawer.x>=0 && drawer.x+drawer.width<=321);
 await page.keyboard.press('Shift+Tab');
 assert.ok(await page.evaluate(()=>document.querySelector('.settings-drawer').contains(document.activeElement)));
 await page.keyboard.press('Escape');
 assert.ok(!(await page.locator('.settings-drawer').isVisible()));
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow at 320px');
 // Load actual host data and exercise contextual editing through the bridge.
 const sample={schema:'noir-captions/1',language:'ru',segments:Array.from({length:24},(_,i)=>({words:[{text:'Привет',start:1+i*3,end:2+i*3},{text:'мир',start:2+i*3,end:3+i*3}]}))};
 const json=path.join(tmp,'sample.json');fs.writeFileSync(json,JSON.stringify(sample));
 global.app.project.activeItem=new mock.CompItem({duration:100});global.File.openDialog=()=>mock.File(json);
 await page.getByRole('tab',{name:'Видео',exact:true}).click();
 await page.getByRole('button',{name:'Загрузить результат распознавания JSON',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.create-action').textContent==='Создать субтитры');
 const editor=page.getByLabel('Текст субтитров');
 await editor.focus();
 await editor.evaluate(el=>{el.setSelectionRange(0,6);el.dispatchEvent(new Event('select'));});
 await page.locator('.word-toolbar').getByRole('button',{name:'Акцент',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.caption-editor').value.startsWith('*Привет*'));
 assert.ok(!(await page.locator('.word-chips').count()),'No duplicate grid of word buttons');
 // A single creation action; font/geometry problems are handled inline if present.
 global.__installedFonts=[];
 await page.locator('.create-action').click();
 await page.waitForFunction(()=>!document.querySelector('.preflight').hidden);
 assert.strictEqual(app.project.activeItem.numLayers,0,'Preflight must leave the composition untouched');
 await page.locator('.preflight').getByRole('button',{name:'Выбрать шрифт',exact:true}).first().click();
 assert.strictEqual(await page.getByLabel('Раздел настроек').inputValue(),'font');
 assert.ok(await page.locator('[data-field="fontFamily"] .field-issue').count()>0);
 await page.keyboard.press('Escape');
 global.__installedFonts=['Inter-Bold','TimesNewRomanPSMT'];
 await page.locator('.create-action').click();
 await page.waitForTimeout(250);
 if(await page.locator('.preflight').isVisible())await page.getByRole('button',{name:'Продолжить с замечаниями',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.create-action').textContent==='Обновить фразу');
 const comp=app.project.activeItem,otherLayers=comp._l.filter(l=>NOIR.groupInfo(l) && NOIR.groupInfo(l).segment!==0);
 // Editing then immediately generating must flush the debounce before the host action.
 const old=await editor.inputValue();await editor.fill(old.replace('*Привет*','Здравствуйте'));
 await editor.evaluate(el=>{el.setSelectionRange(0,0);el.dispatchEvent(new Event('select'));});
 await page.locator('.create-action').click();
 await page.waitForTimeout(250);
 if(await page.locator('.preflight').isVisible())await page.getByRole('button',{name:'Продолжить с замечаниями',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.workflow-status').textContent.indexOf('✓')===0);
 assert.ok(comp._l.some(l=>/здравствуйте/i.test(l.name)),'Immediate update includes latest input');
 assert.ok(otherLayers.every(l=>comp._l.includes(l)),'Updating one phrase preserves other layers');
 assert.ok(!comp._l.some(l=>String(l.comment).indexOf(NOIR.SFX_TAG)===0),'SFX remains manual');
 await page.setViewportSize({width:320,height:300});
 // A slow bridge must receive the latest queued text, never intermediate stale edits.
 await page.setViewportSize({width:420,height:500});
 const stableText=await editor.inputValue(), commandStart=commands.length;
 bridgeDelay=1200;
 await editor.focus();
 await editor.evaluate((el,value)=>{el.value=value;el.setSelectionRange(0,0);el.dispatchEvent(new Event('input',{bubbles:true}));},stableText.replace('Здравствуйте','Первый'));
 await page.waitForTimeout(280);
 await editor.evaluate((el,value)=>{el.value=value;el.setSelectionRange(0,0);el.dispatchEvent(new Event('input',{bubbles:true}));},stableText.replace('Здравствуйте','Промежуточный'));
 await page.waitForTimeout(280);
 await editor.evaluate((el,value)=>{el.value=value;el.setSelectionRange(0,0);el.dispatchEvent(new Event('input',{bubbles:true}));},stableText.replace('Здравствуйте','Финальный'));
 await page.waitForTimeout(280);bridgeDelay=0;
 await page.locator('.create-action').click();
 await page.waitForFunction(()=>document.querySelector('.caption-editor').value.startsWith('Финальный'));
 await page.waitForTimeout(1600);
 if(await page.locator('.preflight').isVisible())await page.getByRole('button',{name:'Продолжить с замечаниями',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.workflow-status').textContent.indexOf('✓')===0);
 assert.ok(comp._l.some(l=>/финальный/i.test(l.name)));
 assert.ok(!commands.slice(commandStart).some(c=>c.action==='set' && String(c.value).startsWith('Промежуточный')),'Queued intermediate input must be collapsed');
 await page.setViewportSize({width:320,height:300});
 // Native textarea gets wheel first; at its edge, the panel takes over.
 await area.evaluate(e=>{e.scrollTop=0;});await editor.evaluate(e=>{e.scrollTop=0;});
 await editor.hover();const outerBefore=await area.evaluate(e=>e.scrollTop);await page.mouse.wheel(0,80);await page.waitForTimeout(100);
 assert.ok(await editor.evaluate(e=>e.scrollTop)>0);
 assert.strictEqual(await area.evaluate(e=>e.scrollTop),outerBefore);
 await editor.evaluate(e=>{e.scrollTop=e.scrollHeight;});await area.evaluate(e=>{e.scrollTop=0;});await page.mouse.wheel(0,200);await page.waitForTimeout(100);
 assert.ok(await area.evaluate(e=>e.scrollTop)>0,'Textarea boundary transfers wheel to panel');
 await page.getByRole('button',{name:'Следующая фраза',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.phrase-navigation select').selectedIndex===1);
 assert.strictEqual(comp.time,4,'Phrase navigation seeks the composition');
 // A text selection in another line targets that line for the primary update.
 await editor.evaluate(el=>{const offset=el.value.split('\n').slice(0,3).join('\n').length+1;el.setSelectionRange(offset,offset+6);el.dispatchEvent(new Event('select'));});
 await page.waitForFunction(()=>document.querySelector('.phrase-navigation select').selectedIndex===3);
 // Reduced-motion preference suppresses automatic video playback.
 await page.getByRole('tab',{name:'Стиль',exact:true}).click();
 await page.emulateMedia({reducedMotion:'reduce'});await page.locator('.style-tile.has-reference').first().hover();
 assert.ok(await page.locator('.style-tile.has-reference video').first().evaluate(v=>v.paused));
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.mouse.move(10,10);
 await page.setViewportSize({width:280,height:200});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Minimum CEP size must not overflow horizontally');
 const primaryBounds=await page.locator('.create-action').boundingBox();assert.ok(primaryBounds.x>=0 && primaryBounds.x+primaryBounds.width<=280);
 await page.setViewportSize({width:420,height:680});await area.evaluate(e=>{e.scrollTop=0;});

 await page.waitForTimeout(250);
 assert.strictEqual(await page.locator('.brand-name').count(),0,'No product name inside the panel');
 await page.evaluate(()=>document.fonts.ready);
 if(process.env.NOIR_CEP_SCREENSHOT) {
   await page.screenshot({path:process.env.NOIR_CEP_SCREENSHOT});
   await page.setViewportSize({width:1200,height:500});await area.evaluate(e=>{e.scrollTop=0;});await page.waitForTimeout(250);
   await page.screenshot({path:process.env.NOIR_CEP_SCREENSHOT.replace('.png','-wide.png')});
 }
 assert.deepStrictEqual(errors,[]);
 console.log('Chromium: Open Sans, zero idle DOM/host work, local navigation, queued input coalescing, offscreen video pause, recognition-only polling, compact UI, independent inspector, narrow overlay, contextual edits, latest-input generation, phrase update/seek, nested wheel, finite scroll, hover previews and reduced motion: PASS');
 await browser.close();server.close();fs.rmSync(tmp,{recursive:true,force:true});
})().catch(e=>{console.error(e);process.exit(1)});
