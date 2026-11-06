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
 await page.waitForTimeout(500);
 const wheel=()=>page.locator('#noir-wheel');
 const sectorCentre=async(i)=>{await page.waitForTimeout(220);return page.evaluate((i)=>{const w=document.querySelector('#noir-wheel svg').getBoundingClientRect(),s=w.width/428,a=i*(360/11)*Math.PI/180,r=70*s;return {x:w.left+w.width/2+r*Math.sin(a),y:w.top+w.height/2-r*Math.cos(a)};},i);};
 const pillCentre=async(text)=>{await page.waitForTimeout(220);return page.evaluate((text)=>{const t=[...document.querySelectorAll('#noir-wheel .wh-pill text')].find(e=>e.textContent===text);if(!t)throw new Error('no pill '+text);const b=t.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2};},text);};
 const settle=()=>page.waitForTimeout(160);
 const runs=()=>commands.filter(c=>c.action==='run').map(c=>c.command);
 const hub=await page.locator('.dial-core').boundingBox();
 // 1. quick click opens a sticky wheel; clicking an item runs it and closes the wheel.
 await page.mouse.click(hub.x+hub.width/2,hub.y+hub.height/2);
 assert.ok(await wheel().count()===1,'click on the hub must open the wheel');
 let p=await sectorCentre(3);await page.mouse.move(p.x,p.y);
 p=await pillCentre('Внизу');await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.up();
 assert.strictEqual(await wheel().count(),0,'item click closes the wheel');
 await settle();assert.deepStrictEqual(runs().pop(),{op:'place',y:75});
 // 2. press, drag to a sector and an item, release on it.
 await page.mouse.move(hub.x+hub.width/2,hub.y+hub.height/2);await page.mouse.down();
 assert.ok(await wheel().count()===1,'press opens the wheel');
 p=await sectorCentre(6);await page.mouse.move(p.x,p.y,{steps:4});
 p=await pillCentre('Pop');await page.mouse.move(p.x,p.y,{steps:4});await page.mouse.up();
 await settle();assert.deepStrictEqual(runs().pop(),{op:'animIn',id:'pop'});assert.strictEqual(await wheel().count(),0);
 // 2b. the time sector repeats and keeps the wheel open.
 await page.mouse.click(hub.x+hub.width/2,hub.y+hub.height/2);p=await sectorCentre(5);await page.mouse.move(p.x,p.y);
 p=await pillCentre('Конец +');await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.up();
 await settle();assert.deepStrictEqual(runs().pop(),{op:'time',dOut:1});assert.strictEqual(await wheel().count(),1);await page.keyboard.press('Escape');
 // 3. releasing without choosing cancels; Escape closes.
 await page.mouse.move(hub.x+hub.width/2,hub.y+hub.height/2);await page.mouse.down();p=await sectorCentre(4);await page.mouse.move(p.x,p.y,{steps:4});await page.mouse.move(p.x+3,p.y+2);
 await settle();const before=runs().length;await page.mouse.up();await settle();assert.strictEqual(runs().length,before,'release over a sector without an item runs nothing');
 await page.mouse.click(hub.x+hub.width/2,hub.y+hub.height/2);await page.keyboard.press('Escape');assert.strictEqual(await wheel().count(),0);
 // 4. repeatable items (nudge) keep a sticky wheel open.
 await page.mouse.click(hub.x+hub.width/2,hub.y+hub.height/2);p=await sectorCentre(4);await page.mouse.move(p.x,p.y);
 p=await pillCentre('↑');await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.up();
 p=await pillCentre('↑');await page.mouse.move(p.x+1,p.y);await page.mouse.down();await page.mouse.up();
 await settle();assert.strictEqual(await wheel().count(),1,'nudge keeps the wheel open');assert.strictEqual(runs().filter(c=>c.op==='nudge').length,2);
 await page.keyboard.press('Escape');
 // 5. right button anywhere opens it under the pointer; keyboard path from the hub.
 await page.mouse.move(500,300);await page.mouse.down({button:'right'});assert.strictEqual(await wheel().count(),1,'right button opens the wheel');await page.mouse.up({button:'right'});await page.keyboard.press('Escape');
 await page.locator('.dial-core').focus();await page.keyboard.press('Enter');
 for(let i=0;i<3;i++)await page.keyboard.press('ArrowRight');
 await page.keyboard.press('Enter');await page.keyboard.press('Enter');
 await settle();assert.deepStrictEqual(runs().pop(),{op:'place',y:25},'keyboard: 4th sector, first item');
 // 6. assistant: centre of the wheel; plain commands become host commands; unknown text runs nothing.
 await page.mouse.click(hub.x+hub.width/2,hub.y+hub.height/2);const box=await page.evaluate(()=>{const w=document.querySelector('#noir-wheel svg').getBoundingClientRect();return {x:w.left+w.width/2,y:w.top+w.height/2};});
 await page.mouse.move(box.x,box.y);await page.mouse.down();await page.mouse.up();
 assert.ok(await page.locator('.noir-assistant').count()===1,'centre opens the assistant');
 const ask=async(text)=>{await page.fill('.noir-assistant input',text);await page.keyboard.press('Enter');};
 for(const [text,expected] of [['поставь внизу',{op:'place',y:75}],['выше на 40',{op:'nudge',kx:0,ky:-1,px:40}],['сделай крупнее на 15',{op:'size',sign:1,pct:15}],['появление pop',{op:'animIn',id:'pop'}],['исчезание fade',{op:'animOut',id:'fade'}],['исчезание whip',{op:'animOut',id:'whipR'}],['верни на место',{op:'resetPos'}],['сдвинь раньше на 0.5',{op:'time',amount:0.5,shift:-1}],['удлини на 2 кадра',{op:'time',amount:2,frames:true,dOut:1}],['начало позже',{op:'time',dIn:1}],['укороти',{op:'time',dOut:-1}]]){
   await ask(text);await settle();assert.deepStrictEqual(runs().pop(),expected,text);
 }
 await settle();const n=runs().length;await ask('что-то непонятное');await settle();assert.strictEqual(runs().length,n,'unknown text must not run anything');
 await page.keyboard.press('Escape');assert.strictEqual(await page.locator('.noir-assistant').count(),0);
 // narrow panel: wheel fits the viewport.
 await page.setViewportSize({width:320,height:420});await page.mouse.click(40,40);
 await page.locator('.dial-core').click();
 const fit=await page.evaluate(()=>{const r=document.querySelector('#noir-wheel svg').getBoundingClientRect();return r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;});assert.ok(fit,'wheel must fit a small panel');
 assert.deepStrictEqual(errors,[]);
 console.log('Radial wheel: click-open, drag-release, cancel, sticky repeat, right button, keyboard, assistant commands, small panel: PASS');
 await browser.close();server.close();process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
