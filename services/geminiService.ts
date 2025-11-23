import { GoogleGenAI } from "@google/genai";
import { Reference, SearchPreferences, SelectionContext, SortPriority, DisapprovalHistoryItem, DisapprovalReason } from "../types";

// Reduced batch size to prevent token limit truncation and ensure JSON validity
const FETCH_BATCH_SIZE = 7;

// Helper to reliably extract and parse JSON from Markdown/Text responses
const extractAndParseJSON = (text: string): any => {
    if (!text) return [];

    // Remove markdown code blocks if present
    let cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();

    const start = cleanText.indexOf('[');
    const end = cleanText.lastIndexOf(']');

    let cleanJson = "";
    // If the array is not closed (truncated response), try to recover valid objects
    if (end < start) {
      const lastBrace = cleanText.lastIndexOf('}');
      if (lastBrace > start) {
        cleanJson = cleanText.substring(start, lastBrace + 1) + ']';
        console.warn("Response was truncated. Recovered partial JSON.");
      } else {
        throw new Error("JSON structure is incomplete and unrecoverable");
      }
    } else {
      cleanJson = cleanText.substring(start, end + 1);
    }
    
    try {
        return JSON.parse(cleanJson);
    } catch (e) {
        console.error("JSON parse failed on:", cleanJson);
        throw e;
    }
};

