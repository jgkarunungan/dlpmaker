// npm.cmd exec --yes --package=playwright -- node tests/lesson-backup.test.cjs
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createRequire}=require('node:module');
const playwright=process.env.PATH.split(path.delimiter).map(p=>{try{return createRequire(path.join(p,'..','package.json'))('playwright')}catch{return null}}).find(Boolean);
if(!playwright)throw new Error('Run with npm exec --package=playwright.');
(async()=>{
 const browser=await playwright.chromium.launch({channel:'msedge',headless:true});
 try {
 const output=fs.mkdtempSync(path.join(os.tmpdir(),'dlp-backup-'));
 const source=await browser.newContext({viewport:{width:1440,height:1000}});
 const page=await source.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8000/',{waitUntil:'networkidle'});
 await page.evaluate(()=>{
   const data={output_language:'fil',ai_declaration:'Gemini lamang ang ginamit bilang gabay.',references:'Mga materyal ng guro.',objectives:{knowledge:'Natutukoy ang bagay.',skills:'Naiuuri ang bagay.',behavior:'Nakikipagtulungan.'},learner_context:'Lokal na halimbawa',resources:'<b>HAYO:</b> Larawan<br><b>HINAY:</b> Gabay',pre_lesson:'Magtanong sa klase.',days:[{title:'Unang aralin',content:'<b>Gawain</b><br>Suriin ang larawan.'},{title:'Ikalawang aralin',content:'Iulat ang sagot.'}],wrap_up:'Ibuod ang aralin.',integration:'Iugnay sa tahanan.',assessment:'Tatlong tanong',reflection:'Suriin ang pagkatuto.',home_task:'Magbigay ng halimbawa.',apiKey:'DO-NOT-EXPORT'};
   for(let n=0;n<17;n++)saveToHistory({...data,objectives:{...data.objectives},days:data.days.map(d=>({...d}))},{subject:'Aralin '+n,gradeLevel:'7',numDays:'2',selectedModel:'gemini-1.5-pro',contentStandard:'Pamantayan '+n,performanceStandard:'Pagganap '+n,competency:'Natutukoy ang bagay '+n,userSuggestions:'Gumamit ng lokal na halimbawa.'});
   history[0].apiKey='DO-NOT-EXPORT';
   loadFromHistory(history[0].id);
   document.getElementById('apiKey').value='DO-NOT-EXPORT';
 });
 const edits={subject:'Binagong Pamagat',learningArea:'Agham',gradeLevel:'7 - Sampaguita',numSessions:'Dalawang sesyon',teacherName:'QA Teacher',competency_standard:'Binagong kasanayan',objectives_knowledge:'Binagong layunin',day_0:'<b>Binagong gawain</b>'};
 for(const [field,text] of Object.entries(edits)) await page.locator('[data-field="'+field+'"]').first().fill(text);
 // Use actual formatting in an edited field.
 await page.locator('[data-field="day_0"]').evaluate(el=>{el.innerHTML='<b>Binagong gawain</b>';el.dispatchEvent(new Event('input',{bubbles:true}))});
 const pending=page.waitForEvent('download');
 await page.getByRole('button',{name:'Save all lessons (.json)'}).click();
 const download=await pending;
 const file=path.join(output,'lessons.json');await download.saveAs(file);
 const raw=fs.readFileSync(file,'utf8'), backup=JSON.parse(raw);
 assert.equal(backup.lessons.length,17);
 assert.ok(!raw.includes('DO-NOT-EXPORT'));
 assert.equal(backup.lessons[0].selectedModel,'gemini-1.5-pro');
 await page.screenshot({path:path.join(output,'backup-panel.png')});
 // A separate browser context represents another device with existing local work.
 const destination=await browser.newContext({viewport:{width:1440,height:1000}});
 const restored=await destination.newPage();restored.on('pageerror',e=>errors.push(e.message));
 await restored.goto('http://127.0.0.1:8000/',{waitUntil:'networkidle'});
 await restored.evaluate(first=>{
   const item=JSON.parse(JSON.stringify(first));item.subject='Existing device lesson';item.data.subject='Existing device lesson';
   history=[item];localStorage.setItem('dlp_history',JSON.stringify(history));renderHistoryList();
   document.getElementById('apiKey').value='KEEP-LOCAL-KEY';localStorage.setItem('apiKey','KEEP-LOCAL-KEY');
 },backup.lessons[0]);
 await restored.locator('#backupFile').setInputFiles(file);
 await restored.waitForFunction(()=>document.getElementById('backupStatus').textContent.includes('Restored 17'));
 assert.equal(await restored.evaluate(()=>history.length),18);
 assert.equal(await restored.locator('#apiKey').inputValue(),'KEEP-LOCAL-KEY');
 assert.equal(await restored.locator('#contentStandard').inputValue(),'Pamantayan 16');
 assert.equal(await restored.locator('#performanceStandard').inputValue(),'Pagganap 16');
 assert.equal(await restored.locator('#userSuggestions').inputValue(),'Gumamit ng lokal na halimbawa.');
 assert.equal(await restored.locator('#numDays').inputValue(),'2');
 assert.equal(await restored.locator('#modelSelect').inputValue(),'gemini-1.5-pro');
 for(const [field,text] of Object.entries(edits)) {
   const actual=await restored.locator('[data-field="'+field+'"]').first().textContent();
   assert.equal(actual,field==='day_0'?'Binagong gawain':text,field);
 }
 assert.equal(await restored.locator('[data-field="day_0"] b').count(),1);
 await restored.reload({waitUntil:'networkidle'});
 assert.equal(await restored.locator('[data-field="learningArea"]').innerText(),'Agham');
 const ids=await restored.evaluate(()=>history.map(item=>item.id));assert.equal(new Set(ids).size,18);
 await restored.locator('#backupFile').setInputFiles(file);
 await restored.waitForFunction(()=>document.getElementById('backupStatus').textContent.includes('Restored 0'));
 assert.equal(await restored.evaluate(()=>history.length),18);
 const wordPending=restored.waitForEvent('download');
 await restored.locator('button[onclick="downloadDoc()"]').click();
 const word=await wordPending;const wordFile=path.join(output,'restored.docx');await word.saveAs(wordFile);
 const wordText=await restored.evaluate(base64=>new PizZip(base64,{base64:true}).file('word/document.xml').asText(),fs.readFileSync(wordFile).toString('base64'));
 for(const value of ['Binagong Pamagat','Agham','Binagong kasanayan','Binagong layunin','Binagong gawain'])assert.ok(wordText.includes(value),value);
 const before=await restored.evaluate(()=>localStorage.getItem('dlp_history'));
 for(const invalid of ['not json',JSON.stringify({format:'ai-dlp-maker-backup',version:99,lessons:backup.lessons}),JSON.stringify({...backup,lessons:[backup.lessons[0],{id:2}]})]){
   await restored.locator('#backupFile').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(invalid)});
   await restored.waitForFunction(()=>document.getElementById('backupStatus').classList.contains('text-red-700'));
   assert.equal(await restored.evaluate(()=>localStorage.getItem('dlp_history')),before);
 }
 // Untrusted JSON can carry formatting, but cannot execute scripts or handlers.
 const malicious=JSON.parse(raw);malicious.lessons=[malicious.lessons[0]];malicious.lessons[0].subject='<img src=x onerror="window.backupPwned=1">';
 malicious.lessons[0].data.pre_lesson='<script>window.backupPwned=1</script><b onclick="window.backupPwned=1">Safe text</b>';
 await restored.locator('#backupFile').setInputFiles({name:'safe.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(malicious))});
 await restored.waitForFunction(()=>document.getElementById('backupStatus').textContent.includes('Restored 1'));
 assert.equal(await restored.evaluate(()=>window.backupPwned),undefined);
 assert.equal(await restored.locator('[data-field="pre_lesson"] [onclick]').count(),0);
 // Quota failures must preserve stored and visible lessons.
 await restored.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('Full','QuotaExceededError')}});
 const visible=await restored.locator('#dlpContent').innerHTML();
 await restored.locator('#backupFile').setInputFiles(file);
 await restored.waitForFunction(()=>document.getElementById('backupStatus').textContent.includes('storage is full'));
 assert.equal(await restored.locator('#dlpContent').innerHTML(),visible);
 await restored.screenshot({path:path.join(output,'backup-controls.png')});
 assert.deepEqual(errors,[]);
 console.log('Passed: real JSON download; 17 lessons; fresh-device merge; ID collisions; deduplication; API-key exclusion; setup, edits and Word export; reload; invalid-file atomicity; sanitization; quota failure.');
 console.log('QA artifacts: '+output);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
