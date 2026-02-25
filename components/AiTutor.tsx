import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Bot, User, Sparkles } from 'lucide-react';
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

    // Auto-greeting when opened for the first time
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
            setMessages([{ role: 'assistant', content: '你好！我是你的 AI 学习助教 🤖，有任何词汇问题都可以问我哦！' }]);
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
            {/* Floating Button */}
            {!isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-gradient-to-br from-slate-700 to-slate-800 text-white rounded-full shadow-lg hover:shadow-xl hover:scale-110 transition-all duration-300 flex items-center justify-center group"
                    title="AI 学习助教"
                >
                    <Bot size={26} className="group-hover:scale-110 transition-transform" />
                    {/* Pulse animation */}
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-teal-400 rounded-full border-2 border-white animate-pulse" />
                </button>
            )}

            {/* Chat Panel */}
            {isOpen && (
                <div className="fixed bottom-6 right-6 z-50 w-[400px] h-[540px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden animate-fade-in"
                    style={{ animation: 'fadeInUp 0.3s ease-out' }}>
                    {/* Header */}
                    <div className="bg-gradient-to-r from-slate-700 to-slate-800 text-white px-5 py-3.5 flex items-center justify-between flex-shrink-0">
                        <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                                <Sparkles size={18} />
                            </div>
                            <div>
                                <h3 className="font-bold text-sm">AI 学习助教</h3>
                                <p className="text-[10px] text-slate-300 opacity-80">基于你的学情数据，为你个性化辅导</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    {/* Messages Area */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gradient-to-b from-slate-50 to-white">
                        {messages.length === 0 && !isLoading && (
                            <div className="text-center text-gray-400 text-xs mt-16 space-y-2">
                                <Bot size={36} className="mx-auto text-gray-300" />
                                <p>AI 助教正在初始化...</p>
                            </div>
                        )}

                        {messages.map((msg, idx) => (
                            <div key={idx} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                                {/* Avatar */}
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${msg.role === 'assistant'
                                    ? 'bg-gradient-to-br from-slate-600 to-slate-700 text-white'
                                    : 'bg-academy-100 text-academy-700'
                                    }`}>
                                    {msg.role === 'assistant' ? <Bot size={14} /> : <User size={14} />}
                                </div>
                                {/* Bubble */}
                                <div className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${msg.role === 'assistant'
                                    ? 'bg-white border border-gray-100 text-gray-800 shadow-sm rounded-tl-md'
                                    : 'bg-slate-700 text-white rounded-tr-md'
                                    }`}>
                                    {msg.content}
                                </div>
                            </div>
                        ))}

                        {/* Loading indicator */}
                        {isLoading && (
                            <div className="flex gap-2">
                                <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-slate-600 to-slate-700 text-white">
                                    <Bot size={14} />
                                </div>
                                <div className="bg-white border border-gray-100 px-4 py-3 rounded-2xl rounded-tl-md shadow-sm">
                                    <div className="flex gap-1.5">
                                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                    </div>
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input Area */}
                    <div className="px-4 py-3 border-t border-gray-100 bg-white flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <input
                                ref={inputRef}
                                type="text"
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="输入你的问题..."
                                disabled={isLoading}
                                className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400 disabled:opacity-50 transition-all"
                            />
                            <button
                                onClick={handleSend}
                                disabled={!input.trim() || isLoading}
                                className="w-10 h-10 flex items-center justify-center bg-slate-700 text-white rounded-xl hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:shadow-md"
                            >
                                <Send size={16} />
                            </button>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1.5 text-center">AI 助教基于你的学情数据提供个性化学习辅导</p>
                    </div>
                </div>
            )}

            {/* Keyframe animation */}
            <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
        </>
    );
};

export default AiTutor;
