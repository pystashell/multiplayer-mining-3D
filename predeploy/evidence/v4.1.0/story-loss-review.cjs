const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const BASE='http://127.0.0.1:8790/';
async function make(browser,name){
 const context=await browser.newContext({viewport:{width:1440,height:900},locale:'zh-CN',reducedMotion:'reduce'});const page=await context.newPage();const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400&&!/\/favicon\.ico(?:\?|$)/.test(r.url()))errors.push(`${r.status()} ${r.url()}`)});
 await page.route('**/app.js?v=4.1.0',async route=>{const response=await route.fetch(),source=await response.text();const needle='new HoloSweeperGame();';assert.equal(source.split(needle).length-1,1);await route.fulfill({response,body:source.replace(needle,'window.__releaseQaGame = new HoloSweeperGame();')})});
 await page.goto(BASE,{waitUntil:'networkidle'});assert.ok(await page.evaluate(()=>window.__releaseQaGame));return {context,page,errors,name};
}
async function focus(page,selector,n=12){for(let i=0;i<n;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(sel=>document.querySelector(sel).contains(document.activeElement),selector),true,`${selector} focus escaped`)}for(let i=0;i<6;i++){await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(sel=>document.querySelector(sel).contains(document.activeElement),selector),true)}}
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});const results=[];try{
  {
   const {context,page,errors}=await make(browser,'ultimate');
   await page.evaluate(()=>window.__releaseQaGame.selectTaskMission('ultimate'));
   const lobbyArt=await page.locator('#lobby-modal').evaluate(x=>getComputedStyle(x).getPropertyValue('--story-lobby-art').trim());
   await page.screenshot({path:path.join(__dirname,'ultimate-lobby.jpg'),type:'jpeg',quality:72,fullPage:true});
   await page.locator('#input-nickname').fill('Ultimate QA');await page.locator('#btn-start-task').click();await page.locator('#tutorial-overlay:not(.hidden)').waitFor();
   const state=await page.evaluate(()=>{const a=document.querySelector('#tutorial-art');return{title:document.querySelector('#tutorial-title').textContent,art:a.getAttribute('src'),artLoaded:a.complete&&a.naturalWidth>0,message:document.querySelector('#tutorial-message').textContent}});
   assert.equal(state.artLoaded,true);await focus(page,'#tutorial-overlay');await page.screenshot({path:path.join(__dirname,'ultimate-dialogue.jpg'),type:'jpeg',quality:72,fullPage:true});assert.deepEqual(errors,[]);
   results.push({name:'ultimate-story-art',lobbyArt,...state,focusTrap:true,errors,passed:true});await context.close();console.log('PASS ultimate-story-art');
  }
  {
   const {context,page,errors}=await make(browser,'solo-loss');
   await page.locator('#lobby-campaign-panel [data-mission="medium"]').click();await page.locator('#input-nickname').fill('Loss QA');await page.locator('#btn-start-task').click();
   for(let i=0;i<15&&await page.locator('#tutorial-overlay:not(.hidden)').count();i++)await page.locator('#btn-tutorial-next').click();
   let attempts=0;outer:for(let x=0;x<5;x++)for(let y=0;y<5;y++)for(let z=0;z<5;z++){
     const phase=await page.evaluate(()=>window.__releaseQaGame.roomSnapshot?.phase);
     if(phase==='revive'||phase==='lost'||phase==='won')break outer;
     await page.evaluate(async v=>{await window.__releaseQaGame.roomClient.send({op:'dig',...v})},{x,y,z});attempts++;
   }
   assert.equal(await page.evaluate(()=>window.__releaseQaGame.roomSnapshot?.phase),'revive','did not reach real mine failure');
   await page.locator('#modal-overlay:not(.hidden)').waitFor({timeout:10000});
   const lossTitle=await page.locator('#modal-title').innerText();const before=await page.locator('#modal-stat-progress').innerText();
   assert.match(await page.locator('#btn-modal-restart').innerText(),/撤回|回溯|Rewind/);
   await focus(page,'#modal-overlay');await page.screenshot({path:path.join(__dirname,'solo-loss.jpg'),type:'jpeg',quality:72,fullPage:true});
   await page.locator('#btn-modal-restart').click();
   await page.waitForFunction(()=>['playing','ready'].includes(window.__releaseQaGame.roomSnapshot?.phase)&&document.querySelector('#modal-overlay').classList.contains('hidden'),null,{timeout:10000});
   const after=await page.locator('#stat-progress-percent').innerText();
   await page.locator('#btn-return-lobby').click();await page.locator('#lobby-overlay:not(.hidden)').waitFor();
   await page.locator('#input-nickname').fill('Again QA');await page.locator('#btn-start-task').click();await page.locator('body.in-room').waitFor();
   assert.deepEqual(errors,[]);
   results.push({name:'solo-failure-rewind-restart',attempts,lossTitle,progressBefore:before,progressAfter:after,rewound:true,newTaskOpened:true,focusTrap:true,errors,passed:true});await context.close();console.log('PASS solo-failure-rewind-restart');
  }
  fs.writeFileSync(path.join(__dirname,'story-loss-results.json'),JSON.stringify({browser:browser.version(),testedAt:new Date().toISOString(),instrumentation:'Only assigns the existing HoloSweeperGame instance to window.__releaseQaGame in browser response; product files are unmodified.',results},null,2)+'\n');console.log('STORY_LOSS_QA=PASS');
 }finally{await browser.close()}})().catch(e=>{console.error(e.stack||e);process.exit(1)});
