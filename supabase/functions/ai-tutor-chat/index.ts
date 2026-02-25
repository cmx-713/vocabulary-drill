import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { messages, studentContext } = await req.json()

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            throw new Error("messages is required and must be a non-empty array")
        }

        const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY')
        if (!DEEPSEEK_API_KEY) {
            throw new Error("DEEPSEEK_API_KEY is not configured in Supabase Secrets")
        }

        // Build context-aware system prompt
        const ctx = studentContext || {}
        const wrongWordsStr = (ctx.topWrongWords || []).map((w: any) => `${w.term}(${w.definition})`).join('、')

        const systemPrompt = `你是 LexiTrack 英语学习智能助教，一个具有学情感知能力的个性化教学智能体。你正在辅导一位大学生的英语词汇学习。

## 该学生的实时学情数据：
- 姓名：${ctx.studentName || '同学'}
- 最近整体正确率：${ctx.accuracy != null ? ctx.accuracy + '%' : '暂无数据'}
- 累计练习次数：${ctx.totalSessions || 0} 次
- 最近一次练习时间：${ctx.lastPracticeDate || '暂无记录'}
- 连续练习天数：${ctx.streak || 0} 天
- 高频错词（最需关注）：${wrongWordsStr || '暂无数据'}

## 你的智能体行为准则：
1. **主动感知**：你已经掌握了该学生的学情数据。根据这些数据，在对话中自然地关注他/她的薄弱词汇。
2. **个性化辅导**：当学生问到某个词时，结合他/她的错词记录进行对比辨析。如果学生问的词恰好是高频错词之一，要特别指出并给出记忆技巧。
3. **主动出题**：在合适的时机，可以用学生的高频错词出一道选择题或造句题来检验。
4. **温柔鼓励**：如果学生很久没来练习，温柔地鼓励他/她。如果学生的连续练习天数很高，要给予真诚的表扬。
5. **回答风格**：简洁、友好、鼓励性强。用中文回答，但英语词汇保持英文原文。
6. **格式要求**：你的回复将直接显示在聊天气泡中，绝对不要使用任何 Markdown 格式（不要用 **加粗**、不要用 # 标题、不要用 - 列表、不要用 \`代码\`）。直接用纯文本自然对话，就像微信聊天一样。需要强调的词直接写出来即可，不需要加粗标记。
7. **角色边界**：你只负责英语词汇学习方面的辅导，不回答与学习无关的问题。如被问到无关话题，请温柔引导回学习。`

        const fullMessages = [
            { role: 'system', content: systemPrompt },
            ...messages
        ]

        console.log("AI Tutor chat request:", messages.length, "messages, student:", ctx.studentName)

        const response = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: fullMessages,
                temperature: 0.8,
                max_tokens: 800,
            })
        })

        if (!response.ok) {
            const errorData = await response.text()
            throw new Error(`DeepSeek API Error: ${response.status} ${errorData}`)
        }

        const data = await response.json()
        const reply = data.choices?.[0]?.message?.content || ""

        return new Response(JSON.stringify({ reply }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error) {
        console.error("AI Tutor Error:", error)
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
