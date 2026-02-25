import { Word, QuizQuestion, TeacherMetrics } from '../types';

interface GeneratedContent {
  definition?: string;
  standard: string;
  standardTranslation: string;
  extended: string;
  extendedTranslation: string;
}

const getAiConfig = () => {
  const provider = localStorage.getItem('AI_PROVIDER') || 'DeepSeek';
  let baseUrl = localStorage.getItem('AI_BASE_URL') || 'https://api.deepseek.com/chat/completions';
  const apiKey = localStorage.getItem('AI_API_KEY') || '';

  // Choose default model map based on provider string
  let model = 'deepseek-chat';
  if (provider === 'OpenAI') model = 'gpt-4o-mini';
  if (provider === 'Zhipu') model = 'glm-4';

  // Auto-correct common URL mistakes for OpenAI compatible APIs
  if (provider !== 'Custom' && !baseUrl.endsWith('/chat/completions')) {
    // If it ends with /v1 or just the domain, append the rest
    if (baseUrl.endsWith('/v1')) {
      baseUrl = baseUrl + '/chat/completions';
    } else if (baseUrl.endsWith('.com') || baseUrl.endsWith('.cn') || baseUrl.endsWith('.net') || baseUrl.endsWith('.org')) {
      baseUrl = baseUrl + '/v1/chat/completions'; // common fallback for bare domains
    }
  }

  return { provider, baseUrl, apiKey, model };
};

const extractJson = (text: string) => {
  try {
    // First, try to just find the JSON array in the text directly
    // This is a more robust regex that looks for the first [ and the last ]
    const arrayMatch = text.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      return JSON.parse(arrayMatch[0]);
    }

    // If that fails, try parsing the whole thing (maybe it's a solid JSON response without markdown)
    return JSON.parse(text);
  } catch (error) {
    console.error("Failed to extract JSON from AI response:", text);
    throw new Error("模型返回的内容不是有效的 JSON 数组：" + (error as Error).message);
  }
};

const callChatCompletion = async (systemPrompt: string, userPrompt: string) => {
  const { baseUrl, apiKey, model } = getAiConfig();

  if (!apiKey) {
    throw new Error("请先在「系统设置」中配置 API 密钥");
  }

  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("API Error details:", errText);
    throw new Error(`API Error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
};

/**
 * 客户端直接调用 AI 生成例句
 */
export const generateExampleSentences = async (term: string, definition?: string): Promise<GeneratedContent> => {
  try {
    const systemPrompt = "You are an expert English teacher. Respond ONLY with valid JSON.";
    const userPrompt = `
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

    const responseText = await callChatCompletion(systemPrompt, userPrompt);
    const parsed = extractJson(responseText);

    return {
      definition: parsed.definition,
      standard: parsed.standard,
      standardTranslation: parsed.standardTranslation,
      extended: parsed.extended,
      extendedTranslation: parsed.extendedTranslation,
    };
  } catch (error) {
    console.error('Failed to generate sentences via local config:', error);
    return {
      standard: `This is a generated example for ${term}.`,
      standardTranslation: `这是一个关于 ${term} 的生成例句。(API配置错误或调用失败)`,
      extended: `In a more complex context, ${term} implies a deeper meaning related to ${definition}.`,
      extendedTranslation: `在更复杂的语境中，${term} 意味着与 ${definition} 相关的更深层含义。`
    };
  }
};

/**
 * 通过配置好的客户端 AI 生成完形填空测验
 */
export const generateClozeTest = async (words: Word[]): Promise<QuizQuestion[]> => {
  if (!words || words.length === 0) return [];

  try {
    const systemPrompt = "You are an expert English teacher generating quiz content. Respond ONLY with a valid JSON array.";

    const userPrompt = `
      Task: Create a multiple-choice cloze test (fill in the blank) for the following English words.
      Target Words: ${JSON.stringify(words.map(w => ({ term: w.term, definition: w.definition })))}

      Requirements for EACH word:
      1. Create a clear, engaging sentence using the word. The sentence should make the target word the ONLY correct answer based on context.
      2. Replace the target word in the sentence with "___" (three underscores).
      3. Provide the full Chinese translation of the sentence.
      4. Provide 4 option strings where one is the correct term and the other three are DISTRACTORS.

      ⚠️ CRITICAL RULES for distractors:
      - Distractors must NOT be synonyms or near-synonyms of the correct answer. For example, if the answer is "vital", do NOT use "crucial", "essential", or "critical" as distractors.
      - Distractors must NOT be words that could also correctly fit in the blank.
      - Distractors should be real English words of the same part of speech (noun for noun, verb for verb, etc.) and similar difficulty level, but with CLEARLY DIFFERENT meanings.
      - Good distractors are words that look plausible at first glance but are obviously wrong when you understand the sentence context.

      Return ONLY a JSON Array containing objects with these exact keys:
      [
        {
          "term": "The correct target word",
          "sentenceWithBlank": "The English sentence with ___",
          "translation": "Chinese translation of the full sentence",
          "options": ["distractor1", "correct_term", "distractor2", "distractor3"]
        }
      ]
      DO NOT INCLUDE ANY MARKDOWN, EXPLANATIONS, OR TAGS. JUST RETURN THE RAW JSON ARRAY.
    `;

    console.log("Sending prompt to AI...", userPrompt);
    const responseText = await callChatCompletion(systemPrompt, userPrompt);
    console.log("Received response from AI:", responseText);

    const parsed = extractJson(responseText);

    if (!Array.isArray(parsed)) {
      throw new Error("Expected array response for quiz generation");
    }

    // Map back original IDs
    return parsed.map((pq: any) => {
      const originalWord = words.find((w: any) => w.term.toLowerCase() === pq.term.toLowerCase());
      return {
        ...pq,
        wordId: originalWord ? originalWord.id : pq.term
      } as QuizQuestion;
    });

  } catch (error) {
    console.error('Failed to generate cloze test:', error);
    throw error;
  }
};

