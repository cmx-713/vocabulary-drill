import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Bot, User } from 'lucide-react';
import { chatWithTutor } from '../services/geminiService';

interface StudentContext {
    studentName: string;
    accuracy: number | null;
    totalSessions: number;
    lastPracticeDate: string;
    streak: number;
    topWrongWords: { term: string; definition: string }[];
}

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

interface AiTutorProps {
    studentContext: StudentContext;
}

const AiTutor: React.FC<AiTutorProps> = ({ studentContext }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [hasGreeted, setHasGreeted] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        if (isOpen && !hasGreeted && messages.length === 0) {
            setHasGreeted(true);
            generateGreeting();
        }
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 300);
        }
    }, [isOpen]);

    const generateGreeting = async () => {
        setIsLoading(true);
        try {
            const greetingPrompt: ChatMessage = {
                role: 'user',
                content: '请根据我的学情数据，用1-2句话向我打个招呼，可以提及我的学习情况或高频错词，让我感到你了解我的学习状况。不要说"你好"之类的套话，直接切入学情。'
            };
            const reply = await chatWithTutor([greetingPrompt], studentContext);
            setMessages([{ role: 'assistant', content: reply }]);
        } catch (err) {
            setMessages([{ role: 'assistant', content: '嗨！我是你的 AI 学习助教 📚 有任何词汇问题都可以问我哦！' }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSend = async () => {
        const trimmed = input.trim();
        if (!trimmed || isLoading) return;

        const userMsg: ChatMessage = { role: 'user', content: trimmed };
        const newMessages = [...messages, userMsg];
        setMessages(newMessages);
        setInput('');
        setIsLoading(true);

        try {
            const reply = await chatWithTutor(newMessages, studentContext);
            setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
        } catch (err: any) {
            setMessages(prev => [...prev, { role: 'assistant', content: '抱歉，我遇到了一点问题，请稍后再试 🙏' }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <>
            {/* Floating Yellow Cartoon Button */}
            {!isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-gradient-to-br from-amber-400 to-sky-400 text-white rounded-full shadow-lg hover:shadow-xl hover:scale-110 transition-all duration-300 flex items-center justify-center"
                    title="AI 学习助教"
                >
                    <span className="text-2xl">🤖</span>
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full border-2 border-white text-[8px] text-white font-bold flex items-center justify-center">?</span>
                </button>
            )}

            {/* iMessage-Style Chat Panel */}
            {isOpen && (
                <div
                    className="fixed bottom-6 right-6 z-50 w-[380px] h-[540px] bg-white rounded-[20px] shadow-2xl flex flex-col overflow-hidden"
                    style={{ animation: 'fadeInUp 0.25s ease-out' }}
                >
                    {/* iOS-style Header */}
                    <div className="bg-[#f9f9f9] border-b border-gray-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-sky-400 rounded-full flex items-center justify-center shadow-sm">
                                <span className="text-lg">🤖</span>
                            </div>
                            <div>
                                <h3 className="font-semibold text-[15px] text-gray-900">AI 学习助教</h3>
                                <p className="text-[11px] text-gray-400">基于学情数据 · 个性化辅导</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200 transition-colors text-gray-400"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    {/* Messages Area - iMessage style */}
                    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2" style={{ background: '#e5e5ea' }}>
                        {messages.length === 0 && !isLoading && (
                            <div className="text-center text-gray-500 text-xs mt-20 space-y-2">
                                <span className="text-4xl block">🤖</span>
                                <p>助教正在准备中...</p>
                            </div>
                        )}

                        {messages.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div
                                    className={`max-w-[78%] px-3.5 py-2 text-[14px] leading-relaxed whitespace-pre-wrap ${msg.role === 'user'
                                        ? 'bg-[#007AFF] text-white rounded-[18px] rounded-br-[4px]'
                                        : 'bg-white text-gray-900 rounded-[18px] rounded-bl-[4px] shadow-sm'
                                        }`}
                                >
                                    {msg.content}
                                </div>
                            </div>
                        ))}

                        {/* Typing indicator */}
                        {isLoading && (
                            <div className="flex justify-start">
                                <div className="bg-white px-4 py-2.5 rounded-[18px] rounded-bl-[4px] shadow-sm">
                                    <div className="flex gap-1">
                                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                    </div>
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    {/* iOS-style Input Bar */}
                    <div className="px-3 py-2 bg-[#f9f9f9] border-t border-gray-200 flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <input
                                ref={inputRef}
                                type="text"
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="输入消息..."
                                disabled={isLoading}
                                className="flex-1 px-4 py-2 bg-white border border-gray-300 rounded-full text-[14px] focus:outline-none focus:border-gray-400 disabled:opacity-50 transition-all"
                            />
                            <button
                                onClick={handleSend}
                                disabled={!input.trim() || isLoading}
                                className="w-9 h-9 flex items-center justify-center bg-[#007AFF] text-white rounded-full disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:bg-[#0066DD]"
                            >
                                <Send size={15} className="ml-0.5" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
        </>
    );
};

export default AiTutor;
