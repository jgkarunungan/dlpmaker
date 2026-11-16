// Shared language choice for preview, printing, history, and Word labels.
const FILIPINO_LESSON_LABELS = {
    'Lesson Title':'Pamagat ng Aralin',
    'Learning Area/s':'Asignatura',
    'Name of Teacher/s':'Pangalan ng Guro',
    'Grade Level and Section':'Baitang at Pangkat',
    'No. of Sessions':'Bilang ng Sesyon',
    'References':'Mga Sanggunian',
    '(books, websites, toolkits, etc.)':'(mga aklat, website, kagamitang panturo, atbp.)',
    'Declaration of AI use':'Pagpapahayag ng Paggamit ng AI',
    'Cite how AI was used in the formulation of the lesson plan.':'Ilahad kung paano ginamit ang AI sa pagbuo ng banghay-aralin.',
    'Learning Competency and Curriculum Standards':'Kasanayan sa Pagkatuto at mga Pamantayan ng Kurikulum',
    'Learning Objectives':'Mga Layunin sa Pagkatuto',
    'Learner Context':'Kalagayan ng mga Mag-aaral',
    'i. Learning resources (Mga Kagamitan sa Pagkatuto)':'i. Mga Kagamitan sa Pagkatuto',
    'ii. Pre-lesson activity (Gawain Bago ang Aralin)':'ii. Gawain Bago ang Aralin',
    'iii. Lesson flow (Daloy ng Aralin)':'iii. Daloy ng Aralin',
    'iv. Opportunities for integration':'iv. Mga Pagkakataon para sa Integrasyon',
    'i. Formative assessments':'i. Pormatibong Pagtataya',
    'i. Extended learning opportunities':'i. Mga Gawain para sa Karagdagang Pagkatuto',
    'ii. Reflective practice':'ii. Pagninilay sa Pagtuturo',
    'INTENTIONS':'MGA LAYUNIN',
    'L. LEARNING EXPERIENCE (KARANASAN SA PAGKATUTO)':'L. KARANASAN SA PAGKATUTO',
    'A. ASSESSING LEARNING':'A. PAGTATAYA NG PAGKATUTO',
    'W. WAYS FORWARD':'W. MGA SUSUNOD NA HAKBANG',
    'Knowledge:':'Kaalaman:',
    'Skills:':'Kasanayan:',
    'Behavior:':'Pag-uugali:',
    "Let's Reflect On It!":'Magnilay Tayo!',
    'Prepared by:':'Inihanda ni:',
    'LESSON PLAN IN':'BANGHAY-ARALIN SA',
    'Term 1 (SY: 2026-2027)':'Unang Termino (Taong Panuruan: 2026-2027)',
    'DAY':'ARAW',
    'days':'araw'
};

function normalizeLessonLanguage(value) {
    const language = String(value || '').trim().toLowerCase();
    if (['fil', 'filipino', 'tl', 'tagalog'].includes(language)) return 'fil';
    if (['en', 'english'].includes(language)) return 'en';
    return null;
}

// Older saved plans have no language metadata. Use their original curriculum
// inputs, then lesson content; do not infer language from the subject alone.
function resolveLessonLanguage(data = {}, inputs = {}) {
    const saved = normalizeLessonLanguage(data.output_language);
    if (saved) return saved;
    const request = String(inputs.userSuggestions || '');
    const explicit = request.match(/(?:in|use|using|sa|gamitin|wikang|language\s*:)\s+(Filipino|Tagalog|English)\b/i);
    if (explicit) return normalizeLessonLanguage(explicit[1]);
    function detect(text) {
        const words = String(text || '').replace(/<[^>]*>/g, ' ').toLowerCase().match(/[a-záéíóúñ]+/g) || [];
        const fil = new Set(['ang','ng','mga','sa','at','ay','na','nang','para','pamamagitan','mag-aaral','natutukoy','naipaliliwanag','nasusuri','naipamamalas','pag-unawa','nakabubuo','nauunawaan']);
        const en = new Set(['the','of','and','is','are','to','with','students','learners','understanding','demonstrates','identify','explain','analyze']);
        let score = 0;
        for (const word of words) score += fil.has(word) ? 1 : en.has(word) ? -1 : 0;
        return score > 0 ? 'fil' : score < 0 ? 'en' : null;
    }
    return detect([inputs.contentStandard, inputs.performanceStandard, inputs.competency].join(' '))
        || detect([data.objectives?.knowledge, data.pre_lesson, ...(data.days || []).map(day=>day.content)].join(' '))
        || detect(inputs.subject) || 'en';
}

function lessonLabel(language, english) {
    return language === 'fil' ? (FILIPINO_LESSON_LABELS[english] || english) : english;
}

// Default for newly generated plans; teachers can edit it to reflect actual use.
function aiUseDeclaration(language) {
    return language === 'fil'
        ? 'Ang banghay-araling ito ay binuo sa tulong ng AI. Ginamit ang Gemini at ChatGPT bilang gabay at tagapayo sa pagpili at pagpapahusay ng nilalaman at mga gawain upang maging epektibo at angkop ang aralin sa inaasahang kasanayan. Nananatili sa guro ang pananagutan sa pagsusuri, pag-aangkop, at pinal na nilalaman ng banghay-aralin.'
        : 'This lesson plan was developed with AI assistance. Gemini and ChatGPT were used as guides and advisers in selecting and improving the content and activities to make the lesson effective and appropriate for the intended learning competency. The teacher remains responsible for reviewing, adapting, and finalizing the lesson plan.';
}

if (typeof module !== 'undefined') module.exports = { resolveLessonLanguage, lessonLabel, normalizeLessonLanguage, aiUseDeclaration };
