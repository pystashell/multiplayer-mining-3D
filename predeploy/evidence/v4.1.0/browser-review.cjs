const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const URL = 'http://127.0.0.1:8790/';
const OUT = path.join(__dirname);
const cases = [];
const allErrors = [];
const allowed404 = /\/favicon\.ico(?:\?|$)/;

function record(name, data) {
  cases.push({ name, ...data, passed: true });
  console.log(`PASS ${name}`);
}

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 72, fullPage: true });
}

async function open(browser, name, viewport, mobile = false, locale = 'en-US', url = URL) {
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1, locale, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  const failed = [];
  const external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => failed.push(`${request.url()} ${request.failure()?.errorText}`));
  page.on('response', response => { if (response.status() >= 400 && !allowed404.test(response.url())) failed.push(`${response.status()} ${response.url()}`); });
  page.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith(URL)) external.push(request.url()); });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('#lobby-overlay:not(.hidden)').waitFor();
  return { context, page, errors, failed, external, name };
}

async function assertClean(state) {
  assert.deepEqual(state.errors, [], `${state.name}: page errors`);
  assert.deepEqual(state.failed, [], `${state.name}: failed requests`);
  assert.deepEqual(state.external, [], `${state.name}: external runtime requests`);
}

async function overflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

async function language(page, desired) {
  const current = await page.locator('html').getAttribute('lang');
  if ((current || '').startsWith(desired)) return;
  await page.locator('#btn-language-toggle-lobby').click();
  await page.waitForFunction(wanted => document.documentElement.lang.startsWith(wanted), desired);
}

async function lobby(browser, name, viewport, mobile, locale) {
  const state = await open(browser, name, viewport, mobile, locale);
  const {page} = state;
  await language(page, 'en');
  await screenshot(page, `${name}-lobby-en`);
  assert.match(await page.locator('#lobby-title').innerText(), /SELECT OPERATION MODE/);
  assert.equal(await overflow(page) <= 1, true, `${name}: horizontal overflow in English`);
  await language(page, 'zh');
  await screenshot(page, `${name}-lobby-zh`);
  assert.match(await page.locator('#lobby-title').innerText(), /选择行动模式/);
  assert.equal(await overflow(page) <= 1, true, `${name}: horizontal overflow in Chinese`);
  const guide = await page.locator('#btn-lobby-task').innerText();
  assert.match(guide, /陆霁/);
  const focusChecks = mobile ? 0 : await trapped(page, '#lobby-overlay', 20);
  await assertClean(state);
  record(name, { viewport, languages: ['en','zh'], guide, horizontalOverflow: await overflow(page), focusChecks, errors: state.errors, failed: state.failed });
  await state.context.close();
}

async function trapped(page, overlay, count) {
  const locator = page.locator(overlay);
  for (let i=0; i<count; i++) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(sel => { const root = document.querySelector(sel); return !!root && root.contains(document.activeElement); }, overlay);
    assert.equal(inside, true, `Tab escaped ${overlay} at step ${i+1}`);
  }
  for (let i=0; i<8; i++) {
    await page.keyboard.press('Shift+Tab');
    const inside = await page.evaluate(sel => { const root = document.querySelector(sel); return !!root && root.contains(document.activeElement); }, overlay);
    assert.equal(inside, true, `Shift+Tab escaped ${overlay} at step ${i+1}`);
  }
  return count+8;
}

async function mission(browser, name, viewport, missionName, mobile=false, locale='en-US') {
  const state = await open(browser, name, viewport, mobile, locale);
  const {page} = state;
  await page.locator(`#lobby-campaign-panel [data-mission="${missionName}"]`).click();
  const storyArt = await page.locator('#lobby-modal').evaluate(el => getComputedStyle(el).getPropertyValue('--story-lobby-art').trim());
  await page.locator('#input-nickname').fill(name.slice(0,16));
  await page.locator('#btn-start-task').click();
  await page.locator('#tutorial-overlay:not(.hidden)').waitFor();
  await page.locator('#canvas-container canvas').waitFor();
  const tutorial = await page.evaluate(() => { const img=document.querySelector('#tutorial-art'); const root=document.querySelector('#tutorial-overlay'); const box=root.getBoundingClientRect(); const next=document.querySelector('#btn-tutorial-next').getBoundingClientRect(); return { title:document.querySelector('#tutorial-title').textContent, art:img.getAttribute('src'), artLoaded:img.complete && img.naturalWidth>0, message:document.querySelector('#tutorial-message').textContent, dialogueInside:box.left>=-1 && box.right<=innerWidth+1 && box.top>=-1 && box.bottom<=innerHeight+1, nextInside:next.left>=0 && next.right<=innerWidth+1 && next.top>=0 && next.bottom<=innerHeight+1, role:root.getAttribute('role'), ariaModal:root.getAttribute('aria-modal') }; });
  assert.equal(tutorial.artLoaded, true, `${name}: tutorial art failed`);
  assert.equal(tutorial.nextInside, true, `${name}: tutorial next button clipped`);
  assert.equal(tutorial.role, 'dialog');
  assert.equal(tutorial.ariaModal, 'true');
  assert.equal(await overflow(page) <= 1, true, `${name}: horizontal overflow`);
  const focusChecks = await trapped(page, '#tutorial-overlay', 16);
  await screenshot(page, `${name}-dialogue`);
  for (let i=0;i<15 && await page.locator('#tutorial-overlay:not(.hidden)').count();i++) await page.locator('#btn-tutorial-next').click();
  const gameVisible = await page.locator('body.in-room').count() === 1;
  assert.equal(gameVisible, true, `${name}: game not open`);
  await screenshot(page, `${name}-board`);
  await assertClean(state);
  record(name, { viewport, mission:missionName, storyArt, tutorial, focusChecks, gameVisible, horizontalOverflow:await overflow(page), errors:state.errors, failed:state.failed });
  await state.context.close();
}

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try {
    await lobby(browser,'desktop-wide',{width:1440,height:900},false,'en-US');
    await lobby(browser,'desktop-compact',{width:1280,height:720},false,'en-US');
    await lobby(browser,'mobile-standard',{width:390,height:844},true,'zh-CN');
    await lobby(browser,'mobile-small',{width:360,height:640},true,'zh-CN');
    await mission(browser,'desktop-easy',{width:1440,height:900},'easy');
    await mission(browser,'desktop-medium',{width:1280,height:720},'medium');
    await mission(browser,'desktop-hard',{width:1440,height:900},'hard');
    await mission(browser,'mobile-easy',{width:390,height:844},'easy',true,'zh-CN');
    await mission(browser,'mobile-small-easy',{width:360,height:640},'easy',true,'zh-CN');
    fs.writeFileSync(path.join(OUT,'routes-results.json'),JSON.stringify({browser:browser.version(),testedAt:new Date().toISOString(),cases},null,2)+'\n');
    console.log(`ROUTES_QA=PASS cases=${cases.length}`);
  } finally { await browser.close(); }
})().catch(error=>{console.error(error.stack||error);fs.writeFileSync(path.join(OUT,'routes-failure.json'),JSON.stringify({error:String(error),cases},null,2)+'\n');process.exit(1)});