/**
 * 分析学生表现 (通过客户端 AI)
 */
import { supabase } from './supabaseClient';

export const analyzeStudentPerformance = async (wrongWords: Word[]): Promise<string> => {
  if (wrongWords.length === 0) return '继续保持！请坚持每天复习错题。';

  try {
    const systemPrompt = "You are an encouraging English teacher mentoring a student.";
    const userPrompt = `
      The student has answered the following words incorrectly recently: 
      ${wrongWords.map(w => `${w.term}(${w.definition})`).join(', ')}

      Please provide a very short, encouraging analysis and study advice in Chinese (max 2 sentences).
    `;

    const responseText = await callChatCompletion(systemPrompt, userPrompt);
    return responseText.replace(/```.*$/g, '').trim() || '请针对这些单词进行专项复习。';
  } catch (error) {
    console.error('Analysis failed:', error);
    return '很棒的尝试！请查看你做错单词的释义并重新记忆。 (由于未配置API或调用失败，暂无 AI 分析)';
  }
};

/**
 * 学生端：云端调用大模型生成专属弱点突破测验
 */
export const generateWeaknessBreakthrough = async (wrongWords: Word[]): Promise<QuizQuestion[]> => {
  if (!wrongWords || wrongWords.length === 0) return [];

  try {
    const { data, error } = await supabase.functions.invoke('generate-weakness-quiz', {
      body: { wrongWords: wrongWords.map(w => ({ term: w.term, definition: w.definition })) }
    });

    if (error) throw error;
    if (!data || !Array.isArray(data)) throw new Error("Invalid response format from Edge Function");

    // Map back word IDs
    return data.map((item: any) => {
      const originalWord = wrongWords.find(w => w.term.toLowerCase() === item.answer.toLowerCase() ||
        item.options.some((o: string) => o.toLowerCase() === w.term.toLowerCase()));
      return {
        term: item.answer,
        sentenceWithBlank: item.question,
        options: item.options,
        answer: item.answer,
        translation: item.translation,
        wordId: originalWord ? originalWord.id : item.answer
      } as QuizQuestion;
    });
  } catch (error) {
    console.error('Failed to generate weakness breakthrough via Edge Function:', error);
    throw new Error('生成弱点突破失败，请稍后重试或联系老师。');
  }
};

/**
 * 教师端：通过本地配置的大模型生成班级学情诊断与教学建议
 */
export const generateClassDiagnosis = async (metrics: TeacherMetrics): Promise<{
  weakness_analysis: string;
  focus_group: string;
  teaching_suggestion: string;
}> => {
  try {
    const errorWordsContext = metrics.topErrorWords.slice(0, 5).map(w => `${w.word.term} (错误 ${w.errorCount} 次)`).join(', ');
    const inactiveContext = metrics.inactiveStudents.slice(0, 5).map(s => `${s.realName} (最后练习: ${s.lastPracticeDate})`).join(', ');
    const progressContext = metrics.progressLeaderboard?.slice(0, 3).map(p => `${p.realName} (提升 ${p.improvement}%)`).join(', ') || '暂无';

    const systemPrompt = `You are an expert English teaching assistant diagnosing class performance data.
Your goal is to provide highly actionable, warm, and data-driven insights for the teacher.
You must output ONLY a valid JSON object matching this exact schema:
{
  "weakness_analysis": "string - 词汇短板归因分析(分析错词规律,2-3句话)",
  "focus_group": "string - 重点关注群体建议(指名道姓地提醒老师近期懒惰的同学或表扬进步极大的同学,2-3句话)",
  "teaching_suggestion": "string - 下一步具体教学建议(结合错词给出一个具体的Warm-up活动建议,2-3句话)"
}
Output nothing else but the raw JSON.`;

    const userPrompt = `
      Class Performance Data:
      - Overall Accuracy: ${metrics.classAccuracy}%
      - Top Error Words: ${errorWordsContext || 'None'}
      - Inactive Students (>7 days): ${inactiveContext || 'None'}
      - Top Progress Students: ${progressContext}

      Please analyze this data and return the required JSON. Use Chinese language for the values.
    `;

    const responseText = await callChatCompletion(systemPrompt, userPrompt);
    const parsed = extractJson(responseText);

    if (!parsed || !parsed.weakness_analysis || !parsed.focus_group || !parsed.teaching_suggestion) {
      throw new Error("Invalid response format from AI");
    }

    return parsed as { weakness_analysis: string; focus_group: string; teaching_suggestion: string; };
  } catch (error) {
    console.error('Failed to generate class diagnosis:', error);
    throw new Error('生成班级诊断失败，请检查 AI 配置或稍后重试。');
  }
};

/**
 * 学生端：AI 助教多轮对话（通过 Supabase Edge Function）
 */
export const chatWithTutor = async (
  messages: { role: string; content: string }[],
  studentContext: {
    studentName: string;
    accuracy: number | null;
    totalSessions: number;
    lastPracticeDate: string;
    streak: number;
    topWrongWords: { term: string; definition: string }[];
  }
): Promise<string> => {
  try {
    const { data, error } = await supabase.functions.invoke('ai-tutor-chat', {
      body: { messages, studentContext }
    });

    if (error) throw error;
    if (!data || !data.reply) throw new Error("Invalid response from AI Tutor");

    return data.reply;
  } catch (error) {
    console.error('AI Tutor chat error:', error);
    throw new Error('AI 助教暂时无法回复，请稍后再试。');
  }
};