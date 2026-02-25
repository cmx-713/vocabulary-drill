import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const task = body.task || 'generate_word'; // Default backward compatibility

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY not configured on server" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    if (task === 'generate_quiz') {
      const words = body.words;
      if (!words || !Array.isArray(words)) {
        throw new Error("Missing 'words' array in request body for quiz generation");
      }

      const prompt = `
        Task: Create a multiple-choice cloze test (fill in the blank) for the following English words.
        Target Words: ${JSON.stringify(words.map((w: any) => ({ term: w.term, definition: w.definition })))}

        Requirements for EACH word:
        1. Create a clear, engaging sentence using the word.
        2. Replace the target word in the sentence with "___" (three underscores).
        3. Provide the full Chinese translation of the sentence.
        4. Provide 4 option strings (A, B, C, D style or just strings) where one is the correct term and the other three are plausible distractors (other words or variations).

        Return ONLY a JSON Array containing objects with these exact keys:
        [
          {
            "wordId": "Use the wordId provided in the input if available, otherwise just use the term",
            "term": "The correct target word",
            "sentenceWithBlank": "The English sentence with ___",
            "translation": "Chinese translation of the full sentence",
            "options": ["distractor1", "correct_term", "distractor2", "distractor3"]
          }
        ]
      `;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();

      let parsed;
      try {
        parsed = JSON.parse(responseText);
      } catch {
        const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch && jsonMatch[1]) {
          parsed = JSON.parse(jsonMatch[1].trim());
        } else {
          throw new Error("Failed to parse AI response as JSON array");
        }
      }

      // Map back original IDs if possible
      const finalQuestions = parsed.map((pq: any) => {
        const originalWord = words.find((w: any) => w.term.toLowerCase() === pq.term.toLowerCase());
        return {
          ...pq,
          wordId: originalWord ? originalWord.id : pq.term
        };
      });

      return new Response(
        JSON.stringify(finalQuestions),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Default "generate_word" logic
    const { term, definition } = body;

    if (!term) {
      return new Response(
        JSON.stringify({ error: "Missing 'term' in request body for word generation" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const prompt = `
      Task: Provide information for the English word "${term}".
      ${definition ? `The provided Chinese definition is: ${definition}.` : `Please provide a concise and accurate Chinese definition for this word.`}
      
      Requirements:
      1. A standard example sentence suitable for university students.
      2. An extended, more complex example sentence (literary or academic context).
      3. Chinese translations for BOTH sentences.
      4. If I didn't provide a definition, include a "definition" field with a concise Chinese meaning.
      
      Return ONLY valid JSON in this format: 
      { 
        "definition": "Chinese meaning",
        "standard": "English sentence", 
        "standardTranslation": "Chinese translation",
        "extended": "English sentence", 
        "extendedTranslation": "Chinese translation"
      }
    `;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // Parse the JSON from the response (may be wrapped in markdown code blocks)
    let parsed;
    try {
      // Try direct parse first
      parsed = JSON.parse(responseText);
    } catch {
      // Try extracting JSON from markdown code block
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch && jsonMatch[1]) {
        parsed = JSON.parse(jsonMatch[1].trim());
      } else {
        throw new Error("Failed to parse AI response as JSON");
      }
    }

    return new Response(
      JSON.stringify(parsed),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Edge Function error:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to generate sentences",
        details: error.message,
        // Fallback data so the frontend can still proceed
        fallback: true,
        standard: `Example sentence for the requested word.`,
        standardTranslation: `请求单词的例句。`,
        extended: `An extended context example for the word.`,
        extendedTranslation: `该单词的扩展语境例句。`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
