// npm.cmd exec --yes --package=playwright -- node tests/word-heading.test.cjs
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
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[],alerts=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{alerts.push(d.message());await d.dismiss()});
 const output=fs.mkdtempSync(path.join(os.tmpdir(),'dlp-heading-'));
 await page.goto('http://127.0.0.1:8000/',{waitUntil:'networkidle'});
 const original=await page.evaluate(async()=>{
   window.qaTemplate=new PizZip(await(await fetch('./assets/fresh-template.docx')).arrayBuffer());
   const xml=new DOMParser().parseFromString(qaTemplate.file('word/document.xml').asText(),'application/xml');
   const ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
   const paragraphs=Array.from(xml.getElementsByTagNameNS(ns,'body')[0].children).filter(p=>p.localName==='p');
   const text=p=>Array.from(p.getElementsByTagNameNS(ns,'t')).map(t=>t.textContent).join('');
   const p=paragraphs.find(p=>text(p).startsWith('LESSON PLAN IN'));
   return {text:text(p),pPr:new XMLSerializer().serializeToString(p.getElementsByTagNameNS(ns,'pPr')[0]),rPr:new XMLSerializer().serializeToString(p.getElementsByTagNameNS(ns,'r')[0].getElementsByTagNameNS(ns,'rPr')[0])};
 });
 assert.ok(original.text.includes('PHILOSOPHY'));
 async function seed(subject,gradeLevel,language){
   await page.evaluate(({subject,gradeLevel,language})=>{
     const data={output_language:language,ai_declaration:'Teacher declaration',references:'Teacher references',objectives:{knowledge:'Identify',skills:'Analyze',behavior:'Respect'},learner_context:'',resources:'<b>HAYO:</b> Cards<br><b>HINAY:</b> Prompts',pre_lesson:'Review',days:[{title:'Lesson',content:'Teacher procedure'}],wrap_up:'Summarize',integration:'N/A',assessment:'Exit ticket',reflection:'Review after class',home_task:'Home task'};
     saveToHistory(data,{subject,gradeLevel,numDays:'1',selectedModel:'gemini-1.5-pro',contentStandard:'',performanceStandard:'',competency:'Identify ideas',userSuggestions:''});
     loadFromHistory(currentHistoryId);
   },{subject,gradeLevel,language});
 }
 async function download(name,heading,term){
   const pending=page.waitForEvent('download');await page.locator('button[onclick="downloadDoc()"]').click();
   const file=path.join(output,name+'.docx');await(await pending).saveAs(file);
   const info=await page.evaluate(base64=>{
     const ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
     const zip=new PizZip(base64,{base64:true});
     const xml=new DOMParser().parseFromString(zip.file('word/document.xml').asText(),'application/xml');
     if(xml.querySelector('parsererror'))throw new Error('Malformed XML');
     const table=xml.getElementsByTagNameNS(ns,'tbl')[0];
     const children=Array.from(table.parentNode.children);
     const paragraphs=children.slice(0,children.indexOf(table)).filter(p=>p.localName==='p');
     const text=p=>Array.from(p.getElementsByTagNameNS(ns,'t')).map(t=>t.textContent).join('');
     const p=paragraphs.find(p=>/^(LESSON PLAN IN|BANGHAY-ARALIN SA)/.test(text(p)));
     const unchanged=Object.keys(qaTemplate.files).filter(name=>!qaTemplate.files[name].dir&&name!=='word/document.xml').every(name=>zip.file(name)?.asUint8Array().toString()===qaTemplate.file(name).asUint8Array().toString());
     return {title:text(p),paragraphs:paragraphs.map(text),breaks:p.getElementsByTagNameNS(ns,'br').length,pPr:new XMLSerializer().serializeToString(p.getElementsByTagNameNS(ns,'pPr')[0]),rPr:new XMLSerializer().serializeToString(p.getElementsByTagNameNS(ns,'r')[0].getElementsByTagNameNS(ns,'rPr')[0]),unchanged};
   },fs.readFileSync(file).toString('base64'));
   assert.equal(info.title,heading);
   assert.ok(info.paragraphs.includes(term));
   assert.ok(!info.paragraphs.join(' ').includes('INTRODUCTION TO PHILOSOPHY'));
   assert.equal(info.breaks,0);
   assert.equal(info.pPr,original.pPr);assert.equal(info.rPr,original.rPr);
   assert.equal(info.unchanged,true,'Template package parts/logos must remain intact');
 }
 const filSubject='Pag-aaral ng Kasaysayan at Lipunang Pilipino';
 await seed(filSubject,'11','fil');
 const filHeading='BANGHAY-ARALIN SA '+filSubject.toUpperCase()+' 11';
 assert.equal(await page.locator('#lessonHeading').textContent(),filHeading);
 await download('filipino',filHeading,'Unang Termino (Taong Panuruan: 2026-2027)');
 await page.reload({waitUntil:'networkidle'});
 assert.equal(await page.locator('#lessonHeading').textContent(),filHeading);
 // The loaded template is needed only by the test to compare unchanged package parts.
 await page.evaluate(async()=>window.qaTemplate=new PizZip(await(await fetch('./assets/fresh-template.docx')).arrayBuffer()));
 await page.screenshot({path:path.join(output,'filipino-preview.png')});
 await seed('Science','7','en');
 await download('english','LESSON PLAN IN SCIENCE 7','Term 1 (SY: 2026-2027)');
 // A lesson title is distinct from its learning area.
 await page.locator('[data-field="subject"]').fill('An interesting lesson title');
 await page.locator('[data-field="learningArea"]').fill('Mathematics & Science');
 await page.locator('[data-field="gradeLevel"]').fill('9 - Sampaguita');
 assert.equal(await page.locator('#lessonHeading').textContent(),'LESSON PLAN IN MATHEMATICS & SCIENCE 9 - Sampaguita');
 await download('edited','LESSON PLAN IN MATHEMATICS & SCIENCE 9 - Sampaguita','Term 1 (SY: 2026-2027)');
 assert.deepEqual(errors,[]);assert.deepEqual(alerts,[]);
 console.log('Passed: actual school template, Filipino/English subjects and grades, edited learning area, history reload, XML validity, title typography, removal of sample forced break, and unchanged logos/package parts.');
 console.log('QA artifacts: '+output);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