// New verification function
const verifyReferences = async (
  references: Reference[],
  apiKey: string
): Promise<Reference[]> => {
  if (references.length === 0) return [];

  const ai = new GoogleGenAI({ apiKey });

  // Create a minimal representation for the prompt to save tokens
  const refsForPrompt = references.map(r => ({
      title: r.title,
      authors: r.authors,
      year: r.year,
      url: r.url
  }));

  const prompt = `
    You are a meticulous fact-checker for academic references.
    
    **Input**: A JSON list of potential academic references:
    ${JSON.stringify(refsForPrompt)}

    **Task**:
    1. Perform a Google Search for each paper Title and Author to CONFIRM it exists.
    2. Verify the URL. If the provided URL is broken or incorrect, find the correct official URL (DOI, Publisher, PubMed, etc.).
    3. Filter out any references that are hallucinations (i.e., the paper does not exist).
    
    **Output**:
    - Return a JSON array of the CONFIRMED references.
    - If you correct a URL, update the "url" field.
    - If a paper is valid, keep it. If not, remove it.
    - You MUST return the FULL objects with corrected URLs. 
    - You must output valid JSON only. Do not add any conversational text.

    **Structure**:
    [
        { "title": "...", "authors": [...], "year": "...", "url": "..." }
    ]
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        maxOutputTokens: 8192,
      },
    });

    const validatedShortRefs = extractAndParseJSON(response.text);
    
    if (!Array.isArray(validatedShortRefs)) {
        console.warn("Verification returned non-array. Skipping verification.");
        return references;
    }

    // Merge validated results back with original rich data (summary, relevance)
    const finalRefs: Reference[] = [];
    
    for (const valRef of validatedShortRefs) {
        // Normalize titles for comparison (fuzzy match)
        const valTitle = valRef.title.toLowerCase().replace(/[^\w]/g, '');
        
        const original = references.find(r => 
            r.title.toLowerCase().replace(/[^\w]/g, '').includes(valTitle) ||
            valTitle.includes(r.title.toLowerCase().replace(/[^\w]/g, ''))
        );

        if (original) {
            finalRefs.push({
                ...original,
                url: valRef.url || original.url, // Update URL if corrected
                title: valRef.title || original.title, // Update Title if corrected
                year: valRef.year || original.year
            });
        }
    }
    
    return finalRefs;

  } catch (error) {
      console.warn("Verification step failed:", error);
      // Fail open: return original references if verification crashes due to parsing/network
      return references;
  }
};

export const fetchReferences = async (
  context: SelectionContext,
  prefs: SearchPreferences,
  disapprovalHistory: DisapprovalHistoryItem[] = [],
  customApiKey?: string
): Promise<Reference[]> => {
  // Use custom key if provided, otherwise fall back to env var
  let apiKey = customApiKey || process.env.API_KEY || '';
  apiKey = apiKey.trim();
  
  if (!apiKey) {
    throw new Error("API Key is missing");
  }

  const ai = new GoogleGenAI({ apiKey });

  // Format filters for the prompt
  const publisherReq = prefs.publisherFilter.length > 0 
    ? `Limit results to these publishers/groups: ${prefs.publisherFilter.join(', ')}.` 
    : 'Include any reputable scientific publisher.';
    
  const typeReq = prefs.sourceTypes.length > 0
    ? `Limit results to these document types: ${prefs.sourceTypes.join(', ')}.`
    : 'Prioritize Research Articles and Reviews.';

  // Exclusion logic
  const exclusionReq = prefs.excludeTitles && prefs.excludeTitles.length > 0
    ? `DO NOT include the following papers as they have already been reviewed: ${JSON.stringify(prefs.excludeTitles)}.`
    : '';

  // History-based constraints
  const unwantedSources = disapprovalHistory
    .filter(h => h.reason === DisapprovalReason.UNWANTED_SOURCE)
    .map(h => h.reference.publication);
  
  const historyReq = unwantedSources.length > 0
    ? `DO NOT include papers from these sources/journals which were previously rejected: ${[...new Set(unwantedSources)].join(', ')}.`
    : '';

  // Determine Priority Instruction based on selection
  let priorityReq = "";
  switch (prefs.priority) {
    case SortPriority.HIGH_IMPACT:
      priorityReq = "Strictly prioritize papers published in journals with the HIGHEST Impact Factors. List results in descending order of journal impact factor.";
      break;
    case SortPriority.MOST_CITED:
      priorityReq = "Strictly prioritize papers with the HIGHEST citation counts. List results in descending order of citation count.";
      break;
    case SortPriority.NEWEST:
      priorityReq = "Strictly prioritize the most recently published papers. List results in descending order of publication date (Newest First).";
      break;
    default:
      priorityReq = "Prioritize papers that are most contextually relevant to the highlighted text.";
      break;
  }

  // Constructing the prompt based on user requirements
  const prompt = `
    You are an expert academic research assistant. 
    The user is writing a scientific paper and needs references for a specific statement.
    
    **Task**: Find valid, existing, and high-quality academic references based on the user's highlighted text and context.
    
    **Context**:
    - The entire paragraph text is: "${context.fullText}"
    - The user has HIGHLIGHTED this specific text to find references for: "${context.highlightedText}"
    - **CONTEXT of highlighted text** The immediate text before the highlight is: "${context.precedingContext}"
      use this context to disambiguate the highlighted text and find the most accurate references.

    **Search Criteria**:
    - Find the top ${FETCH_BATCH_SIZE} matches.
    - **Priority**: ${priorityReq}
    - Published after year: ${prefs.yearStart || 'Any'}
    - ${publisherReq}
    - ${typeReq}
    - ${exclusionReq}
    - ${historyReq}

    **Instructions**:
    1. Use Google Search to find REAL papers. Do not hallucinate citations.
    2. Select papers that strongly support or relate to the highlighted text under the its context (the immediate text before the hightlight).
    3. Return the result strictly as a JSON array. 
    4. The "authors" field should only contain the first author and "etc.".
    5. Keep "summary" and "relevance" fields concise (max 50 words each).
    6. Estimate the citation count for the paper if available (approximate is fine).
    
    **Output JSON Schema**:
    [
      {
        "title": "Paper Title",
        "authors": ["Author 1", "etc."],
        "year": "YYYY",
        "publication": "Journal/Conference Name",
        "url": "Link to the paper or DOI",
        "summary": "Brief 1-sentence summary.",
        "relevance": "Why this matches the text.",
        "citationCount": 150
      }
    ]
  `;

  try {
    const response = await ai.models.generateContent({
      model: prefs.model || 'gemini-2.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        maxOutputTokens: 8192,
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("No response received from Gemini");
    }

    try {
      const references: Reference[] = extractAndParseJSON(text);
      
      // Basic validation
      if (!Array.isArray(references)) {
        throw new Error("Parsed result is not an array");
      }
      
      // Step 2: Confirmation / Verification
      // We pass the parsed references to a second pass to confirm they are real.
      return await verifyReferences(references, apiKey);

    } catch (parseError) {
      console.error("Failed to parse Gemini response:", text);
      throw new Error("Failed to parse references from AI response. The model might have returned unstructured text.");
    }

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};
