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
    const { apiKey, subject, gradeLevel, numDays, contentStandard, performanceStandard, competency, selectedModel } = inputs;

    const prompt = `
        Act as a DepEd Master Teacher crafting a student-centered, immersive instructional guide.
        Generate a ${numDays}-day Lesson Plan based on:
        Subject: ${subject}
        Competency: ${competency}
        Content Standard: ${contentStandard}
        Performance Standard: ${performanceStandard}

        CORE INSTRUCTION:
        - Sound like a Facilitator's Script (directly addressing students or describing professional interaction).
        - Ensure coherence: The ${numDays} days must form a logical "Instructional Arc".
        - VARIETY IS KEY: Do NOT repeat the same routine every day. Use diverse strategies (Socratic Seminars, Gamified Challenges, Gallery Walks, Case Studies, etc.).

        DAILY FLOW PRINCIPLES (Be creative and thematic with segment headers):
        - For each session, create unique and appropriate headers for each segment of the flow (e.g., "The Bridge", "Connecting the Dots", "The Deep Dive").
        - The headers should reflect the specific activity or pedagogical goal of that segment.
        - Ensure the flow generally moves from an engaging start, through deep immersion/interaction, to a meaningful check for understanding and assessment.
        - Use HTML <b> tags for these headers.
        - FORMATTING: Start each new segment on a NEW LINE using <br><br>. Do not group them into one narrative paragraph.

        LANGUAGE RULE: The lesson plan MUST be written in the same language as the provided "Competency" and "Standards". If they are in English, the entire output must be in English. If they are in Filipino, the output must be in Filipino. DO NOT mix languages.

        RETURN A JSON OBJECT ONLY. NO MARKDOWN.
        Structure:
        {
            "objectives": "Detailed KSA objectives using HTML <ul><li>...</li></ul>",
            "resources": "<b>A. HAYO:</b> [Materials]<br><b>B. HINAY:</b> [Scaffolding]",
            "pre_lesson": "Overall unit hook script.",
            "days": [
                {
                    "title": "Creative/Thematic Title (e.g., 'The Anatomy of Boundaries'). DO NOT include the word 'Day' or its number here.",
                    "content": "A wordy, sophisticated script of the session flow. Use your creative headers for each segment. IMPORTANT: Start each segment (Header + Content) with <br><br> to ensure vertical spacing."
                }
            ],
            "wrap_up": "Closing thought script.",
            "integration": "Cross-disciplinary links.",
            "assessment": "Summary of indicators.",
            "reflection": "Teacher self-check.",
            "home_task": "Extension task."
        }
        Ensure content is WORDY, SMART, and CLEANly typed. Use HTML tags (<ul>, <li>, <b>, <p>, <br>) inside JSON strings.`;

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
        Act as a DepEd Master Teacher crafting a student-centered instructional guide.
        I have this specific segment from a lesson plan in ${subject}:
        "${context}"

        User Request: "${promptText}"

        TONE RULE: Avoid administrative jargon. Speak as if you are directly guiding the teacher on how to talk to and engage the students. The language should be professional, immersive, and sophisticated.
        FORMATTING RULE: If there are multiple segments or steps, separate them with <br><br> to ensure they don't pile up in a single paragraph. Use <b> tags for headers.
        LANGUAGE RULE: Maintain the same language (Filipino or English) as the current segment text provided above.

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
