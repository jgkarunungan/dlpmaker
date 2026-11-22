// npm.cmd exec --yes --package=playwright -- node tests/lesson-editor.test.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createRequire}=require('node:module');
const playwright=process.env.PATH.split(path.delimiter).map(p=>{try{return createRequire(path.join(p,'..','package.json'))('playwright')}catch{return null}}).find(Boolean);
if(!playwright)throw new Error('Run with npm exec --package=playwright.');
(async()=>{
 const browser=await playwright.chromium.launch({channel:'msedge',headless:true});
 try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://generativelanguage.googleapis.com/**',r=>r.fulfill({json:{candidates:[{content:{parts:[{text:'<ul><li>AI revised integration</li></ul>'}]}}]}}));
 await page.goto('http://127.0.0.1:8000/',{waitUntil:'networkidle'});
 const ids=await page.evaluate(()=>{
   const data={output_language:'en',ai_declaration:'Declaration',references:'References',objectives:{knowledge:'Knowledge',skills:'Skills',behavior:'Behavior'},learner_context:'',resources:'<b>HAYO:</b> Cards<br><b>HINAY:</b> Guide',pre_lesson:'Opening',days:[{title:'Session one',content:'Original activity'},{title:'Session two',content:'Second activity'}],wrap_up:'Closing',integration:'Original integration',assessment:'Assessment',reflection:'Reflection',home_task:'Homework'};
   const setup={subject:'Science',gradeLevel:'7',numDays:'2',selectedModel:'gemini-1.5-pro',contentStandard:'Original content standard',performanceStandard:'Original performance standard',competency:'Original competency',userSuggestions:'Original suggestions'};
   saveToHistory(JSON.parse(JSON.stringify(data)),setup);const first=currentHistoryId;
   saveToHistory(JSON.parse(JSON.stringify(data)),{...setup,subject:'Other subject'});const second=currentHistoryId;
   loadFromHistory(first);return {first,second};
 });
 const edits={subject:'New lesson title',learningArea:'Environmental Science',teacherName:'Edited Teacher',gradeLevel:'8 - Sampaguita',numSessions:'Two meetings',termLabel:'Term 2 (SY: 2027-2028)',references:'',ai_declaration:'Teacher reviewed declaration',competency_standard:'Edited competency',objectives_knowledge:'Edited knowledge',objectives_skills:'Edited skills',objectives_behavior:'Edited behavior',learner_context:'Edited context',resources:'HAYO: Edited materials HINAY: Edited support',pre_lesson:'Edited opening',day_title_0:'New session title',day_0:'Edited first activity',day_title_1:'Second session title',day_1:'Edited second activity',wrap_up:'Edited closing',integration:'Edited integration',assessment:'Edited assessment',home_task:'Edited homework',reflection:'Edited reflection'};
 for(const [field,value] of Object.entries(edits))await page.locator('[data-field="'+field+'"]').first().fill(value);
 // Nested formatting events must save to their enclosing field.
 await page.locator('[data-field="objectives_knowledge"]').evaluate(el=>{
   el.innerHTML='<b>Nested knowledge</b>';el.firstChild.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertFromPaste'}));
 });
 assert.equal(await page.locator('[data-field="teacherName"]').nth(1).textContent(),'Edited Teacher');
 assert.ok((await page.locator('#lessonHeading').textContent()).includes('ENVIRONMENTAL SCIENCE 8 - Sampaguita'));
 assert.equal(await page.locator('#subject').inputValue(),'Science','Original setup must stay intact');
 assert.equal(await page.locator('#gradeLevel').inputValue(),'7');
 assert.match(await page.locator('#lessonSaveStatus').innerText(),/^Saved/);
 await page.locator('#undoLessonBtn').click();
 assert.equal(await page.locator('[data-field="objectives_knowledge"]').innerText(),'Edited knowledge');
 await page.locator('#redoLessonBtn').click();
 assert.equal(await page.locator('[data-field="objectives_knowledge"] b').innerText(),'Nested knowledge');
 // Keyboard undo/redo and the revision history survive reload.
 await page.reload({waitUntil:'networkidle'});
 for(const [field,value] of Object.entries(edits)){
   if(field==='objectives_knowledge')continue;
   assert.equal(await page.locator('[data-field="'+field+'"]').first().textContent(),value,field);
 }
 await page.locator('[data-field="objectives_knowledge"]').focus();
 await page.keyboard.press('Control+z');assert.equal(await page.locator('[data-field="objectives_knowledge"]').textContent(),'Edited knowledge');
 await page.keyboard.press('Control+Shift+z');assert.equal(await page.locator('[data-field="objectives_knowledge"] b').textContent(),'Nested knowledge');
 // AI revision is one undoable edit.
 const preAi=await page.evaluate(()=>JSON.parse(JSON.stringify(currentParsedData)));
 await page.locator('#apiKey').fill('intercepted-test-key');
 await page.locator('[data-field="integration"]').click();await page.locator('#refinePrompt').fill('Revise integration.');await page.locator('#refineBtn').click();
 await page.waitForFunction(()=>!document.getElementById('refineBtn').disabled);
 assert.equal(await page.locator('[data-field="integration"] li').textContent(),'AI revised integration');
 await page.locator('#undoLessonBtn').click();assert.deepEqual(await page.evaluate(()=>currentParsedData),preAi);
 await page.locator('#redoLessonBtn').click();
 // Compare actual downloaded Word contents, including an intentionally blank field.
 const output=fs.mkdtempSync(path.join(os.tmpdir(),'dlp-editor-'));
 const wordPromise=page.waitForEvent('download');await page.locator('button[onclick="downloadDoc()"]').click();
 const wordFile=path.join(output,'edited.docx');await(await wordPromise).saveAs(wordFile);
 const word=await page.evaluate(base64=>{
   const zip=new PizZip(base64,{base64:true});const doc=new DOMParser().parseFromString(zip.file('word/document.xml').asText(),'application/xml');
   const ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
   const rows=Array.from(doc.getElementsByTagNameNS(ns,'tbl')[0].getElementsByTagNameNS(ns,'tr'));
   return {text:doc.documentElement.textContent,reference:Array.from(rows[5].children).filter(n=>n.localName==='tc')[1].textContent};
 },fs.readFileSync(wordFile).toString('base64'));
 assert.equal(word.reference,'');
 for(const value of ['New lesson title','Environmental Science','Edited Teacher','Term 2 (SY: 2027-2028)','New session title','Nested knowledge','AI revised integration'])assert.ok(word.text.includes(value),value);
 const jsonPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Save all lessons (.json)'}).click();
 const jsonFile=path.join(output,'backup.json');await(await jsonPromise).saveAs(jsonFile);
 const fresh=await browser.newPage();await fresh.goto('http://127.0.0.1:8000/',{waitUntil:'networkidle'});
 await fresh.locator('#backupFile').setInputFiles(jsonFile);await fresh.waitForFunction(()=>document.getElementById('backupStatus').textContent.includes('Restored 2'));
 assert.equal(await fresh.locator('[data-field="termLabel"]').textContent(),edits.termLabel);
 assert.equal(await fresh.locator('[data-field="day_title_0"]').textContent(),edits.day_title_0);
 assert.equal(await fresh.locator('[data-field="objectives_knowledge"] b').textContent(),'Nested knowledge');
 // Undo stacks are per lesson and a new edit discards redo.
 await page.evaluate(id=>loadFromHistory(id),ids.second);assert.equal(await page.locator('#undoLessonBtn').isDisabled(),true);
 await page.evaluate(id=>loadFromHistory(id),ids.first);assert.equal(await page.locator('#undoLessonBtn').isEnabled(),true);
 await page.locator('#undoLessonBtn').click();await page.locator('[data-field="integration"]').fill('Replacement after undo');
 assert.equal(await page.locator('#redoLessonBtn').isDisabled(),true);
 // Bound persistent history and group normal typing into useful undo steps.
 for(let n=0;n<35;n++){await page.evaluate(()=>resetLessonEditGroup());await page.locator('[data-field="assessment"]').fill('Revision '+n)}
 assert.equal(await page.evaluate(()=>history.find(h=>h.id===currentHistoryId).editHistory.past.length),30);
 await page.locator('[data-field="assessment"]').focus();await page.keyboard.press('End');
 await page.keyboard.type(' abc');
 await page.keyboard.press('Control+z');
 assert.equal(await page.locator('[data-field="assessment"]').textContent(),'Revision 34');
 // Failed browser storage must be visible and the current edit remains recoverable in memory.
 const stored=await page.evaluate(()=>localStorage.getItem('dlp_history'));
 await page.evaluate(()=>{window.qaSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('Full','QuotaExceededError')}});
 await page.locator('[data-field="reflection"]').fill('Unsaved but recoverable');
 assert.match(await page.locator('#lessonSaveStatus').innerText(),/not saved/);
 assert.equal(await page.evaluate(()=>localStorage.getItem('dlp_history')),stored);
 assert.equal(await page.evaluate(()=>history.find(h=>h.id===currentHistoryId).data.reflection),'Unsaved but recoverable');
 await page.evaluate(()=>Storage.prototype.setItem=window.qaSetItem);
 await page.locator('#retryLessonSaveBtn').click();assert.match(await page.locator('#lessonSaveStatus').innerText(),/^Saved/);
 await page.locator('main').evaluate(el=>el.scrollTop=0);await page.screenshot({path:path.join(output,'editor.png')});
 assert.deepEqual(errors,[]);
 console.log('Passed: every editable field, nested formatting, auto-save, original setup, mirrored teacher name, 30-step persistent undo/redo, keyboard/grouped typing, AI undo, history isolation, blank fields, JSON restore, Word content, storage failures and retry. No live AI calls.');
 console.log('QA artifacts: '+output);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
