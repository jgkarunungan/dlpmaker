// Versioned, portable lesson records. Never serialize browser settings/API keys.
const DLP_BACKUP_LIMIT = 10 * 1024 * 1024;
const DLP_SETUP_FIELDS = ['subject', 'gradeLevel', 'teacherName', 'contentStandard', 'performanceStandard', 'competency', 'userSuggestions', 'numDays', 'selectedModel'];
const DLP_TEXT_FIELDS = ['ai_declaration', 'references', 'resources', 'pre_lesson', 'wrap_up', 'integration', 'assessment', 'reflection', 'home_task'];
const DLP_EDIT_FIELDS = ['learner_context', 'subject', 'learningArea', 'teacherName', 'gradeLevel', 'numSessions', 'competency_standard'];

function escapeLessonText(value) {
    return String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function sanitizeBackupHtml(value) {
    const doc = new DOMParser().parseFromString(value, 'text/html');
    const allowed = new Set(['B','STRONG','I','EM','U','S','P','BR','UL','OL','LI','DIV','SPAN','SUB','SUP']);
    function clean(parent) {
        for (const node of Array.from(parent.childNodes)) {
            if (node.nodeType === 8) { node.remove(); continue; }
            if (node.nodeType !== 1) continue;
            if (['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','SVG','MATH','TEMPLATE','LINK','META'].includes(node.tagName)) { node.remove(); continue; }
            clean(node);
            if (!allowed.has(node.tagName)) node.replaceWith(...node.childNodes);
            else for (const attr of Array.from(node.attributes)) node.removeAttribute(attr.name);
        }
    }
    clean(doc.body);
    return doc.body.innerHTML;
}

function backupLessonRecord(item, sanitize = value=>value) {
    const object = value=>value && typeof value === 'object' && !Array.isArray(value);
    const text = (value, field)=>{
        if (typeof value !== 'string') throw new Error('Invalid or missing text: ' + field + '.');
        return value;
    };
    if (!object(item) || !Number.isSafeInteger(item.id) || item.id < 1 || !object(item.data)) throw new Error('Invalid lesson record.');
    const result = {id:item.id, timestamp:text(item.timestamp, 'timestamp')};
    for (const field of DLP_SETUP_FIELDS) {
        result[field] = text(item[field] ?? (field === 'numDays' ? String(item.data.days?.length || 1) : ''), field);
    }
    const data = {};
    for (const field of DLP_TEXT_FIELDS) data[field] = sanitize(text(item.data[field], field));
    for (const field of DLP_EDIT_FIELDS) if (item.data[field] !== undefined) data[field] = sanitize(text(item.data[field], field));
    if (!object(item.data.objectives)) throw new Error('Missing learning objectives.');
    data.objectives = {};
    for (const field of ['knowledge','skills','behavior']) data.objectives[field] = sanitize(text(item.data.objectives[field], 'objectives.' + field));
    if (!Array.isArray(item.data.days) || item.data.days.length < 1 || item.data.days.length > 5) throw new Error('A lesson must have 1–5 sessions.');
    data.days = item.data.days.map(day=>{
        if (!object(day)) throw new Error('Invalid lesson session.');
        return {title:text(day.title,'session title'), content:sanitize(text(day.content,'session content'))};
    });
    result.numDays = String(data.days.length);
    if (item.data.output_language !== undefined) data.output_language = text(item.data.output_language,'output_language');
    result.data = data;
    return result;
}

function createLessonBackup(lessons, activeId) {
    if (!lessons.length) throw new Error('There are no saved lessons to back up yet.');
    return {
        format:'ai-dlp-maker-backup', version:1, exportedAt:new Date().toISOString(),
        activeLessonId:lessons.some(item=>item.id === activeId) ? activeId : lessons[0].id,
        lessons:lessons.map(item=>backupLessonRecord(item))
    };
}

function parseLessonBackup(raw) {
    if (new Blob([raw]).size > DLP_BACKUP_LIMIT) throw new Error('This backup is too large. Maximum file size is 10 MB.');
    let backup;
    try { backup = JSON.parse(raw); } catch { throw new Error('This file is not valid JSON. Choose a DLP Maker backup file.'); }
    if (!backup || backup.format !== 'ai-dlp-maker-backup' || backup.version !== 1 || !Array.isArray(backup.lessons) || !backup.lessons.length) {
        throw new Error('This is not a supported DLP Maker lesson backup (version 1).');
    }
    const ids = new Set();
    const lessons = backup.lessons.map((item,index)=>{
        try {
            const lesson = backupLessonRecord(item, sanitizeBackupHtml);
            if (ids.has(lesson.id)) throw new Error('Repeated lesson ID.');
            ids.add(lesson.id);
            return lesson;
        } catch (error) { throw new Error('Lesson ' + (index + 1) + ': ' + error.message); }
    });
    return {lessons, activeLessonId:ids.has(backup.activeLessonId) ? backup.activeLessonId : lessons[0].id};
}

function mergeLessonBackup(existing, backup) {
    const fingerprint = item=>{
        const record=backupLessonRecord(item, sanitizeBackupHtml);
        delete record.id; delete record.timestamp;
        return JSON.stringify(record);
    };
    const merged = existing.slice();
    const used = new Set(existing.map(item=>item.id));
    const fingerprints = new Map(existing.map(item=>[fingerprint(item),item.id]));
    let nextId = Math.max(Date.now(), ...used);
    let activeId = null, added = 0;
    const imported = [];
    for (const lesson of backup.lessons) {
        const key = fingerprint(lesson);
        let id = fingerprints.get(key);
        if (id === undefined) {
            id = lesson.id;
            if (used.has(id)) { do { id = ++nextId; } while (used.has(id)); }
            used.add(id); fingerprints.set(key,id);
            imported.push({...lesson,id}); added++;
        }
        if (lesson.id === backup.activeLessonId) activeId=id;
    }
    return {lessons:[...imported,...merged], activeId, added, skipped:backup.lessons.length-added};
}

function backupStatus(message, failed = false) {
    const status=document.getElementById('backupStatus');
    status.textContent=message;
    status.className='text-xs ' + (failed ? 'text-red-700' : 'text-slate-600');
}

function downloadLessonBackup() {
    try {
        const backup=createLessonBackup(history,currentHistoryId);
        const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});
        if (blob.size > DLP_BACKUP_LIMIT) throw new Error('This backup exceeds the 10 MB restore limit.');
        const url=URL.createObjectURL(blob);
        const link=document.createElement('a');
        link.href=url; link.download='DLP_Maker_Backup_' + new Date().toISOString().slice(0,10) + '.json';
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(()=>URL.revokeObjectURL(url),10000);
        backupStatus('Downloaded ' + backup.lessons.length + ' lesson(s). Keep the JSON file to restore on another device. API keys are excluded.');
    } catch(error) { backupStatus(error.message,true); }
}

async function restoreLessonBackup(input) {
    const file=input.files?.[0];
    if (!file) return;
    try {
        if (file.size > DLP_BACKUP_LIMIT) throw new Error('This backup is too large. Maximum file size is 10 MB.');
        const parsed=parseLessonBackup(await file.text());
        const result=mergeLessonBackup(history,parsed);
        // Validate every record and render the selected lesson before committing.
        const active=result.lessons.find(item=>item.id===result.activeId) || result.lessons[0];
        renderTemplate(active.data,active.subject,active.gradeLevel,active.contentStandard,active.performanceStandard,active.competency,active.teacherName);
        try { localStorage.setItem('dlp_history',JSON.stringify(result.lessons)); }
        catch { throw new Error('Browser storage is full or unavailable. Existing saved lessons were kept. Keep your JSON backup and free browser storage before trying again.'); }
        history=result.lessons;
        loadFromHistory(active.id);
        backupStatus('Restored ' + result.added + ' lesson(s); skipped ' + result.skipped + ' existing copy/copies. Existing lessons were kept.');
    } catch(error) { backupStatus(error.message,true); }
    finally { input.value=''; }
}
