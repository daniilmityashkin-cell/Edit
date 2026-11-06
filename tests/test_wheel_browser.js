const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),mock=require(root+'/tests/ae_mock');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'noir-browser-'));
mock.install({temp:tmp,fonts:['Inter-Bold','TimesNewRomanPSMT']});
global.$.fileName=root+'/cep/host/bridge.jsx';
(0,eval)(fs.readFileSync(global.$.fileName,'utf8')); NOIR_CEP.load(root);
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
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
 await page.waitForTimeout(500);await page.setViewportSize({width:460,height:640});await page.waitForTimeout(300);
 const settle=()=>page.waitForTimeout(170);
 const runs=()=>commands.filter(c=>c.action==='run').map(c=>c.command);
 const heading=()=>page.locator('.workspace-heading').innerText();
 const orb=page.locator('.orbit-orb'), orbit=page.locator('.orbit');
 const hoverOrb=async()=>{const b=await orb.boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.waitForTimeout(750);};
 // 1. home: a calm orb; the sections are hidden until the orb is hovered
 assert.ok(await orb.isVisible(),'orb visible at start');assert.strictEqual(await heading(),'NOIR Captions');
 assert.ok(!(await orbit.evaluate(e=>e.classList.contains('open'))),'ring closed at start');
 assert.strictEqual(await page.locator('.orbit-tile').count(),8,'eight sections');
 assert.strictEqual(await page.locator('.orbit-line, .orbit svg line').count(),0,'no connector lines');
 // 2. hover the orb -> the tiles slide out and are clickable; none overlap each other or leave the area
 await hoverOrb();assert.ok(await orbit.evaluate(e=>e.classList.contains('open')),'hover opens the ring');
 const geometry=await page.evaluate(()=>{const host=document.querySelector('.home-host').getBoundingClientRect();const r=[...document.querySelectorAll('.orbit-tile')].map(e=>e.getBoundingClientRect());let overlap=0,outside=0;r.forEach((a,i)=>{if(a.left<host.left-1||a.right>host.right+1||a.top<host.top-1||a.bottom>host.bottom+1)outside++;r.forEach((b,j)=>{if(j>i&&a.left<b.right-2&&b.left<a.right-2&&a.top<b.bottom-2&&b.top<a.bottom-2)overlap++;});});return {overlap,outside,size:r[0].width};});
 assert.strictEqual(geometry.overlap,0,'tiles do not overlap');assert.strictEqual(geometry.outside,0,'tiles stay inside the area');assert.ok(geometry.size>=54,'tiles are big enough: '+geometry.size);
 const labelSize=await page.locator('.tile-label').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize));assert.ok(labelSize>=12,'labels are readable: '+labelSize);
 // 3. click a section -> it opens full-size with only its block; "← Меню" returns to the ring
 await page.locator('.orbit-tile[data-id="time"]').click();await page.waitForTimeout(250);
 assert.strictEqual(await heading(),'Время');assert.ok(!(await orb.isVisible()),'home hidden');
 const visiblePanels=await page.evaluate(()=>[...document.querySelectorAll('#finishPage .panel')].filter(e=>e.offsetParent!==null).map(e=>e.querySelector('.panel-title').textContent));
 assert.deepStrictEqual(visiblePanels,['Время'],'only the Время block is shown');
 await page.getByRole('button',{name:'← Меню'}).click();assert.ok(await orb.isVisible(),'back to the ring');assert.strictEqual(await heading(),'NOIR Captions');
 for(const [id,expected,block] of [['place','Позиция','Положение и размер'],['anim','Анимация','Анимация'],['layers','Слои','Вид и слои']]){
   await hoverOrb();await page.locator('.orbit-tile[data-id="'+id+'"]').click();await page.waitForTimeout(200);
   assert.strictEqual(await heading(),expected);
   assert.deepStrictEqual(await page.evaluate(()=>[...document.querySelectorAll('#finishPage .panel')].filter(e=>e.offsetParent!==null).map(e=>e.querySelector('.panel-title').textContent)),[block]);
   await page.getByRole('button',{name:'← Меню'}).click();
 }
 await hoverOrb();await page.locator('.orbit-tile[data-id="style"]').click();await page.waitForTimeout(200);assert.strictEqual(await heading(),'Галерея стилей');
 await page.getByRole('button',{name:'Главный экран NOIR Captions'}).click();assert.ok(await orb.isVisible(),'the top-bar orb also returns home');
 await hoverOrb();await page.locator('.orbit-tile[data-id="more"]').click();await page.waitForTimeout(200);assert.ok(await page.locator('.settings-drawer').isVisible(),'Настройки opens the drawer');await page.keyboard.press('Escape');
 // the "Правка" tab still shows every block
 await page.getByRole('tab',{name:'Правка',exact:true}).click();
 assert.strictEqual(await page.evaluate(()=>[...document.querySelectorAll('#finishPage .panel')].filter(e=>e.offsetParent!==null).length),4,'the tab shows all blocks');
 await page.getByRole('button',{name:'Главный экран NOIR Captions'}).click();
 // 4. keyboard: Tab to the orb opens the ring, arrows move between sections, Enter opens one
 await orb.focus();assert.ok(await orbit.evaluate(e=>e.classList.contains('open')),'focus opens the ring');
 await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');
 assert.strictEqual(await page.evaluate(()=>document.activeElement.dataset.id),'text');await page.keyboard.press('Enter');await page.waitForTimeout(200);assert.strictEqual(await heading(),'Редактор текста');
 await page.getByRole('button',{name:'← Меню'}).click();
 // 5. the pop-up wheel (right button) still works on any page
 await page.getByRole('tab',{name:'Видео',exact:true}).click();
 await page.mouse.move(220,300);await page.mouse.down({button:'right'});assert.strictEqual(await page.locator('#noir-wheel').count(),1,'right button opens the pop-up wheel');await page.mouse.up({button:'right'});await page.keyboard.press('Escape');
 assert.strictEqual(await page.locator('#noir-wheel').count(),0);
 await page.getByRole('button',{name:'Главный экран NOIR Captions'}).click();
 // 6. assistant: orb click opens it; without a model, plain phrases become commands; the exact request from the user is understood offline
 await orb.click();assert.strictEqual(await page.locator('.noir-assistant').count(),1,'orb click opens the assistant');
 const ask=async(text)=>{await page.fill('.noir-assistant input',text);await page.keyboard.press('Enter');await page.waitForTimeout(250);};
 for(const [text,expected] of [['поставь внизу',{op:'place',y:75}],['выше на 40',{op:'nudge',kx:0,ky:-1,px:40}],['сделай крупнее на 15',{op:'size',sign:1,pct:15}],['появление pop',{op:'animIn',id:'pop'}],['исчезание fade',{op:'animOut',id:'fade'}],['верни на место',{op:'resetPos'}],['сдвинь раньше на 0.5',{op:'time',amount:0.5,shift:-1}],['удлини на 2 кадра',{op:'time',amount:2,frames:true,dOut:1}],['укороти',{op:'time',dOut:-1}],['Настрой субтитры правильно и расположи красиво, чтобы лицо не загораживали',{op:'avoidFace'}]]){
   await ask(text);await settle();assert.deepStrictEqual(runs().pop(),expected,text);
 }
 const multi=runs().length;await ask('поставь внизу и сделай крупнее на 10');await settle();await settle();const added=runs().slice(multi);
 assert.deepStrictEqual(added,[{op:'place',y:75},{op:'size',sign:1,pct:10}],'two requests in one sentence run in order');
 await ask('что-то совсем непонятное');await settle();assert.ok((await page.locator('.as-msg.ai').last().innerText()).length>10,'a hint is shown for unknown text');
 await page.keyboard.press('Escape');assert.strictEqual(await page.locator('.noir-assistant').count(),0);
 // 7. assistant with a language model (a fake local Ollama): free text -> validated commands run, unknown ones are dropped
 const seen=[];
 const ollama=require('http').createServer((req,res)=>{
   res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','*');res.setHeader('Access-Control-Allow-Methods','*');
   if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
   if(req.url==='/api/tags'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({models:[{name:'nomic-embed-text:latest'},{name:'qwen2.5:7b'}]}));return;}
   let body='';req.on('data',c=>body+=c);req.on('end',()=>{seen.push(JSON.parse(body));res.setHeader('Content-Type','application/json');
     res.end(JSON.stringify({message:{content:'```json\n'+JSON.stringify({say:'Подняла и увеличила.',commands:[{op:'scale',factor:1.3},{op:'placeZones',baseY:70,accentY:20},{op:'hackTheWorld'},{op:'animIn',id:'не-существует'},{op:'delete'}]})+'\n```'}}));});
 });
 await new Promise(r=>ollama.listen(0,'127.0.0.1',r));
 await page.evaluate(port=>NoirAssistant.setSettings({endpoint:'http://127.0.0.1:'+port,model:'',mode:'auto'}),ollama.address().port);
 await orb.click();await page.waitForTimeout(700);
 assert.ok(/qwen2\.5:7b/.test(await page.locator('.as-mode').innerText()),'the chat model is picked, the embedding model is ignored: '+await page.locator('.as-mode').innerText());
 const before=runs().length;await ask('сделай покрупнее и подними красиво');await page.waitForTimeout(900);
 assert.strictEqual(seen.length,1,'the model was asked once');assert.strictEqual(seen[0].model,'qwen2.5:7b');assert.strictEqual(seen[0].format,'json');
 assert.ok(/Просьба: сделай покрупнее/.test(seen[0].messages[1].content)&&/Состояние/.test(seen[0].messages[1].content),'the request and the state go to the model');
 assert.ok(/avoidFace/.test(seen[0].messages[0].content),'the model is told the commands');
 const got=runs().slice(before);assert.deepStrictEqual(got.slice(0,2),[{op:'scale',factor:1.3},{op:'placeZones',baseY:70,accentY:20}],'known commands run in order');
 assert.ok(!got.some(c=>c.op==='hackTheWorld'),'unknown commands never reach the host');
 const log=await page.locator('.noir-assistant .as-log').innerText();assert.ok(/Подняла и увеличила/.test(log)&&/Пропущено команд/.test(log),'the answer and the dropped count are shown');
 // a dead endpoint: the assistant falls back to offline phrases without errors
 await page.evaluate(()=>NoirAssistant.setSettings({endpoint:'http://127.0.0.1:1',model:''}));await page.keyboard.press('Escape');await orb.click();await page.waitForTimeout(700);
 assert.ok(/без ИИ/.test(await page.locator('.as-mode').innerText()));
 await ask('поставь вверху');await settle();assert.deepStrictEqual(runs().pop(),{op:'place',y:25});
 await page.keyboard.press('Escape');ollama.close();
 // 8. a small panel: the ring fits
 await page.setViewportSize({width:320,height:440});await page.waitForTimeout(300);
 await hoverOrb();
 const fits=await page.evaluate(()=>{const host=document.querySelector('.home-host').getBoundingClientRect();return [...document.querySelectorAll('.orbit-tile')].every(e=>{const r=e.getBoundingClientRect();return r.left>=host.left-1&&r.right<=host.right+1&&r.top>=host.top-1&&r.bottom<=host.bottom+1;});});
 assert.ok(fits,'tiles fit a small panel');
 assert.deepStrictEqual(errors,[]);
 console.log('Home ring (hover, sections full-size, back), keyboard, pop-up wheel, assistant offline + language model + fallback, small panel: PASS');
 await browser.close();server.close();process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
