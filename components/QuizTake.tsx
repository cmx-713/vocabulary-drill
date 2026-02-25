import React, { useState } from 'react';
import { QuizQuestion, Quiz } from '../types';
import { FileText, Check, X, ArrowRight, BookOpen } from 'lucide-react';

interface QuizTakeProps {
    quiz: Quiz;
    onComplete: (score: number, total: number) => void;
    onExit: () => void;
}

const QuizTake: React.FC<QuizTakeProps> = ({ quiz, onComplete, onExit }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [selectedOption, setSelectedOption] = useState<string | null>(null);
    const [showFeedback, setShowFeedback] = useState(false);
    const [score, setScore] = useState(0);
    const [isFinished, setIsFinished] = useState(false);

    const currentQuestion = quiz.content[currentIndex];

    const handleOptionClick = (option: string) => {
        if (showFeedback) return;
        setSelectedOption(option);
    };

    const handleSubmit = () => {
        if (!selectedOption) return;

        const isCorrect = selectedOption === currentQuestion.term;
        if (isCorrect) {
            setScore(s => s + 1);
        }
        setShowFeedback(true);
    };

    const handleNext = () => {
        if (currentIndex < quiz.content.length - 1) {
            setCurrentIndex(c => c + 1);
            setSelectedOption(null);
            setShowFeedback(false);
        } else {
            setIsFinished(true);
            onComplete(score, quiz.content.length);
        }
    };

    if (isFinished) {
        return (
            <div className="flex flex-col items-center justify-center w-full max-w-lg mx-auto bg-white rounded-xl shadow-lg border border-gray-200 p-10 text-center animate-fade-in">
                <div className="w-16 h-16 bg-academy-50 rounded-full flex items-center justify-center text-academy-700 mb-6 mx-auto">
                    <FileText size={32} />
                </div>
                <h2 className="text-2xl font-bold text-gray-800 font-serif mb-2">测验完成!</h2>
                <p className="text-gray-500 mb-8">{quiz.title}</p>

                <div className="w-full border-t border-b border-gray-100 py-6 mb-8">
                    <p className="text-5xl font-bold text-academy-700 font-serif mb-2">{(score / quiz.content.length * 100).toFixed(0)}<span className="text-xl">%</span></p>
                    <p className="text-sm text-gray-500 font-bold uppercase tracking-wider">正确 {score} / 总题数 {quiz.content.length}</p>
                </div>

                <button
                    onClick={onExit}
                    className="w-full bg-academy-700 hover:bg-academy-800 text-white py-3 rounded-lg font-bold transition-colors"
                >
                    返回仪表盘
                </button>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto w-full animate-fade-in bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
            {/* Header */}
            <div className="bg-academy-800 p-4 text-white flex justify-between items-center">
                <h2 className="font-bold flex items-center gap-2"><FileText size={18} /> {quiz.title}</h2>
                <span className="text-academy-200 text-sm font-bold uppercase tracking-widest bg-academy-900/40 px-3 py-1 rounded-full">
                    Q {currentIndex + 1} / {quiz.content.length}
                </span>
            </div>

            <div className="p-8">
                {/* Question */}
                <div className="mb-8">
                    <p className="text-2xl font-serif text-gray-800 leading-relaxed min-h-[5rem]">
                        {currentQuestion.sentenceWithBlank.split('___').map((part, i, arr) => (
                            <React.Fragment key={i}>
                                {part}
                                {i < arr.length - 1 && (
                                    <span className={`inline-block border-b-2 px-4 mx-1 ${showFeedback ? (selectedOption === currentQuestion.term ? 'border-emerald-500 text-emerald-600 font-bold' : 'border-red-500 text-red-500 font-bold line-through') : 'border-gray-900 border-dashed text-transparent'}`}>
                                        {showFeedback ? selectedOption : '____'}
                                    </span>
                                )}
                            </React.Fragment>
                        ))}
                    </p>
                    {showFeedback && (
                        <p className="text-gray-500 mt-4 text-sm animate-fade-in pb-4 border-b border-gray-100">
                            <span className="font-bold text-academy-700 mr-2">翻译:</span> {currentQuestion.translation}
                        </p>
                    )}
                </div>

                {/* Options */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                    {currentQuestion.options.map((opt, i) => {
                        const isSelected = selectedOption === opt;
                        const isCorrectAnswer = opt === currentQuestion.term;

                        let btnClass = "border text-left p-4 rounded-xl flex items-center gap-3 transition-all font-serif text-lg ";
                        let icon = <span className="w-6 h-6 rounded-full border border-gray-300 flex items-center justify-center text-xs font-sans text-gray-400 font-bold">{String.fromCharCode(65 + i)}</span>;

                        if (!showFeedback) {
                            btnClass += isSelected
                                ? "bg-academy-50 border-academy-300 shadow-[0_0_0_2px_rgba(30,58,95,0.15)] text-academy-900"
                                : "bg-white border-gray-200 hover:border-academy-200 hover:bg-gray-50 text-gray-700";
                        } else {
                            if (isCorrectAnswer) {
                                btnClass += "bg-emerald-50 border-emerald-400 text-emerald-800 font-bold ring-2 ring-emerald-200 ring-offset-1";
                                icon = <span className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center text-white"><Check size={14} strokeWidth={3} /></span>;
                            } else if (isSelected && !isCorrectAnswer) {
                                btnClass += "bg-red-50 border-red-300 text-red-700";
                                icon = <span className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center text-white"><X size={14} strokeWidth={3} /></span>;
                            } else {
                                btnClass += "bg-white border-gray-100 text-gray-400 opacity-60";
                            }
                        }

                        return (
                            <button
                                key={i}
                                onClick={() => handleOptionClick(opt)}
                                disabled={showFeedback}
                                className={btnClass}
                            >
                                {icon}
                                {opt}
                            </button>
                        );
                    })}
                </div>

                {/* Actions */}
                <div className="flex justify-end pt-6 border-t border-gray-100">
                    {!showFeedback ? (
                        <button
                            onClick={handleSubmit}
                            disabled={!selectedOption}
                            className="bg-academy-700 text-white px-8 py-3 rounded-lg font-bold disabled:opacity-50 hover:bg-academy-800 transition-colors flex items-center gap-2"
                        >
                            提交 <Check size={18} />
                        </button>
                    ) : (
                        <button
                            onClick={handleNext}
                            className="bg-gray-900 text-white px-8 py-3 rounded-lg font-bold hover:bg-black transition-colors flex items-center gap-2"
                            autoFocus
                        >
                            {currentIndex < quiz.content.length - 1 ? '下一题' : '查看成绩'} <ArrowRight size={18} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default QuizTake;
