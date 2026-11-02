const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),mock=require(root+'/tests/ae_mock');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'noir-browser-'));
mock.install({temp:tmp,fonts:['Inter-Bold','TimesNewRomanPSMT']});
global.$.fileName=root+'/cep/host/bridge.jsx';
(0,eval)(fs.readFileSync(global.$.fileName,'utf8')); NOIR_CEP.load(root);
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:880,height:480}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.exposeFunction('hostEval',script=>(0,eval)(script));
 const server = require('http').createServer((req,res)=>{
   const relative=decodeURIComponent(req.url.split('?')[0]).replace(/^\//,'');
   const file=path.resolve(root,'cep',relative||'index.html');
   if(!file.startsWith(path.join(root,'cep')+path.sep)){res.writeHead(403);res.end();return;}
   try { const data=fs.readFileSync(file);const ext=path.extname(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.mp4':'video/mp4','.jpg':'image/jpeg'})[ext]||'application/octet-stream');res.end(data); }
   catch(e){res.writeHead(404);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 await page.addInitScript(()=>{window.__adobe_cep__={evalScript:(script,cb)=>window.hostEval(script).then(cb)};});
 await page.goto('http://127.0.0.1:'+server.address().port+'/index.html');
 await page.getByRole('button',{name:'3 · Стиль',exact:true}).click();
 const area=page.locator('.scroll-body');
 await page.waitForFunction(()=>document.querySelector('.scroll-body').scrollHeight>document.querySelector('.scroll-body').clientHeight);
 const initialItems=app.project.numItems;
 for(let i=0;i<3 && !(await page.locator('.style-tile.has-reference').count());i++){
   await page.getByRole('button',{name:'Стили →',exact:true}).click();await page.waitForTimeout(100);
 }
 const tile=page.locator('.style-tile.has-reference').first();
 await tile.hover();
 await page.waitForFunction(()=>{const v=document.querySelector('.style-tile.has-reference video');return v && v.currentTime>0 && !v.paused;});
 assert.strictEqual(app.project.numItems,initialItems,'Hover previews must not create AE project items');
 const tabs=page.locator('.tabs'); const before=await tabs.boundingBox();
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
 if(process.env.NOIR_CEP_SCREENSHOT) await page.screenshot({path:process.env.NOIR_CEP_SCREENSHOT});
 assert.deepStrictEqual(errors,[]);
 console.log('Chromium: hover video without AE comps; wheel over fields and header; pinned tabs; finite scroll end; no JS errors: PASS');
 await browser.close();server.close();fs.rmSync(tmp,{recursive:true,force:true});
})().catch(e=>{console.error(e);process.exit(1)});
