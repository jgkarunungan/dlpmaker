// npm.cmd exec --yes --package=playwright -- node tests/integration-refinement.test.cjs
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {createRequire}=require('node:module');
const playwright=process.env.PATH.split(path.delimiter).map(p=>{try{return createRequire(path.join(p,'..','package.json'))('playwright')}catch{return null}}).find(Boolean);
if(!playwright)throw new Error('Run using npm exec --package=playwright.');
(async()=>{
 const browser=await playwright.chromium.launch({channel:'msedge',headless:true});
 try {
 const page=await browser.newPage();
 const errors=[],alerts=[],prompts=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{alerts.push(d.message());await d.dismiss()});
 let response='<ul><li><b>Literasiya:</b> Sa ARAW 2, pagsusuri ng talata ang nagsasanay ng pag-unawa sa binasa.</li></ul>';
 let fail=false, gate=null, release=null;
 await page.route('https://generativelanguage.googleapis.com/**',async route=>{
   prompts.push(route.request().postDataJSON().contents[0].parts[0].text);
   if(gate)await gate;
   await route.fulfill(fail?{status:400,json:{error:{message:'Simulated failure'}}}:{json:{candidates:[{content:{parts:[{text:response}]}}]}});
 });
 await page.goto('http://127.0.0.1:8000/',{waitUntil:'networkidle'});
 await page.evaluate(()=>{
   const data={output_language:'fil',ai_declaration:'Pahayag ng guro',references:'Mga sanggunian',objectives:{knowledge:'Natutukoy ang opinyon.',skills:'Nasusuri ang pahayag.',behavior:'Iginagalang ang iba.'},learner_context:'',resources:'Mga larawan',pre_lesson:'Balikan ang aralin.',days:[{title:'Paghahambing',content:'Maghambing ng dalawang pahayag.'},{title:'Pagsusuri',content:'Basahin at suriin ang talata tungkol sa pamayanan.'}],integration:'N/A',wrap_up:'Ibuod ang natutuhan.',assessment:'Sagutin ang tanong.',home_task:'Magbigay ng halimbawa.',reflection:'Suriin ang pagkatuto.'};
   const setup={subject:'Pilosopiya',gradeLevel:'12',numDays:'2',competency:'Natutukoy ang katotohanan at opinyon.',contentStandard:'Pag-unawa sa mga pahayag',performanceStandard:'Pagsusuri ng pahayag',userSuggestions:'',selectedModel:'gemini-1.5-pro'};
   saveToHistory(JSON.parse(JSON.stringify(data)),setup);
   saveToHistory(JSON.parse(JSON.stringify(data)),{...setup,subject:'Ikalawang Aralin'});
   loadFromHistory(history[1].id);
   document.getElementById('apiKey').value='test-key-intercepted';
 });
 const originalId=await page.evaluate(()=>currentHistoryId);
 // Include the most recent manual edits to the flow in the refinement request.
 await page.locator('[data-field="day_1"]').fill('Basahin at suriin ang talata tungkol sa lokal na pamayanan.');
 const snapshot=()=>page.evaluate(()=>JSON.parse(JSON.stringify({data:currentParsedData,history})));
 const before=await snapshot();
 const otherHtml=await page.locator('#dlpContent [data-field]').evaluateAll(els=>els.filter(el=>el.dataset.field!=='integration').map(el=>el.outerHTML));
 async function refine(field='integration'){
   await page.locator('[data-field="'+field+'"]').evaluate(el=>{
     const range=document.createRange();range.selectNodeContents(el);
     const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
     el.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,clientX:300,clientY:200}));
   });
   if(field==='integration')await page.locator('[data-field="integration"]').click();
   await page.locator('#refinePrompt').fill('Regenerate this section.');
   await page.locator('#refineBtn').click();
 }
 await refine();
 await page.waitForFunction(()=>!document.getElementById('refineBtn').disabled);
 assert.ok(prompts[0].includes('OPPORTUNITIES FOR INTEGRATION'));
 assert.ok(prompts[0].includes('TARGET OUTPUT LANGUAGE: FILIPINO'));
 assert.ok(prompts[0].includes('lokal na pamayanan'));
 assert.ok(prompts[0].includes('"day":1')&&prompts[0].includes('"day":2'));
 assert.ok(prompts[0].includes('Do not add activities'));
 assert.ok(!prompts[0].includes('Substitute-Ready'));
 const after=await snapshot();
 assert.deepEqual(after.data,{...before.data,integration:response});
 const expectedHistory=before.history.map(item=>item.id===originalId?{...item,data:{...item.data,integration:response}}:item);
 assert.deepEqual(after.history.map(({editHistory,...item})=>item),expectedHistory.map(({editHistory,...item})=>item));
 assert.ok(after.history.find(item=>item.id===originalId).editHistory.past.length>0);
 assert.deepEqual(await page.locator('#dlpContent [data-field]').evaluateAll(els=>els.filter(el=>el.dataset.field!=='integration').map(el=>el.outerHTML)),otherHtml);
 await page.reload({waitUntil:'networkidle'});
 assert.equal(await page.locator('[data-field="integration"] li').count(),1);
 const downloadPromise=page.waitForEvent('download');await page.locator('button[onclick="downloadDoc()"]').click();
 const download=await downloadPromise;const out=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'dlp-refine-')),'lesson.docx');await download.saveAs(out);
 const xml=await page.evaluate(base64=>new PizZip(base64,{base64:true}).file('word/document.xml').asText(),fs.readFileSync(out).toString('base64'));
 assert.ok(xml.includes('Literasiya:'));assert.ok(xml.includes('ARAW 2'));
 // Generic refinement keeps its existing prompt and modifies only its own field.
 response='Bagong listahan ng kagamitan';await refine('resources');
 await page.waitForFunction(()=>!document.getElementById('refineBtn').disabled);
 assert.ok(prompts.at(-1).includes('ADAPTIVITY RULE'));
 assert.ok(!prompts.at(-1).includes('Completed Learning Flow'));
 // N/A is valid, and failure must leave data/history unchanged.
 response='N/A';await refine();await page.waitForFunction(()=>!document.getElementById('refineBtn').disabled);
 assert.equal(await page.locator('[data-field="integration"]').innerText(),'N/A');
 const preFailure=await snapshot();fail=true;await refine();await page.waitForFunction(()=>!document.getElementById('refineBtn').disabled);
 assert.deepEqual(await snapshot(),preFailure);assert.ok(alerts.at(-1).includes('Simulated failure'));
 // An in-flight request cannot alter a different plan after switching history.
 fail=false;response='<ul><li>Late response</li></ul>';gate=new Promise(resolve=>release=resolve);
 const count=prompts.length;await refine();await page.waitForFunction(n=>document.getElementById('refineBtn').disabled,count);
 while(prompts.length===count)await new Promise(resolve=>setTimeout(resolve,20));
 await page.evaluate(()=>loadFromHistory(history.find(item=>item.id!==currentHistoryId).id));
 const switched=await snapshot();release();gate=null;
 await page.waitForFunction(()=>!document.getElementById('refineBtn').disabled);
 assert.deepEqual(await snapshot(),switched);assert.ok(alerts.at(-1).includes('selected lesson changed'));
 assert.deepEqual(errors,[]);
 console.log('Passed: UI selection, shared integration rules, full edited flow, saved language, only-field update, history/reload, DOCX, generic refinement, N/A, failure preservation, and lesson-switch protection. No live AI calls.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
