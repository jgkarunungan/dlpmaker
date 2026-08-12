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
        Act as a DepEd Master Teacher crafting a student-centered, immersive instructional guide.
        Generate a ${numDays}-day Lesson Plan based on:
        Subject: ${subject}
        Competency: ${competency}
        Content Standard: ${contentStandard}
        Performance Standard: ${performanceStandard}
        
        ${userSuggestions ? `USER'S SPECIFIC REQUESTS/CONTEXT: "${userSuggestions}" - Integrate these suggestions or constraints into the lesson flow and activities.` : ''}

        CORE INSTRUCTION:
        - TONE & DETAIL: Act as a Master Teacher. Every lesson must be "Substitute-Ready"—so detailed that another teacher could facilitate the class perfectly in your absence.
        - STRUCTURE: For each day, create 4 distinct, thematic segments that follow a logical flow (e.g., Hook -> Core Insight -> Guided Task -> Synthesis).
        - CREATIVE HEADERS: Do NOT use generic segment names. Come up with unique, creative, and thematic headers for every single segment (e.g., "The Sensory Awakening", "The Cartography of Limits"). 
        - SCORING: For major activities, include a brief "Scoring Mechanism" (e.g., 2 Points for [Mastery], 1 Point for [Attempt]).

        DAILY FLOW PRINCIPLES:
        - DETAIL: Each segment header must be followed by a substantial, descriptive paragraph (3-5 sentences) providing step-by-step hints and pedagogical guidance.
        - FORMATTING: Start each new segment (Header + Content) on a NEW LINE using <br><br>. DO NOT group them into one narrative paragraph. Use clear vertical spacing.

        LANGUAGE RULE: The lesson plan MUST be written in the same language as the provided "Competency" and "Standards". If they are in English, the entire output must be in English. If they are in Filipino, the output must be in Filipino. DO NOT mix languages.

        RETURN A JSON OBJECT ONLY. NO MARKDOWN.
        Structure:
        {
            "ai_declaration": "AI was merely used to correct grammar and spelling, also assist in building the lesson to become well-arranged ensuring best possible learning outcome and achieving the learning competencies.",
            "references": "Provide 2-3 short, legitimate academic or pedagogical references (books or reputable websites) relevant to this specific topic. Format them as simple text lines separated by <br>.",
            "objectives": {
                "knowledge": "Description for Knowledge objective",
                "skills": "Description for Skills objective",
                "behavior": "Description for Behavior objective"
            },
            "learner_context": "", // ALWAYS LEAVE THIS EMPTY
            "resources": "<b>A. HAYO:</b> [Materials]<br><b>B. HINAY:</b> [Scaffolding]",
            "pre_lesson": "Overall unit hook script.",
            "days": [
                {
                    "title": "Creative/Thematic Title. DO NOT include the word 'Day' or its number here.",
                    "content": "A wordy, sophisticated script of the session flow. Use your creative headers for each segment. IMPORTANT: Start each segment (Header + Content) with <br><br> to ensure vertical spacing."
                }
            ],
            "wrap_up": "Closing thought script.",
            "integration": "Act as a DepEd teacher writing this section for an ILAW Daily Lesson Log. In a single paragraph, describe one cohesive, hands-on classroom activity where students naturally apply skills and concepts from other learning areas, utilize ICT, or practice 21st-century skills. CRITICALLY: Do not explicitly name the other subjects being integrated. Instead, design the activity so that the students, through the process of completing the task, will organically discover and realize the connections to other fields of study and real-world themes on their own. Ensure the integration feels completely seamless, unforced, and discovery-driven. If no genuine, natural activity connections exist for this specific topic, output 'N/A'.",
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
