// Windows: npm.cmd exec --yes --package=playwright -- node tests/lesson-language.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const {resolveLessonLanguage, lessonLabel, aiUseDeclaration} = require('../lesson-language');
assert.equal(resolveLessonLanguage({}, {subject:'Science',competency:'Natutukoy ang mga katangian ng bagay.'}), 'fil');
assert.equal(resolveLessonLanguage({}, {subject:'Filipino',competency:'The learners identify and explain the main idea.'}), 'en');
assert.equal(resolveLessonLanguage({}, {competency:'Natutukoy ang bagay',userSuggestions:'Use English'}), 'en');
assert.equal(resolveLessonLanguage({output_language:'Filipino'}), 'fil');
assert.equal(resolveLessonLanguage({output_language:'en'}, {competency:'Natutukoy ang bagay'}), 'en');
assert.equal(lessonLabel('en','Lesson Title'), 'Lesson Title');
const html = fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
const playwright = process.env.PATH.split(path.delimiter).map(p=>{
 try{return createRequire(path.join(p,'..','package.json'))('playwright')}catch{return null}
}).find(Boolean);
if(!playwright) throw new Error('Run using npm exec --package=playwright.');
(async()=>{
 const browser=await playwright.chromium.launch({channel:'msedge',headless:true});
 try {
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.dismiss());
 const output=fs.mkdtempSync(path.join(os.tmpdir(),'dlp-language-'));
 const base={ai_declaration:'Ginamit ang AI sa pagbuo ng burador.',references:'Mga materyal ng guro.',objectives:{knowledge:'Natutukoy ang mga katangian ng bagay.',skills:'Naiuuri ang mga bagay.',behavior:'Nakikipagtulungan sa pangkat.'},learner_context:'',resources:'<b>A. HAYO:</b> Larawan ng mga bagay.<br><b>B. HINAY:</b> Mga gabay na tanong.',pre_lesson:'Magpapakita ang guro ng mga larawan.',days:[{title:'Mga Katangian ng Bagay',content:'<b>Gawain</b><br>Susuriin ng mga mag-aaral ang mga larawan.'}],wrap_up:'Ibubuod ng mga mag-aaral ang natutuhan.',integration:'<ul><li><b>Literasiya:</b> Sa ARAW 1, binibigyang-kahulugan ng mga mag-aaral ang mga larawang sinusuri sa gawain upang malinang ang kanilang pag-unawa sa biswal na impormasyon.</li></ul>',assessment:'Sagutin ang tatlong tanong.',home_task:'Magtala ng tatlong halimbawa.',reflection:'Suriin ang pagkatuto ng mga mag-aaral.'};
 let responseLesson={...base,output_language:'fil'};
 await page.route('https://generativelanguage.googleapis.com/**',async route=>{
   const prompt=route.request().postDataJSON().contents[0].parts[0].text;
   assert.ok(prompt.includes('"output_language"'));
   assert.ok(prompt.includes(aiUseDeclaration('fil')));
   assert.ok(prompt.includes(aiUseDeclaration('en')));
   assert.ok(prompt.includes('OPPORTUNITIES FOR INTEGRATION (integration)'));
   assert.ok(prompt.includes('specific day and existing task'));
   assert.ok(prompt.includes('Do not add activities, materials, technologies, assessments, or learner actions'));
   assert.ok(prompt.includes('return exactly "N/A"'));
   assert.ok(!prompt.includes('Hands-on integration activity'));
   await route.fulfill({json:{candidates:[{content:{parts:[{text:JSON.stringify(responseLesson)}]}}]}});
 });
 await page.goto('http://127.0.0.1:8000/',{waitUntil:'networkidle'});
 for(const [id,value] of Object.entries({apiKey:'test-key-intercepted',subject:'Science',gradeLevel:'7',contentStandard:'Naipamamalas ang pag-unawa sa mga katangian ng bagay.',performanceStandard:'Naiuuri ang mga bagay sa kapaligiran.',competency:'Natutukoy ang mga katangian ng bagay.'})) await page.locator('#'+id).fill(value);
 await page.locator('#numDays').selectOption('1');
 await page.locator('#generateBtn').click();
 await page.waitForFunction(()=>!document.getElementById('outputContainer').classList.contains('hidden'));
 const filLabels=['Pamagat ng Aralin','Asignatura','Pangalan ng Guro','Baitang at Pangkat','Bilang ng Sesyon','Mga Sanggunian','Pagpapahayag ng Paggamit ng AI','Kasanayan sa Pagkatuto at mga Pamantayan ng Kurikulum','Mga Layunin sa Pagkatuto','Kalagayan ng mga Mag-aaral','Mga Kagamitan sa Pagkatuto','Gawain Bago ang Aralin','Daloy ng Aralin','Mga Pagkakataon para sa Integrasyon','Pormatibong Pagtataya','Mga Gawain para sa Karagdagang Pagkatuto','Pagninilay sa Pagtuturo'];
 let preview=await page.locator('#dlpContent').innerText();
 for(const label of filLabels)assert.ok(preview.includes(label),label);
 assert.ok(!preview.includes('Lesson Title'));
 assert.ok(preview.includes('ARAW 1'));
 assert.equal(await page.locator('[data-field="integration"] li').count(),1);
 assert.equal(await page.locator('[data-field="ai_declaration"]').innerText(), aiUseDeclaration('fil'));
 await page.reload({waitUntil:'networkidle'});
 assert.ok((await page.locator('#dlpContent').innerText()).includes('Pamagat ng Aralin'));
 async function inspectDownload(name){
   const pending=page.waitForEvent('download');
   await page.locator('button[onclick="downloadDoc()"]').click();
   const download=await pending;
   const file=path.join(output,name+'.docx'); await download.saveAs(file);
   const bytes=fs.readFileSync(file).toString('base64');
   return page.evaluate(base64=>{
     const zip=new PizZip(base64,{base64:true});
     const xml=new DOMParser().parseFromString(zip.file('word/document.xml').asText(),'application/xml');
     if(xml.querySelector('parsererror'))throw new Error('Malformed XML');
     return Array.from(xml.getElementsByTagNameNS('*','tbl')[0].getElementsByTagNameNS('*','tr')).map(row=>Array.from(row.children).filter(n=>n.localName==='tc').map(cell=>cell.textContent));
   },bytes);
 }
 const filRows=await inspectDownload('filipino');
 assert.equal(filRows[6][1], aiUseDeclaration('fil'));
 assert.ok(filRows[17][1].includes('Literasiya:'));
 assert.ok(filRows[17][1].includes('ARAW 1'));
 assert.ok(!filRows[17][1].includes('<li>'));
 // A teacher's edits must survive reopening; the default is only applied on generation.
 await page.locator('[data-field="ai_declaration"]').fill('Gemini lamang ang ginamit bilang gabay.');
 await page.reload({waitUntil:'networkidle'});
 assert.equal(await page.locator('[data-field="ai_declaration"]').innerText(), 'Gemini lamang ang ginamit bilang gabay.');
 for(const label of filLabels)assert.ok(filRows.flat().join('\n').includes(label),'DOCX: '+label);
 assert.ok(filRows[16][1].includes('ARAW 1'));
 assert.ok(filRows[9][1].includes('Kaalaman:'));
 assert.ok(filRows[9][1].includes(base.objectives.knowledge));
 assert.ok(filRows[14][1].includes('HAYO:')&&filRows[14][1].includes('HINAY:'));
 // Legacy history without metadata must translate using its original inputs.
 await page.evaluate(()=>{
   const saved=JSON.parse(localStorage.getItem('dlp_history'));delete saved[0].data.output_language;
   localStorage.setItem('dlp_history',JSON.stringify(saved));
 });
 await page.reload({waitUntil:'networkidle'});
 assert.ok((await page.locator('#dlpContent').innerText()).includes('Pamagat ng Aralin'));
 await page.locator('main').evaluate(el=>el.scrollTop=0);
 await page.screenshot({path:path.join(output,'filipino-preview.png')});
 responseLesson={...base,output_language:'en',integration:'N/A',objectives:{knowledge:'Identify properties of matter.',skills:'Classify objects.',behavior:'Work together.'},pre_lesson:'The teacher displays pictures.',days:[{title:'Matter',content:'Students classify the pictures.'}]};
 await page.locator('#competency').fill('The learners identify properties of matter.');
 await page.locator('#generateBtn').click();
 await page.waitForFunction(()=>currentParsedData.output_language==='en'&&!document.getElementById('outputContainer').classList.contains('hidden'));
 preview=await page.locator('#dlpContent').innerText();assert.ok(preview.includes('Lesson Title'));assert.ok(!preview.includes('Pamagat ng Aralin'));
 const enRows=await inspectDownload('english');
 assert.equal(enRows[6][1], aiUseDeclaration('en'));
 assert.equal(await page.locator('[data-field="ai_declaration"]').innerText(), aiUseDeclaration('en'));
 assert.equal(enRows[0][0],'Lesson Title');
 assert.equal(await page.locator('[data-field="integration"]').innerText(),'N/A');
 assert.equal(enRows[17][1],'N/A');
 assert.ok(enRows[9][1].includes('Knowledge:'));
 assert.ok(enRows[16][1].includes('DAY 1'));
 assert.deepEqual(errors,[]);
 console.log('Passed: language selection, prompt metadata, Filipino and English previews, history/legacy history, actual DOCX downloads and translated template labels. No live AI request made.');
 console.log('QA artifacts: '+output);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
