// Preview edits and AI revisions share one saved, per-lesson undo history.
const LESSON_UNDO_LIMIT = 30;
let lessonEditGroup = null;
let unsavedLessonEdits = false;

function cloneLessonData(data) { return JSON.parse(JSON.stringify(data)); }
function resetLessonEditGroup() { lessonEditGroup = null; }
function lessonEditorStatus(message, failed = false) {
    const status = document.getElementById('lessonSaveStatus');
    if (!status) return;
    status.textContent = message;
    status.className = 'text-xs ' + (failed ? 'text-red-700' : 'text-slate-500');
}
function refreshLessonEditorUI() {
    const item = history.find(h => h.id === currentHistoryId);
    const journal = item?.editHistory;
    document.getElementById('undoLessonBtn').disabled = !journal?.past?.length;
    document.getElementById('redoLessonBtn').disabled = !journal?.future?.length;
    document.getElementById('retryLessonSaveBtn').classList.toggle('hidden', !unsavedLessonEdits);
    lessonEditorStatus(unsavedLessonEdits
        ? 'Changes are not saved to this browser. Retry saving or download a JSON backup now.'
        : 'Saved in this browser. Download a fresh JSON backup to keep edits on another device.', unsavedLessonEdits);
}
function persistLessonEdits() {
    try {
        localStorage.setItem('dlp_history', JSON.stringify(history));
        unsavedLessonEdits = false;
    } catch (_) { unsavedLessonEdits = true; }
    refreshLessonEditorUI();
    return !unsavedLessonEdits;
}
function lessonEditJournal(item) {
    return {past: Array.isArray(item.editHistory?.past) ? item.editHistory.past.slice(-LESSON_UNDO_LIMIT) : [],
        future: Array.isArray(item.editHistory?.future) ? item.editHistory.future.slice(-LESSON_UNDO_LIMIT) : []};
}
function commitLessonEdit(data, {field = null, source = 'manual', inputType = ''} = {}) {
    const item = history.find(h => h.id === currentHistoryId);
    if (!item) throw new Error('This lesson is no longer saved. Reopen a saved lesson before editing.');
    if (JSON.stringify(item.data) === JSON.stringify(data)) return;
    const journal = lessonEditJournal(item);
    const typing = /^(insertText|insertCompositionText|deleteContentBackward|deleteContentForward)$/.test(inputType);
    const now = Date.now();
    const grouped = source === 'manual' && typing && lessonEditGroup?.id === item.id &&
        lessonEditGroup.field === field && lessonEditGroup.inputType === inputType && now - lessonEditGroup.time < 750;
    if (!grouped) journal.past.push({data: cloneLessonData(item.data), field});
    journal.past = journal.past.slice(-LESSON_UNDO_LIMIT);
    journal.future = [];
    history = history.map(h => h.id === item.id ? {...h, data, editHistory: journal} : h);
    currentParsedData = data;
    lessonEditGroup = source === 'manual' && typing ? {id:item.id, field, inputType, time:now} : null;
    // Keep the current edit in memory even if storage fills, so JSON backup can rescue it.
    persistLessonEdits();
    renderHistoryList();
}

