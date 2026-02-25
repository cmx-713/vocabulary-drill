import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { wrongWords } = await req.json()

    if (!wrongWords || !Array.isArray(wrongWords) || wrongWords.length === 0) {
      throw new Error("wrongWords argument is required and must be a non-empty array")
    }

    const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY')
    if (!DEEPSEEK_API_KEY) {
      throw new Error("DEEPSEEK_API_KEY is not configured in Supabase Secrets")
    }

    const wordsListStr = wrongWords.map((w: any) => `${w.term} (${w.definition})`).join(", ")

    const systemPrompt = `你是一个专业的英语教师出题系统。
每次给定一个学生的高频错词列表，请你使用这些单词出一套 5 道题的【情境单选题】测试。
要求：
1. 题干必须是一句自然流畅、贴近生活的英文原句，不能含有该考点单词，而是留出一个空白（下划线表示 ____ ）。
2. 提供 A, B, C, D 选项，其中一个是正解。
3. 请严格返回一个纯 JSON 数组，**不要有任何其他 markdown 标记（如 \`\`\`json）**。
格式要求如下：
[
  {
    "question": "The newly released smartphone features an ____ design that attracts many young consumers.",
    "options": ["innovative", "abandon", "effort", "relative"],
    "answer": "innovative",
    "translation": "这款新发布的智能手机采用了吸引许多年轻消费者的创新设计。"
  }
]`

    const userPrompt = `请用以下重点关注词汇生成 5 道题：\n${wordsListStr}`

    console.log("Calling DeepSeek API with", wrongWords.length, "words")

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
      })
    })

    if (!response.ok) {
      const errorData = await response.text()
      throw new Error(`DeepSeek API Error: ${response.status} ${errorData}`)
    }

    const data = await response.json()
    const content = data.choices[0].message.content

    let quizData
    try {
      quizData = JSON.parse(content)
    } catch (e) {
      // Try string manipulation if model returned markdown
      const arrayMatch = content.match(/\[[\s\S]*\]/)
      if (arrayMatch) {
        quizData = JSON.parse(arrayMatch[0])
      } else {
        throw new Error("Failed to parse AI JSON response")
      }
    }

    return new Response(JSON.stringify(quizData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error("Function Error:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
