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
 const settle=()=>page.waitForTimeout(170);
 const runs=()=>commands.filter(c=>c.action==='run').map(c=>c.command);
 const home=page.locator('.noir-home svg'), overlay=page.locator('#noir-wheel');
 // scope: '.noir-home' (RT 252, tile ring 120) or '#noir-wheel' (RT 214, tile ring 90)
 const G={'.noir-home':{rt:252,ring:120},'#noir-wheel':{rt:214,ring:90}};
 const tilePoint=async(scope,i)=>{await page.waitForTimeout(scope==='#noir-wheel'?220:60);return page.evaluate(([scope,i,g])=>{const r=document.querySelector(scope+' svg').getBoundingClientRect(),s=r.width/(g.rt*2),a=i*(360/11)*Math.PI/180,rr=g.ring*s;return {x:r.left+r.width/2+rr*Math.sin(a),y:r.top+r.height/2-rr*Math.cos(a)};},[scope,i,G[scope]]);};
 const pillPoint=async(scope,text)=>{await page.waitForTimeout(scope==='#noir-wheel'?220:60);return page.evaluate(([scope,text])=>{const t=[...document.querySelectorAll(scope+' .wh-pill text')].find(e=>e.textContent===text);if(!t)throw new Error('no pill '+text);const b=t.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2};},[scope,text]);};
 const orbPoint=async(scope)=>page.evaluate((scope)=>{const r=document.querySelector(scope+' svg').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};},scope);
 const heading=()=>page.locator('.workspace-heading').innerText();
 // 1. the home screen is the wheel itself, shown first
 assert.strictEqual(await home.count(),1,'home wheel is mounted');assert.ok(await home.isVisible(),'home wheel visible at start');assert.strictEqual(await heading(),'NOIR Captions');
 // 2. hover a tile -> its items appear; clicking an item runs it and the home wheel stays
 let p=await tilePoint('.noir-home',3);await page.mouse.move(p.x,p.y);
 p=await pillPoint('.noir-home','Внизу');await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.up();
 await settle();assert.deepStrictEqual(runs().pop(),{op:'place',y:75});assert.ok(await home.isVisible(),'home wheel stays open after an action');
 // 3. press on a tile, drag to an item and release on it
 p=await tilePoint('.noir-home',6);await page.mouse.move(p.x,p.y);await page.mouse.down();
 p=await pillPoint('.noir-home','Pop');await page.mouse.move(p.x,p.y,{steps:4});await page.mouse.up();
 await settle();assert.deepStrictEqual(runs().pop(),{op:'animIn',id:'pop'});
 // repeatable items (nudge, time)
 p=await tilePoint('.noir-home',5);await page.mouse.move(p.x,p.y);
 p=await pillPoint('.noir-home','Конец +');await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.up();
 await settle();assert.deepStrictEqual(runs().pop(),{op:'time',dOut:1});
 // 4. "Открыть ▸" opens the page; the orb button in the top bar returns home
 p=await tilePoint('.noir-home',9);await page.mouse.move(p.x,p.y);p=await pillPoint('.noir-home','Открыть ▸');await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.up();
 await page.waitForTimeout(150);assert.strictEqual(await heading(),'Правка субтитров');assert.ok(!(await home.isVisible()),'home hidden on a page');
 assert.ok(await page.locator('#finishPage').isVisible(),'the page is shown');
 await page.getByRole('button',{name:'Главный экран NOIR Captions'}).click();assert.ok(await home.isVisible(),'orb button goes home');
 await page.getByRole('tab',{name:'Текст',exact:true}).click();assert.ok(!(await home.isVisible()));await page.getByRole('tab',{name:'Текст',exact:true}).click();
 await page.getByRole('button',{name:'Главный экран NOIR Captions'}).click();
 // 5. right button anywhere opens the pop-up wheel above (also while on a page); release cancels, Escape closes
 await page.getByRole('tab',{name:'Видео',exact:true}).click();
 await page.mouse.move(500,330);await page.mouse.down({button:'right'});assert.strictEqual(await overlay.count(),1,'right button opens the pop-up wheel');await page.mouse.up({button:'right'});await page.keyboard.press('Escape');assert.strictEqual(await overlay.count(),0);
 p=await tilePoint('.noir-home',0).catch(()=>null);
 // pop-up wheel: sector 3 / item
 await page.mouse.move(520,300);await page.mouse.down({button:'right'});await page.mouse.up({button:'right'});
 p=await tilePoint('#noir-wheel',3);await page.mouse.move(p.x,p.y);p=await pillPoint('#noir-wheel','Вверху');await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.up();
 await settle();assert.deepStrictEqual(runs().pop(),{op:'place',y:25});assert.strictEqual(await overlay.count(),0,'pop-up wheel closes after an item');
 // 6. keyboard on the home wheel
 await page.getByRole('button',{name:'Главный экран NOIR Captions'}).click();
 p=await tilePoint('.noir-home',0);await page.mouse.move(p.x,p.y);await settle();const before6=runs().length;
 await page.locator('.noir-home svg').focus();for(let i=0;i<3;i++)await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');await page.keyboard.press('Enter');
 await settle();assert.strictEqual(runs().length,before6+1,'keyboard ran one command');assert.deepStrictEqual(runs().pop(),{op:'place',y:25},'keyboard: 4th tile, first item');
 // 7. the orb opens the assistant; plain commands become host commands; unknown text runs nothing
 const o=await orbPoint('.noir-home');await page.mouse.move(o.x,o.y);await page.mouse.down();await page.mouse.up();
 assert.strictEqual(await page.locator('.noir-assistant').count(),1,'orb opens the assistant');
 const ask=async(text)=>{await page.fill('.noir-assistant input',text);await page.keyboard.press('Enter');};
 for(const [text,expected] of [['поставь внизу',{op:'place',y:75}],['выше на 40',{op:'nudge',kx:0,ky:-1,px:40}],['сделай крупнее на 15',{op:'size',sign:1,pct:15}],['появление pop',{op:'animIn',id:'pop'}],['исчезание fade',{op:'animOut',id:'fade'}],['исчезание whip',{op:'animOut',id:'whipR'}],['верни на место',{op:'resetPos'}],['сдвинь раньше на 0.5',{op:'time',amount:0.5,shift:-1}],['удлини на 2 кадра',{op:'time',amount:2,frames:true,dOut:1}],['начало позже',{op:'time',dIn:1}],['укороти',{op:'time',dOut:-1}]]){
   await ask(text);await settle();assert.deepStrictEqual(runs().pop(),expected,text);
 }
 await settle();const n=runs().length;await ask('что-то непонятное');await settle();assert.strictEqual(runs().length,n,'unknown text must not run anything');
 await page.keyboard.press('Escape');assert.strictEqual(await page.locator('.noir-assistant').count(),0);
 // 8. a small panel: the home wheel fits, the pop-up wheel fits
 await page.setViewportSize({width:320,height:420});await page.waitForTimeout(250);
 const fit=await page.evaluate(()=>{const r=document.querySelector('.noir-home svg').getBoundingClientRect(),h=document.querySelector('.home-host').getBoundingClientRect();return r.left>=h.left-1&&r.right<=h.right+1&&r.top>=h.top-1&&r.bottom<=h.bottom+1&&r.width>150;});
 assert.ok(fit,'home wheel must fit a small panel');
 await page.mouse.move(160,200);await page.mouse.down({button:'right'});await page.mouse.up({button:'right'});
 const fit2=await page.evaluate(()=>{const r=document.querySelector('#noir-wheel svg').getBoundingClientRect();return r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;});assert.ok(fit2,'pop-up wheel must fit a small panel');
 assert.deepStrictEqual(errors,[]);
 console.log('Home wheel + pop-up wheel: hover/click, press-drag-release, pages and back, right button, keyboard, assistant commands, small panel: PASS');
 await browser.close();server.close();process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