function readLessonEditField(data, field) {
    let match = /^day_title_(\d+)$/.exec(field);
    if (match) return data.days[Number(match[1])]?.title;
    match = /^day_(\d+)$/.exec(field);
    if (match) return data.days[Number(match[1])]?.content;
    if (field.startsWith('objectives_')) return data.objectives[field.slice(11)];
    return data[field];
}
function setLessonEditField(data, field, value) {
    const updated = cloneLessonData(data);
    let match = /^day_title_(\d+)$/.exec(field);
    if (match) updated.days[Number(match[1])].title = value;
    else if ((match = /^day_(\d+)$/.exec(field))) updated.days[Number(match[1])].content = value;
    else if (field.startsWith('objectives_')) updated.objectives[field.slice(11)] = value;
    else updated[field] = value;
    return updated;
}
function plainLessonEditField(field) { return field.startsWith('day_title_') || field === 'termLabel'; }
function syncLessonEditView(field, activeElement = null) {
    const value = readLessonEditField(currentParsedData, field);
    document.querySelectorAll('#dlpContent [data-field]').forEach(el => {
        if (el.dataset.field !== field || el === activeElement) return;
        if (plainLessonEditField(field)) el.textContent = value;
        else el.innerHTML = value;
    });
    const item = history.find(h => h.id === currentHistoryId);
    const heading = document.getElementById('lessonHeading');
    if (heading && item) heading.textContent = lessonHeadingText(
        cleanForPlainTextExport(currentParsedData.learningArea ?? item.subject),
        cleanForPlainTextExport(currentParsedData.gradeLevel ?? item.gradeLevel),
        resolveLessonLanguage(currentParsedData, item));
}
function moveLessonEdit(direction) {
    const item = history.find(h => h.id === currentHistoryId);
    if (!item) return;
    const journal = lessonEditJournal(item);
    const from = direction === 'undo' ? journal.past : journal.future;
    const to = direction === 'undo' ? journal.future : journal.past;
    if (!from.length) return;
    const revision = from.pop();
    to.push({data: cloneLessonData(item.data), field: revision.field});
    if (to.length > LESSON_UNDO_LIMIT) to.shift();
    const data = cloneLessonData(revision.data);
    history = history.map(h => h.id === item.id ? {...h, data, editHistory: journal} : h);
    currentParsedData = data;
    resetLessonEditGroup();
    const scroll = document.querySelector('main').scrollTop;
    document.getElementById('dlpContent').innerHTML = renderTemplate(data, item.subject, item.gradeLevel,
        item.contentStandard || '', item.performanceStandard || '', item.competency || '', item.teacherName || 'Jhunrie G. Bayog');
    hideRefine();
    persistLessonEdits();
    renderHistoryList();
    const field = Array.from(document.querySelectorAll('#dlpContent [data-field]')).find(el => el.dataset.field === revision.field);
    if (field) {
        field.focus({preventScroll:true});
        const range = document.createRange(); range.selectNodeContents(field); range.collapse(false);
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    }
    document.querySelector('main').scrollTop = scroll;
}

function initializeLessonEditor() {
    const root = document.getElementById('dlpContent');
    const editable = target => target.closest?.('[contenteditable="true"][data-field]');
    root.addEventListener('input', event => {
        const el = editable(event.target);
        if (!el || !currentParsedData) return;
        const field = el.dataset.field;
        const value = plainLessonEditField(field) ? el.textContent : sanitizeBackupHtml(el.innerHTML);
        try {
            commitLessonEdit(setLessonEditField(currentParsedData, field, value), {field, inputType:event.inputType || ''});
            syncLessonEditView(field, el);
        } catch(error) { lessonEditorStatus(error.message, true); }
    });
    root.addEventListener('focusout', event => {
        resetLessonEditGroup();
        const el = editable(event.target);
        if (el && currentParsedData) syncLessonEditView(el.dataset.field);
    });
    root.addEventListener('pointerdown', resetLessonEditGroup);
    root.addEventListener('compositionstart', resetLessonEditGroup);
    root.addEventListener('beforeinput', event => {
        if (window.getSelection()?.isCollapsed === false) resetLessonEditGroup();
        if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
            event.preventDefault(); moveLessonEdit(event.inputType === 'historyUndo' ? 'undo' : 'redo');
        }
    });
    root.addEventListener('keydown', event => {
        if (/^(Arrow|Home|End|Page)/.test(event.key) || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a')) resetLessonEditGroup();
        if (!(event.ctrlKey || event.metaKey) || event.altKey || event.isComposing) return;
        const key = event.key.toLowerCase();
        if (key === 'z' || key === 'y') {
            event.preventDefault();
            moveLessonEdit(key === 'y' || event.shiftKey ? 'redo' : 'undo');
        }
    });
    root.addEventListener('paste', event => {
        const el = editable(event.target);
        if (!el || !event.clipboardData) return;
        event.preventDefault();
        resetLessonEditGroup();
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        const range = selection.getRangeAt(0);
        if (!el.contains(range.commonAncestorContainer)) return;
        const fragment = document.createDocumentFragment();
        if (!plainLessonEditField(el.dataset.field) && event.clipboardData.getData('text/html')) {
            const parsed = new DOMParser().parseFromString(sanitizeBackupHtml(event.clipboardData.getData('text/html')), 'text/html');
            while (parsed.body.firstChild) fragment.appendChild(parsed.body.firstChild);
        } else {
            const lines = event.clipboardData.getData('text/plain').split('\n');
            lines.forEach((line,index) => {if(index) fragment.appendChild(document.createElement('br')); fragment.appendChild(document.createTextNode(line));});
        }
        const last = fragment.lastChild;
        range.deleteContents(); range.insertNode(fragment);
        if (last) {range.setStartAfter(last); range.collapse(true); selection.removeAllRanges(); selection.addRange(range);}
        el.dispatchEvent(new InputEvent('input', {bubbles:true, inputType:'insertFromPaste'}));
    });
    window.addEventListener('beforeunload', event => {
        if (unsavedLessonEdits) {event.preventDefault(); event.returnValue = '';}
    });
    refreshLessonEditorUI();
}
