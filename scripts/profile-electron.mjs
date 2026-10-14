// Real Electron renderer benchmark. Isolated profile; only optional manual login
// can POST. Sales/stock/payments and scheduled backups are never exercised.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, existsSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { PRODUCTION_URL } from '../desktop/policy.mjs';

const local = process.argv.includes('--local');
const interactive = process.argv.includes('--interactive');
const browser = process.argv.includes('--browser');
const reuseProfile = process.argv.find(value => value.startsWith('--reuse-profile='))?.slice('--reuse-profile='.length);
const phase = process.argv.find(value => value.startsWith('--phase='))?.slice(8);
if (phase && !['before', 'after'].includes(phase)) throw new Error('Invalid phase');
const reportTag = process.argv.find(value => value.startsWith('--report-tag='))?.slice(13);
if (reportTag && !/^[a-z0-9-]{1,40}$/.test(reportTag)) throw new Error('Invalid report tag');
const keepProfile = process.argv.includes('--keep-profile');
const port = browser ? 9230 : local ? 9228 : 9227;
const origin = local ? 'http://localhost:3000' : PRODUCTION_URL;
if (local) {
  // A nonexistent route proves the server barrier is active without probing a
  // financial endpoint. This also protects startup before CDP is attached.
  const probe = await fetch(origin+'/api/__benchmark-write-probe', {method:'POST'});
  if (probe.status !== 403 || (await probe.json()).error !== 'Writes are blocked in this read-only benchmark') throw new Error('Start the local server with POS_BENCHMARK_READ_ONLY=1 before benchmarking');
}
const profile = reuseProfile || mkdtempSync(join(tmpdir(), browser ? 'oushadhi-browser-check-' : 'oushadhi-desktop-check-'));
if (dirname(realpathSync(profile)).toLowerCase() !== realpathSync(tmpdir()).toLowerCase() || !/^oushadhi-(desktop|browser)-check-/.test(basename(profile))) throw new Error('Only an owned isolated diagnostic profile is allowed');
const started = performance.now();
const electron = createRequire(new URL('../desktop/package.json', import.meta.url))('electron');
const launchEnv = { ...process.env };
delete launchEnv.ELECTRON_RUN_AS_NODE;
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (browser && !chrome) throw new Error('Chrome is not installed');
const child = spawn(browser ? chrome : electron, browser ? [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--new-window', origin] : ['.', '--benchmark', '--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${port}`, '--benchmark-profile=' + profile, ...(local ? ['--local'] : []), ...(interactive ? ['--benchmark-visible'] : [])], {
  cwd: fileURLToPath(new URL('../desktop/', import.meta.url)), env: launchEnv,
  stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
});
const startupErrors = [];
child.stderr.on('data', data => {
  // Only retain diagnostic classifications; never retain profile or URL values.
  const value = String(data);
  for (const label of ['ERR_MODULE_NOT_FOUND', 'EACCES', 'EPERM', 'ENOENT', 'SyntaxError', 'TypeError', 'Error:']) if (value.includes(label)) startupErrors.push(label);
});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket, nextId = 0;
const commands = new Map(), requests = new Map(), completed = [], events = new Map();
const issued = [];
const report = { client: browser ? 'Chrome' : 'Electron', target: local ? 'local-production-build' : 'hosted-production', phase, profileDirectory: profile, origin, measuredAt: new Date().toISOString(), writesBlocked: 0, measurements: [], cacheOperations: [] };
function command(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { commands.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 45000);
    commands.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error('Renderer evaluation failed');
  return result.result.value;
}
const dom = `({ path:location.pathname, ready:document.readyState, login:!!document.querySelector('input[name="password"],input[name="pin"]'), cards:document.querySelectorAll('.sales-product-card').length, cache:document.querySelector('[data-sales-cache]')?.dataset.salesCache, salesLink:!!document.querySelector('a[href="/sales"]'), offline:location.protocol==='file:' })`;
async function waitFor(predicate, timeout = 25000) {
  const start = performance.now();
  while (performance.now() - start < timeout) {
    const value = await evaluate(dom); if (predicate(value)) return value; await delay(100);
  }
  throw new Error('Renderer readiness timeout');
}
async function clickRoute(path) {
  return evaluate(`(async()=>{
    const link=document.querySelector('a[href="${path}"]'); if(!link)return { unavailable:true };
    const start=performance.now();link.click();
    while(performance.now()-start<20000){
      if(location.pathname==='${path}' && (${path === '/sales' ? "document.querySelectorAll('.sales-product-card').length>0" : "!!document.querySelector('h1')"})){
        const domReadyMs=performance.now()-start;
        const painted=await Promise.race([new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(true)))),new Promise(r=>setTimeout(()=>r(false),200))]);
        return {ms:+(performance.now()-start).toFixed(2),domReadyMs:+domReadyMs.toFixed(2),painted,hidden:document.hidden,cards:document.querySelectorAll('.sales-product-card').length};
      }
      await new Promise(r=>setTimeout(r,10));
    }return {timeout:true};
  })()`);
}
async function changeSearch(clear = false) {
  return evaluate(`(async()=>{
    const input=document.querySelector('#pos-search'), grid=document.querySelector('.sales-product-card')?.parentElement;
    if(!input||!grid)return {unavailable:true};
    const before=grid.innerText;
    const query=${clear ? "''" : "document.querySelector('.sales-product-card h2').textContent.trim().split(/\\s+/)[0]"};
    const start=performance.now();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,query);
    input.dispatchEvent(new Event('input',{bubbles:true}));
    while(performance.now()-start<10000){
      if(document.querySelectorAll('.sales-product-card').length && grid.innerText!==before){
        const domReadyMs=performance.now()-start;
        const painted=await Promise.race([new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(true)))),new Promise(r=>setTimeout(()=>r(false),200))]);
        return {ms:+(performance.now()-start).toFixed(2),domReadyMs:+domReadyMs.toFixed(2),painted,hidden:document.hidden,cards:document.querySelectorAll('.sales-product-card').length};
      }await new Promise(r=>setTimeout(r,5));
    }return {unchanged:true};
  })()`);
}
async function measureCart() {
  return evaluate(`(async()=>{
    const rows=await new Promise(resolve=>{const r=indexedDB.open('oushadi-sales-cache');r.onsuccess=()=>{const db=r.result;if(!db.objectStoreNames.contains('entries')){db.close();resolve([]);return;}const q=db.transaction('entries','readonly').objectStore('entries').getAll();q.onsuccess=()=>{db.close();resolve(q.result.filter(row=>row.kind==='detail').map(row=>row.data));};};r.onerror=()=>resolve([]);});
    const cards=[...document.querySelectorAll('.sales-product-card')];
    const product=rows.filter(p=>p.allowPackageSale!==false&&p.stock?.sealedPackages>0).sort((a,b)=>Number(a.allowLooseSale)-Number(b.allowLooseSale)).find(p=>cards.some(c=>c.querySelector('h2')?.textContent===p.name));
    if(!product)return {unavailable:true,reason:'No visible cached product with sealed stock'};
    const card=cards.find(c=>c.querySelector('h2')?.textContent===product.name);
    const selectionStart=performance.now();card.click();
    while(performance.now()-selectionStart<5000&&!document.querySelector('.sales-cart-item')&&!document.querySelector('[role="dialog"]'))await new Promise(r=>setTimeout(r,2));
    const selectionMs=performance.now()-selectionStart;
    const button=[...document.querySelectorAll('[role="dialog"] button')].find(b=>b.textContent.trim()==='Add to sale');
    const start=button?performance.now():selectionStart;
    if(button)button.click();
    while(performance.now()-start<5000&&!document.querySelector('.sales-cart-item'))await new Promise(r=>setTimeout(r,2));
    if(!document.querySelector('.sales-cart-item'))return {timeout:true};
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    return {ms:+(performance.now()-start).toFixed(2),selectionMs:+selectionMs.toFixed(2),usedDialog:!!button,items:document.querySelectorAll('.sales-cart-item').length};
  })()`);
}
async function measureFilterSearch(clear = false) {
  return evaluate('(async()=>{const input=document.querySelector("#pos-search");if(!input)return {unavailable:true};const start=performance.now();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(input,' + JSON.stringify(clear ? '' : 'a') + ');input.dispatchEvent(new Event("input",{bubbles:true}));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return {ms:+(performance.now()-start).toFixed(2),cards:document.querySelectorAll(".sales-product-card").length,cache:document.querySelector("[data-sales-cache]")?.dataset.salesCache};})()');
}
async function measureCheckoutFixtures() {
  // Only the UI uses isolated cart/settings fixtures; nothing is submitted.
  // The customer's real checkout setting is preserved in MongoDB.
  report.checkoutConfiguration = await evaluate(`(async()=>{const r=await fetch('/api/settings');if(!r.ok)throw new Error('Settings unavailable');window.__checkoutBenchmarkSettings=(await r.json()).data;return {liveCheckoutEnabled:window.__checkoutBenchmarkSettings.checkout?.enabled!==false,fixtureLines:30};})()`);
  const runAction = async (name, action, ready) => {
    const before = issued.length;
    const result = await evaluate(`(async()=>{const start=performance.now();${action};while(performance.now()-start<5000&&!(${ready}))await new Promise(r=>setTimeout(r,0));const readyMs=performance.now()-start;const painted=await Promise.race([new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(true)))),new Promise(r=>setTimeout(()=>r(false),200))]);return {ms:+(performance.now()-start).toFixed(2),domReadyMs:+readyMs.toFixed(2),painted,hidden:document.hidden,ready:!!(${ready})};})()`);
    report.measurements.push({ name, scope: 'isolated checkout UI fixture; live Settings and cart are not changed', ...result, apiRequestStarts: issued.slice(before).length, productHttpRequests: issued.slice(before).filter(r=>r.endpoint.startsWith('/api/products')).length });
  };
  const input = (selector, value) => `const input=document.querySelector(${JSON.stringify(selector)});if(!input)throw new Error('Fixture input missing');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}))`;
  for (let run=1;run<=5;run++) {
    await runAction('fixture-checkout-opening-'+run, `window.dispatchEvent(new CustomEvent('oushadi-open-checkout',{detail:{source:'PROCEED_PAYMENT',cart:Array.from({length:30},(_,i)=>({_id:'000000000000000000000001-'+i,productId:'000000000000000000000001',kind:'PRODUCT',name:'Isolated benchmark item',saleMode:'PACKAGE',quantity:1,packageSellingPrice:123.45,gstRate:0,useDefaultGstRate:false})),cartCustomer:{name:'',phone:'',fulfilment:'COUNTER',consultationFeeEnabled:false},settings:{...window.__checkoutBenchmarkSettings,checkout:{enabled:true}}}}))`, `!!document.querySelector('#checkout-title')`);
    await runAction('fixture-cash-entry-'+run, input('[role="dialog"] input[type="number"]', '9999'), `!document.querySelector('[role="dialog"] button[type="submit"]') && [...document.querySelectorAll('[role="dialog"] button')].some(b=>b.textContent.includes('Complete')&&!b.disabled)`);
    await runAction('fixture-switch-upi-'+run, `const b=[...document.querySelectorAll('[role="dialog"] button')].find(b=>b.textContent.trim()==='UPI');if(!b)throw new Error('UPI unavailable in fixture');b.click()`, `!![...document.querySelectorAll('[role="dialog"] label')].find(l=>/reference/i.test(l.textContent))`);
    await runAction('fixture-reference-entry-'+run, input('[role="dialog"] label input:not([type="number"])', 'fixture-reference-'+run), `document.querySelector('[role="dialog"] label input:not([type="number"])')?.value==='fixture-reference-${run}'`);
    await runAction('fixture-switch-cash-'+run, `const b=[...document.querySelectorAll('[role="dialog"] button')].find(b=>b.textContent.trim()==='Cash');b.click()`, `!!document.querySelector('[role="dialog"] input[type="number"]')`);
    await runAction('fixture-checkout-cancel-'+run, `document.querySelector('[aria-label="Close checkout"]').click()`, `!document.querySelector('#checkout-title')`);
  }
  await evaluate('delete window.__checkoutBenchmarkSettings');
}
try {
  let target;
  for (let run = 0; run < 160; run++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(item => item.type === 'page' && item.url.startsWith(origin)); } catch {}
    if (target) break;
    if (child.exitCode !== null) throw new Error(`Electron exited (${child.exitCode}); diagnostic classifications: ${startupErrors.join(',') || 'none'}`);
    await delay(250);
  }
  if (!target) throw new Error('Electron debugger target unavailable');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const task = commands.get(message.id); if (!task) return;
      clearTimeout(task.timer); commands.delete(message.id);
      if (message.error) task.reject(new Error(`CDP error: ${message.error.code}`)); else task.resolve(message.result);
      return;
    }
    if (message.method === 'Fetch.requestPaused') {
      const { requestId, request } = message.params;
      const method = request.method.toUpperCase();
      const manualLogin = interactive && method === 'POST' && /\/api\/auth\/(username-login|pin-login|login)$/.test(new URL(request.url).pathname);
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !manualLogin) {
        report.writesBlocked++; void command('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }).catch(() => {});
      } else void command('Fetch.continueRequest', { requestId }).catch(() => {});
    }
    if (message.method === 'Network.requestWillBeSent') {
      const { requestId, request, timestamp } = message.params;
      const url = new URL(request.url);
      if (url.pathname.startsWith('/api/')) {
        const metadata = { endpoint: url.pathname, start: timestamp, method: request.method, hasSearch: url.searchParams.has('search'), targeted: url.searchParams.has('ids') };
        requests.set(requestId, metadata); issued.push(metadata);
      }
    }
    if (message.method === 'Network.responseReceived' && requests.has(message.params.requestId)) {
      Object.assign(requests.get(message.params.requestId), { status: message.params.response.status, serverTiming: message.params.response.headers['server-timing'] || message.params.response.headers['Server-Timing'] });
    }
    if (message.method === 'Network.loadingFinished' && requests.has(message.params.requestId)) {
      const request = requests.get(message.params.requestId);
      completed.push({ endpoint: request.endpoint, status: request.status, ms: +((message.params.timestamp - request.start) * 1000).toFixed(2), transferBytes: message.params.encodedDataLength, serverTiming: request.serverTiming });
      requests.delete(message.params.requestId);
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params.args[0]?.value === '[SalesPerf]') {
      const fields = message.params.args[1]?.preview?.properties || [];
      report.cacheOperations.push(Object.fromEntries(fields.filter(field => ['operation','ms','count','details','status','found'].includes(field.name)).map(field => [field.name, field.value])));
    }
    for (const callback of events.get(message.method) || []) callback(message.params);
  });
  await command('Runtime.enable'); await command('Network.enable');
  await command('Emulation.setFocusEmulationEnabled', { enabled: true });
  await command('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  report.engine = await command('Browser.getVersion');
  if (process.argv.includes('--session-stdin')) {
    // Transfer only our benchmark's same-origin session in memory. Never write cookies.
    let input = ''; for await (const chunk of process.stdin) input += chunk;
    const cookies = JSON.parse(input).filter(cookie => cookie.domain === new URL(origin).hostname);
    await command('Network.setCookies', { cookies });
    await command('Page.navigate', { url: origin + '/dashboard' });
  }
  let initial = await waitFor(state => state.ready === 'complete' && (state.salesLink || state.login));
  report.measurements.push({ name: 'process-launch-to-page-ready', ms: +(performance.now() - started).toFixed(2), page: initial.path });
  report.navigation = await evaluate(`(()=>{const n=performance.getEntriesByType('navigation')[0];return n?{domContentLoadedMs:+n.domContentLoadedEventEnd.toFixed(2),loadMs:+n.loadEventEnd.toFixed(2),responseStartMs:+n.responseStart.toFixed(2)}:null})()`);
  console.log(JSON.stringify({ stage: 'page-ready', ...initial, startupMs: report.measurements[0].ms }));
  if (interactive && initial.login) {
    console.log(JSON.stringify({ stage: 'waiting-for-user-login', timeoutSeconds: 900 }));
    report.authenticated = false;
    initial = await waitFor(state => state.ready === 'complete' && state.salesLink, 900000);
  }
  if (initial.login || !initial.salesLink) {
    report.authenticated = false;
    report.sales = 'Blocked: isolated Electron benchmark profile is signed out; login requires user interaction';
  } else {
    report.authenticated = true;
    await delay(12000); // Let the existing idle Sales prefetch finish.
    for (let run = 1; run <= 5; run++) {
      const before = issued.length;
      const sales = await clickRoute('/sales');
      report.measurements.push({ name: 'sales-opening-' + run, ...sales, productHttpRequests: issued.slice(before).filter(item => item.endpoint.startsWith('/api/products')).length });
      if (sales.timeout || sales.unavailable) break;
      await delay(750);
      const searchStart = issued.length;
      const search = await changeSearch(); await delay(700);
      report.measurements.push({ name: 'search-' + run, ...search, productHttpRequests: issued.slice(searchStart).filter(item => item.endpoint.startsWith('/api/products')).length });
      const clearStart = issued.length, clear = await changeSearch(true); await delay(500);
      report.measurements.push({ name: 'clear-' + run, ...clear, productHttpRequests: issued.slice(clearStart).filter(item => item.endpoint.startsWith('/api/products')).length });
      report.measurements.push({ name: 'sales-cycle-api-count-' + run, count: issued.slice(before).filter(item => item.endpoint.startsWith('/api/products')).length });
      const customers = await clickRoute('/customers');
      if (customers.unavailable || customers.timeout) break;
      await delay(500);
      console.log(JSON.stringify({ stage: 'sales-cycle', run, opening: sales, search }));
    }
    await clickRoute('/sales');
    report.activeCache = (await evaluate(dom)).cache;
    if (process.argv.includes('--stock-cards')) {
      const before=issued.length;
      report.stockCardVerification=await evaluate(`(async()=>{
        const rows=await new Promise(resolve=>{const r=indexedDB.open('oushadi-sales-cache');r.onsuccess=()=>{const db=r.result;const q=db.transaction('entries','readonly').objectStore('entries').getAll();q.onsuccess=()=>{db.close();resolve(q.result);};};r.onerror=()=>resolve([]);});
        const details=new Set(rows.filter(r=>r.kind==='detail').map(r=>r.id));
        const index=rows.filter(r=>r.kind==='index-row').map(r=>r.data);
        const row=index.find(r=>/pramehoushadhi/i.test(r.name)&&!details.has(r._id))||index.find(r=>!details.has(r._id)&&r.stockLabel);
        if(!row)return {unavailable:true};
        const input=document.querySelector('#pos-search');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,row.name);input.dispatchEvent(new Event('input',{bubbles:true}));
        const start=performance.now();let card;
        while(performance.now()-start<5000){card=[...document.querySelectorAll('.sales-product-card')].find(c=>c.querySelector('h2')?.textContent===row.name);if(card&&card.innerText.includes(row.stockLabel))break;await new Promise(r=>setTimeout(r,5));}
        await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
        return {indexOnlyProduct:true,expectedStockLabel:row.stockLabel,stockDisplayed:!!card?.innerText.includes(row.stockLabel),placeholderPresent:!!card?.innerText.includes('Select to check stock')};
      })()`);
      report.stockCardVerification.productHttpRequests=issued.slice(before).filter(r=>r.endpoint.startsWith('/api/products')).length;
      if (report.stockCardVerification.stockDisplayed) {
        const clip=await evaluate(`(()=>{const box=document.querySelector('.sales-product-card')?.getBoundingClientRect();return box?{x:box.x,y:box.y,width:box.width,height:box.height,scale:1}:null})()`);
        if (clip) {
          const shot=await command('Page.captureScreenshot',{format:'png',clip});
          const screenshot=`docs/${reportTag || 'stock-cards'}-${browser ? 'browser' : 'electron'}-card.png`;
          writeFileSync(screenshot,Buffer.from(shot.data,'base64'));report.stockCardVerification.screenshot=screenshot;
        }
      }
      await changeSearch(true);
    }
    if (report.activeCache === 'local') {
      const warmup = await measureCart();
      report.measurements.push({ name: 'cart-detail-warmup', ...warmup });
      if (!warmup.unavailable && !warmup.timeout) {
        await evaluate(`document.querySelector('.sales-cart-delete')?.click()`); await delay(100);
        for (let run = 1; run <= 5; run++) {
          const before = issued.length, cart = await measureCart();
          report.measurements.push({ name: 'cached-cart-add-' + run, ...cart, productHttpRequests: issued.slice(before).filter(item => item.endpoint.startsWith('/api/products')).length });
          if (run < 5) { await evaluate(`document.querySelector('.sales-cart-delete')?.click()`); await delay(100); }
        }
        const before = await evaluate(`document.querySelector('.sales-cart-list')?.innerText`);
        await changeSearch(); await changeSearch(true);
        report.cartSurvivesSearch = before === await evaluate(`document.querySelector('.sales-cart-list')?.innerText`);
        await evaluate(`document.querySelector('.sales-cart-delete')?.click()`);
      }
    }
    report.persistence = await evaluate(`new Promise(resolve=>{const r=indexedDB.open('oushadi-sales-cache');r.onsuccess=()=>{const db=r.result;if(!db.objectStoreNames.contains('entries')){db.close();resolve({missing:true});return;}const tx=db.transaction('entries','readonly'),q=tx.objectStore('entries').getAll();q.onsuccess=()=>{const counts={};for(const row of q.result)counts[row.kind]=(counts[row.kind]||0)+1;db.close();resolve(counts);};};r.onerror=()=>resolve({failed:true});})`);
    if (report.activeCache === 'local') for (const filter of ['Low Stock', 'Opened Stock']) {
      const clicked = await evaluate('(()=>{const b=[...document.querySelectorAll("#sales-category-filters button")].find(b=>b.textContent.trim()===' + JSON.stringify(filter) + ');b?.click();return !!b;})()');
      if (!clicked) continue;
      await delay(100); await waitFor(state => state.cache === 'local');
      for (let run=0; run<100 && requests.size; run++) await delay(100);
      for (let run=1; run<=5; run++) {
        const before=issued.length, result=await measureFilterSearch(); await delay(100);
        const clear=await measureFilterSearch(true); await delay(100);
        report.measurements.push({name: 'stock-filter-search-' + filter + '-' + run, ...result, clearMs:clear.ms, productHttpRequests:issued.slice(before).filter(item=>item.endpoint.startsWith('/api/products')).length});
      }
    }
    await evaluate('(()=>{const b=[...document.querySelectorAll("#sales-category-filters button")].find(b=>b.textContent.trim()==="All");b?.click();})()'); await delay(300);
    if (process.argv.includes('--checkout')) await measureCheckoutFixtures();
    const restoreStart = issued.length;
    await command('Page.reload');
    await waitFor(state => state.path === '/sales' && state.cards > 0 && state.cache === 'local');
    await delay(3000);
    report.measurements.push({ name: 'persistent-sales-reload', productHttpRequests: issued.slice(restoreStart).filter(item => item.endpoint.startsWith('/api/products')).length });
    if (!browser && process.argv.includes('--compare-browser')) {
      const cookies = (await command('Network.getCookies', { urls: [origin] })).cookies;
      const comparison = spawn(process.execPath, [fileURLToPath(import.meta.url), '--browser', '--session-stdin', ...(local ? ['--local'] : []), ...(phase ? ['--phase='+phase] : []), ...(reportTag ? ['--report-tag='+reportTag] : []), ...(process.argv.includes('--stock-cards') ? ['--stock-cards'] : []), ...(process.argv.includes('--checkout') ? ['--checkout'] : [])], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
      comparison.stdin.end(JSON.stringify(cookies));
      comparison.stdout.on('data', chunk => process.stdout.write(chunk));
      comparison.stderr.on('data', chunk => process.stderr.write(chunk));
      const code = await new Promise(resolve => comparison.once('exit', resolve));
      report.browserComparisonExitCode = code;
    }
  }
  report.apiRequests = completed;
  report.apiRequestStarts = issued;
  const file = `docs/${reportTag ? reportTag+'-' : ''}${phase ? 'pos-performance-'+phase+'-' : ''}${browser ? 'browser' : 'electron'}-${local ? 'local' : 'hosted'}-measurements.json`;
  writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ report: file, authenticated: report.authenticated, samples: report.measurements.length, writesBlocked: report.writesBlocked, ...(keepProfile ? { profileDirectory: profile } : {}) }));
} catch (error) {
  // Do not dump URLs, page contents, credentials or response bodies.
  report.error = error.message;
  report.authenticated ??= false;
  report.apiRequests = completed;
  writeFileSync(`docs/${reportTag ? reportTag+'-' : ''}${phase ? 'pos-performance-'+phase+'-' : ''}${browser ? 'browser' : 'electron'}-${local ? 'local' : 'hosted'}-failed-measurements.json`, JSON.stringify(report, null, 2) + '\n');
  console.error(JSON.stringify({ error: error.message, type: error.name })); process.exitCode = 1;
} finally {
  if (socket?.readyState === WebSocket.OPEN) { try { await Promise.race([command('Browser.close'), delay(1500)]); } catch {} socket.close(); }
  child.kill();
  for (const task of commands.values()) clearTimeout(task.timer);
  commands.clear();
  if (!keepProfile) { await delay(1200); try { rmSync(profile, { recursive:true, force:true, maxRetries:3, retryDelay:300 }); } catch { console.error(JSON.stringify({ cleanup: 'Owned diagnostic profile still locked', profileDirectory:profile })); } }
}
