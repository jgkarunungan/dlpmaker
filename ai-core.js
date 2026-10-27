/**
 * AI CORE LOGIC - Isolated to prevent accidental changes to prompts or models.
 */

const AI_CONFIG = {
    PRO_MODEL: { name: 'gemini-1.5-pro', version: 'v1beta' },
    LITE_MODEL: { name: 'gemini-3.1-flash-lite', version: 'v1beta' },
    FLASH_MODEL: { name: 'gemini-1.5-flash', version: 'v1' }
};

/**
 * Generates a full DLP based on user inputs
 */
async function callGenerateDLP(inputs) {
    const { apiKey, subject, gradeLevel, numDays, contentStandard, performanceStandard, competency, userSuggestions, selectedModel } = inputs;

    const prompt = `
        Act as a DepEd Master Teacher. Generate a FINISHED ${numDays}-day Detailed Lesson Plan.
        
        Subject: ${subject}
        Competency: ${competency}
        Content Standard: ${contentStandard}
        Performance Standard: ${performanceStandard}
        
        ${userSuggestions ? `USER'S SPECIFIC REQUESTS: "${userSuggestions}" - Naturally integrate these into the activities.` : ''}

        OUTPUT LANGUAGE HIERARCHY & STRICT RULE (CRITICAL):
        Determine the TARGET OUTPUT LANGUAGE using this strict priority hierarchy:
        1. Explicit teacher request regarding language in USER'S SPECIFIC REQUESTS (if provided).
        2. Primary language of the Learning Competency and Curriculum Standards (Competency, Content Standard, Performance Standard).
        3. Dominant language of the Learning Competency if mixed languages exist in standards.
        4. Subject title as a fallback only if competency and standards are unavailable or ambiguous.

        EVERY GENERATED FIELD VALUE, HEADING, SUBHEADING, LABEL, ACTIVITY TITLE, TEACHER INSTRUCTION, STUDENT ACTION, OBJECTIVE, RESOURCE DESCRIPTION, ASSESSMENT, REFLECTION, AND EXTENDED TASK MUST BE 100% IN THE TARGET OUTPUT LANGUAGE.

        LANGUAGE SPECIFIC GUIDELINES:
        - When Target Language is FILIPINO:
          - Write ALL field values, activity titles, teacher/student actions, objectives, resources, assessment, reflection, wrap-up, and homework entirely in professional, natural Filipino.
          - Use natural Filipino subheadings inside lesson flow content (e.g., <b>Pagganyak</b>, <b>Gawain</b>, <b>Pagsusuri</b>, <b>Pagtatalakay</b>, <b>Paglalapat</b>, <b>Pagtataya</b>).
          - Use direct Filipino teacher/student phrasing (e.g., "Magbibigay ang guro ng...", "Ipapagawa ng guro sa mga mag-aaral...", "Magsasagawa ang mga mag-aaral ng...").
          - Translate resource descriptions naturally (e.g., HAYO: Mga kagamitan sa pagtuturo, HINAY: Gabay at suporta sa pagkatuto).
          - Translate ai_declaration and references into natural Filipino.
          - Preserve established proper nouns, official names, formulas, and technical terms (e.g., Katipunan, Jose Rizal, HTML) accurately without unnatural translation, while keeping all surrounding instructional text and labels in Filipino.
        - When Target Language is ENGLISH:
          - Write ALL field values, headings, teacher/student actions ("The teacher will...", "Students will..."), objectives, resources, assessment, etc., in English.

        WRITING STYLE RULES (CRITICAL):
        - DIRECT INSTRUCTION: Write as a teacher who has already finished the plan. State actions directly.
        - NO AI COMMENTARY: Do NOT use meta-commentary like "This activity aims to...", "Layunin ng gawaing ito na...", "This allows learners to...", etc. Just state the actual classroom procedure.
        - CONCISE & PRACTICAL: Use only as much text as needed to make the activity understandable. Avoid pedagogical theory, motivational essays, or long introductions.
        - NO POETIC HEADERS: Use simple, functional headings appropriate for the target language.
        - SCORING: Include a scoring mechanism only if it is a major performance task.

        RETURN A JSON OBJECT ONLY. NO MARKDOWN.
        STRICT DATA STRUCTURE REQUIREMENT: Keep JSON property keys EXACTLY as named below. Do NOT translate JSON key names. Translate ONLY the generated string values.

        Structure:
        {
            "ai_declaration": "AI declaration in Target Language",
            "references": "2-3 short academic or pedagogical references in Target Language",
            "objectives": {
                "knowledge": "Concise Knowledge objective in Target Language",
                "skills": "Concise Skills objective in Target Language",
                "behavior": "Concise Behavior objective in Target Language"
            },
            "learner_context": "", // ALWAYS LEAVE THIS EMPTY
            "resources": "<b>A. HAYO:</b> [Materials description in Target Language]<br><b>B. HINAY:</b> [Scaffolding description in Target Language]",
            "pre_lesson": "Opening activity or teacher action in Target Language (Concise).",
            "days": [
                {
                    "title": "Simple functional title in Target Language (No Day number).",
                    "content": "Actual classroom procedure in Target Language. Use direct teacher/student actions. Use simple functional headings in Target Language separated by <br><br>."
                }
            ],
            "wrap_up": "Concise closing thought or teacher action in Target Language.",
            "integration": "Hands-on integration activity in Target Language.",
            "assessment": "Formative assessment method in Target Language.",
            "reflection": "Concise teacher self-check in Target Language.",
            "home_task": "Clear, manageable extension task in Target Language."
        }`;

    const modelsToTry = selectedModel === 'gemini-1.5-pro'
        ? [AI_CONFIG.PRO_MODEL, { name: 'gemini-1.5-pro', version: 'v1' }, AI_CONFIG.LITE_MODEL]
        : [AI_CONFIG.LITE_MODEL, AI_CONFIG.FLASH_MODEL, AI_CONFIG.PRO_MODEL];

    return await executeAiRequest(apiKey, prompt, modelsToTry);
}

/**
 * Refines a specific segment of the DLP
 */
async function callRefineSegment(inputs) {
    const { apiKey, subject, promptText, context, selectedModel } = inputs;

    const refinePrompt = `
        Act as a DepEd Master Teacher.
        I have this specific segment from a lesson plan in ${subject}:
        "${context}"

        User Request: "${promptText}"

        ADAPTIVITY RULE: You must match the "scale" of the request.
        - If the user asks for a "little fix," "correction," or minor wording change, provide ONLY the concise updated text. Do NOT add extra paragraphs or descriptions.
        - If the user asks for a "new activity," "full rewrite," or "more detail," then provide a substantial, "Substitute-Ready" description (3-5 sentences) with pedagogical hints.

        TONE RULE: Professional and sophisticated. Avoid administrative jargon.
        FORMATTING RULE: If there are multiple steps, separate them with <br><br>. Use <b> tags for headers.
        STRICT LANGUAGE RULE: Maintain the EXACT language (Filipino or English) of the provided segment text. If the segment is in Filipino, write the entire refined text including all headings, subheadings, teacher/student actions, and labels in natural Filipino. Do NOT insert English headings or labels into Filipino content.

        Please rewrite this segment to fulfill the request. RETURN ONLY THE UPDATED TEXT.
        USE HTML TAGS (<ul>, <li>, <b>, <p>, <br>) IF NECESSARY.
        NO MARKDOWN. NO JSON. JUST THE UPDATED CONTENT.`;

    const model = selectedModel === 'gemini-1.5-pro' ? AI_CONFIG.PRO_MODEL : AI_CONFIG.LITE_MODEL;

    const result = await executeAiRequest(apiKey, refinePrompt, [model]);
    return result.text ? result.text.replace(/^```html\n?|```$/gm, '').trim() : null;
}

/**
 * Internal helper to handle the Fetch API and retries
 */
async function executeAiRequest(apiKey, prompt, models) {
    let lastError = '';
    for (const model of models) {
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/${model.version}/models/${model.name}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });

            const data = await response.json();
            if (response.ok) {
                const text = data.candidates[0].content.parts[0].text;
                return { text, success: true };
            } else {
                lastError = data.error ? data.error.message : 'Unknown Error';
            }
        } catch (error) {
            lastError = error.message;
        }
    }
    throw new Error(lastError);
}
