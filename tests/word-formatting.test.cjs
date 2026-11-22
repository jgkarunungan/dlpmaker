// npm.cmd exec --yes --package=playwright -- node tests/word-formatting.test.cjs
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createRequire}=require('node:module');
const playwright=process.env.PATH.split(path.delimiter).map(p=>{try{return createRequire(path.join(p,'..','package.json'))('playwright')}catch{return null}}).find(Boolean);
if(!playwright)throw new Error('Run with npm exec --package=playwright.');
(async()=>{
 const browser=await playwright.chromium.launch({channel:'msedge',headless:true});
 try{
 const page=await browser.newPage();
 const alerts=[];page.on('dialog',async d=>{alerts.push(d.message());await d.dismiss()});
 await page.goto('http://127.0.0.1:8000/',{waitUntil:'networkidle'});
 const output=fs.mkdtempSync(path.join(os.tmpdir(),'dlp-format-'));
 for(const language of ['fil','en']){
   await page.evaluate(language=>{
     const data={output_language:language,ai_declaration:'Teacher declaration',references:'Teacher references',objectives:{knowledge:'Objective text',skills:'Skill text',behavior:'Value text'},learner_context:'Learner context',resources:'<b>HAYO:</b> Cards<br><b>HINAY:</b> Prompts',pre_lesson:'Opening text',days:[{title:'Session title',content:'Activity text'}],wrap_up:'Closing text',integration:'N/A',assessment:'Assessment text',reflection:'Reflection text',home_task:'Homework text'};
     saveToHistory(data,{subject:'Science',gradeLevel:'7',numDays:'1',selectedModel:'gemini-1.5-pro',contentStandard:'',performanceStandard:'',competency:'Identify properties',userSuggestions:''});
     loadFromHistory(currentHistoryId);
   },language);
   const pending=page.waitForEvent('download');await page.locator('button[onclick="downloadDoc()"]').click();
   const file=path.join(output,language+'.docx');await(await pending).saveAs(file);
   const report=await page.evaluate(async base64=>{
     const ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
     const originalZip=new PizZip(await(await fetch('./assets/fresh-template.docx')).arrayBuffer());
     const exportedZip=new PizZip(base64,{base64:true});
     const parse=zip=>new DOMParser().parseFromString(zip.file('word/document.xml').asText(),'application/xml');
     const original=parse(originalZip),exported=parse(exportedZip);
     const rows=doc=>Array.from(doc.getElementsByTagNameNS(ns,'tbl')[0].getElementsByTagNameNS(ns,'tr'));
     const cells=row=>Array.from(row.children).filter(n=>n.localName==='tc');
     const originalRows=rows(original),exportedRows=rows(exported);
     const xml=node=>node?new XMLSerializer().serializeToString(node):'';
     function withoutText(node){const copy=node.cloneNode(true);for(const t of copy.getElementsByTagNameNS(ns,'t'))t.textContent='';return xml(copy)}
     const labelStyles=originalRows.map((row,index)=>withoutText(cells(row)[0])===withoutText(cells(exportedRows[index])[0]));
     const paragraphStyle=p=>xml(p?.getElementsByTagNameNS(ns,'pPr')[0]);
     const ordinaryRows=[0,1,2,3,4,5,6,8,12,15,16,17,19,21,22];
     const valueStyles=ordinaryRows.map(index=>{
       const before=cells(originalRows[index])[1],after=cells(exportedRows[index])[1];
       const beforeP=before.getElementsByTagNameNS(ns,'p')[0];
       const firstRun=beforeP.getElementsByTagNameNS(ns,'r')[0];
       const expectedRun=firstRun?.getElementsByTagNameNS(ns,'rPr')[0] || beforeP.getElementsByTagNameNS(ns,'pPr')[0]?.getElementsByTagNameNS(ns,'rPr')[0];
       return Array.from(after.getElementsByTagNameNS(ns,'p')).every(p=>paragraphStyle(p)===paragraphStyle(beforeP)&&xml(p.getElementsByTagNameNS(ns,'r')[0]?.getElementsByTagNameNS(ns,'rPr')[0])===(xml(expectedRun)||'<w:rPr xmlns:w="'+ns+'"/>'));
     });
     const inlineStyles=[9,10,11,14].map(index=>{
       const before=Array.from(cells(originalRows[index])[1].getElementsByTagNameNS(ns,'p'));
       const after=Array.from(cells(exportedRows[index])[1].getElementsByTagNameNS(ns,'p'));
       return before.every(p=>after.some(q=>withoutText(p)===withoutText(q)));
     });
     const referenceCell=cells(exportedRows[5])[0];
     const referenceRuns=Array.from(referenceCell.getElementsByTagNameNS(ns,'r'));
     const explanation=referenceRuns.find(r=>r.textContent.includes('mga aklat')||r.textContent.includes('books, websites'));
     const flowParagraphs=Array.from(cells(exportedRows[16])[0].getElementsByTagNameNS(ns,'p'));
     const nonDocumentParts=Object.keys(originalZip.files).filter(n=>!originalZip.files[n].dir&&n!=='word/document.xml').every(n=>originalZip.file(n).asUint8Array().toString()===exportedZip.file(n)?.asUint8Array().toString());
     return {labelStyles,valueStyles,inlineStyles,explanationSize:explanation?.getElementsByTagNameNS(ns,'sz')[0]?.getAttributeNS(ns,'val'),explanationBold:!!explanation?.getElementsByTagNameNS(ns,'b').length,flowNotesItalic:flowParagraphs.slice(1).every(p=>!!p.getElementsByTagNameNS(ns,'i').length),nonDocumentParts,text:exported.documentElement.textContent,valid:!exported.querySelector('parsererror')};
   },fs.readFileSync(file).toString('base64'));
   assert.ok(report.valid);
   report.labelStyles.forEach((ok,row)=>assert.ok(ok,'label formatting row '+row+' '+language));
   report.valueStyles.forEach((ok,index)=>assert.ok(ok,'value formatting index '+index+' '+language));
   report.inlineStyles.forEach((ok,index)=>assert.ok(ok,'objective/resource formatting index '+index+' '+language));
   assert.equal(report.explanationSize,'18');assert.equal(report.explanationBold,false);
   assert.equal(report.flowNotesItalic,true);assert.equal(report.nonDocumentParts,true);
   assert.ok(report.text.includes('Objective text'));
   if(language==='fil')assert.ok(report.text.includes('Mga Sanggunian')&&report.text.includes('Kaalaman:'));
 }
 assert.deepEqual(alerts,[]);
 console.log('Passed: all 23 label cells preserve original XML structure/styles; generated values inherit template styles; objective/resource label styles preserved; 9pt reference note, italic flow notes, all package parts and logos preserved in Filipino and English exports.');
 console.log('QA artifacts: '+output);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
