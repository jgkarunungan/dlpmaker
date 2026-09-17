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

        WRITING STYLE RULES (CRITICAL):
        - DIRECT INSTRUCTION: Write as a teacher who has already finished the plan. Use direct statements: "The teacher will...", "Students will...", "Learners will...".
        - NO AI COMMENTARY: Do NOT use phrases like "This activity aims to...", "This allows learners to...", "This is designed to...", or "The teacher should...". Just state the action.
        - CONCISE & PRACTICAL: Use only as much text as needed to make the activity understandable. Avoid pedagogical theory, motivational essays, or long introductions.
        - NO POETIC HEADERS: Use simple, functional headings like Motivation, Activity, Analysis, Discussion, Application, or Assessment. Do not use elaborate thematic titles.
        - SCORING: Include a scoring mechanism only if it is a major performance task.

        LANGUAGE RULE: Use the same language as the provided "Competency" and "Standards". If English, generate in English. If Filipino, generate in Filipino. Do not mix.

        RETURN A JSON OBJECT ONLY. NO MARKDOWN.
        Structure:
        {
            "ai_declaration": "AI was used to structure the lesson plan ensuring alignment with the provided DepEd competencies and standards.",
            "references": "2-3 short, legitimate academic or pedagogical references.",
            "objectives": {
                "knowledge": "Concise Knowledge objective",
                "skills": "Concise Skills objective",
                "behavior": "Concise Behavior objective"
            },
            "learner_context": "", // ALWAYS LEAVE THIS EMPTY
            "resources": "<b>A. HAYO:</b> [Materials]<br><b>B. HINAY:</b> [Scaffolding]",
            "pre_lesson": "The actual opening activity or teacher action (Concise).",
            "days": [
                {
                    "title": "Simple functional title (e.g., Motivation and Basic Concepts). No Day number.",
                    "content": "The actual classroom procedure. Use 'The teacher will...' and 'Students will...'. Use simple headings if needed. Separate segments with <br><br>."
                }
            ],
            "wrap_up": "Concise closing thought or teacher action.",
            "integration": "A single paragraph describing one hands-on activity where students naturally apply skills from other areas or 21st-century skills. Do not explicitly name the other subjects.",
            "assessment": "Concise statement of the actual assessment method.",
            "reflection": "Concise teacher self-check.",
            "home_task": "Clear, manageable extension task."
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
        LANGUAGE RULE: Maintain the same language (Filipino or English) as the current segment text.

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
