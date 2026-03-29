import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Word } from '../types';
import { Volume2, Check, X, ArrowRight, BookOpen, RotateCcw, ArrowLeft, Lightbulb, SkipForward } from 'lucide-react';
import { storageService } from '../services/storageService';

interface DictationGameProps {
  words: Word[];
  userId: string;
  onComplete: (results: { correct: string[], wrong: string[], almost: string[] }) => void;
  onExit: () => void;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Build a regex pattern that matches the term AND its common inflected forms
const buildTermPattern = (term: string): string => {
  const t = term.trim();
  const e = escapeRegex(t);
  const variants: string[] = [e];

  // Direct suffixes: oblige→obliges, absorb→absorbed
  ['s', 'es', 'd', 'ed', 'ing', 'er', 'est', 'ly'].forEach(s => variants.push(`${e}${s}`));

  // Silent-e drop: oblige→obliging, excite→exciting
  if (t.endsWith('e')) {
    const stem = escapeRegex(t.slice(0, -1));
    ['ed', 'ing', 'er', 'est', 'able', 'ible'].forEach(s => variants.push(`${stem}${s}`));
  }

  // Consonant+y → i: study→studied, carry→carries
  if (/[^aeiou]y$/i.test(t)) {
    const stem = escapeRegex(t.slice(0, -1));
    ['ied', 'ies', 'ier', 'iest', 'ily'].forEach(s => variants.push(`${stem}${s}`));
  }

  // Doubled last consonant: stop→stopped, plan→planned
  const last = t.slice(-1);
  if (/[bcdfgklmnprstvz]/i.test(last) && t.length >= 2 && /[aeiou]/i.test(t.slice(-2, -1))) {
    const doubled = `${e}${escapeRegex(last)}`;
    ['ed', 'ing', 'er', 'est'].forEach(s => variants.push(`${doubled}${s}`));
  }

  // De-duplicate and build alternation
  const unique = [...new Set(variants)];
  // Sort longest first so regex prefers longer matches
  unique.sort((a, b) => b.length - a.length);
  return `\\b(?:${unique.join('|')})\\b`;
};

const DictationGame: React.FC<DictationGameProps> = ({ words, userId, onComplete, onExit }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userInput, setUserInput] = useState('');
  const [gameState, setGameState] = useState<'playing' | 'feedback' | 'finished'>('playing');
  const [results, setResults] = useState<{ correct: string[], wrong: string[], almost: string[] }>({ correct: [], wrong: [], almost: [] });
  const [timeLeft, setTimeLeft] = useState(30);
  const [showHint, setShowHint] = useState(false);
  const [restartKey, setRestartKey] = useState(0);
  const [score, setScore] = useState(0);
  const [scoreAnimation, setScoreAnimation] = useState<'plus' | 'none'>('none');
  const [currentIsAlmost, setCurrentIsAlmost] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const currentWord = words[currentIndex];

  // Levenshtein Distance Algorithm for spell check tolerance
  const levenshteinDistance = (s: string, t: string): number => {
    if (!s.length) return t.length;
    if (!t.length) return s.length;
    const arr = [];
    for (let i = 0; i <= t.length; i++) {
      arr[i] = [i];
      for (let j = 1; j <= s.length; j++) {
        arr[i][j] =
          i === 0
            ? j
            : Math.min(
              arr[i - 1][j] + 1,
              arr[i][j - 1] + 1,
              arr[i - 1][j - 1] + (s[j - 1] === t[i - 1] ? 0 : 1)
            );
      }
    }
    return arr[t.length][s.length];
  };

  const handleSubmit = useCallback((isTimeout = false) => {
    const wordToCheck = words[currentIndex];
    const targetTerm = wordToCheck.term.toLowerCase();
    const inputTerm = userInput.trim().toLowerCase();

    let isCorrect = false;
    let isAlmost = false;

    if (!isTimeout) {
      // Accept exact match OR any valid inflected form (e.g. absorbed for absorb)
      const inflectionRegex = new RegExp(`^(?:${buildTermPattern(wordToCheck.term)})$`, 'i');
      if (inputTerm === targetTerm || inflectionRegex.test(inputTerm)) {
        isCorrect = true;
      } else {
        const distance = levenshteinDistance(inputTerm, targetTerm);
        // Tolerance: 1 typo for words <= 5 letters, 2 typos for longer words
        const allowedTypos = targetTerm.length <= 5 ? 1 : 2;
        if (distance > 0 && distance <= allowedTypos) {
          isAlmost = true;
        }
      }
    }

    setCurrentIsAlmost(isAlmost);

    // Update Result State
    setResults(prev => ({
      correct: isCorrect ? [...prev.correct, wordToCheck.id] : prev.correct,
      wrong: (!isCorrect && !isAlmost) ? [...prev.wrong, wordToCheck.id] : prev.wrong,
      almost: isAlmost ? [...prev.almost, wordToCheck.id] : prev.almost
    }));

    // Update Score
    if (isCorrect) {
      setScore(prev => prev + 1);
      setScoreAnimation('plus');
      setTimeout(() => setScoreAnimation('none'), 1000);
    }

    // Update Persistent Learning State (Ebbinghaus) - async, fire and forget
    storageService.updateWordResult(userId, wordToCheck.id, isCorrect);

    setGameState('feedback');
  }, [currentIndex, userInput, words, userId]);

  useEffect(() => {
    if (gameState !== 'playing') return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          handleSubmit(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState, currentIndex, restartKey, handleSubmit]);

  useEffect(() => {
    if (gameState === 'playing' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [gameState, currentIndex, restartKey]);

  const playAudio = (text: string) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  };

  const handleSkip = () => {
    // Treat skip as wrong
    const wordToCheck = words[currentIndex];
    setResults(prev => ({
      ...prev,
      wrong: [...prev.wrong, wordToCheck.id]
    }));
    storageService.updateWordResult(userId, wordToCheck.id, false);
    setGameState('feedback');
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setResults({ correct: [], wrong: [], almost: [] });
    setGameState('playing');
    setTimeLeft(30);
    setUserInput('');
    setShowHint(false);
    setScore(0);
    setRestartKey(prev => prev + 1);
  };

  const nextWord = () => {
    if (currentIndex < words.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setUserInput('');
      setTimeLeft(30);
      setShowHint(false);
      setGameState('playing');
    } else {
      setGameState('finished');
      onComplete(results);
    }
  };

  const getMaskedSentence = (sentence: string | undefined, term: string) => {
    if (!sentence) return "";
    const pattern = buildTermPattern(term);
    return sentence.replace(new RegExp(pattern, 'gi'), '__________');
  };

  const renderHighlightedSentence = (sentence: string | undefined, term: string) => {
    if (!sentence) return null;
    const pattern = buildTermPattern(term);
    const parts = sentence.split(new RegExp(`(${pattern})`, 'gi'));
    const regex = new RegExp(`^(?:${pattern})$`, 'i');
    return (
      <>
        {parts.map((part, i) =>
          regex.test(part) ? (
            <span key={i} className="font-bold text-gray-900 border-b-2 border-gray-900">{part}</span>
          ) : (
            part
          )
        )}
      </>
    );
  };

  const getHintContent = () => {
    const term = currentWord.term;
    if (term.length <= 2) return term;
    return (
      <>
        {term.substring(0, 2)}
        {'_'.repeat(term.length - 2)}
      </>
    );
  };

  if (gameState === 'finished') {
    return (
      <div className="flex flex-col items-center justify-center w-full max-w-lg bg-white rounded-xl shadow-lg border border-gray-200 p-10 text-center animate-fade-in" key="finished">
        <div className="w-16 h-16 bg-academy-50 rounded-full flex items-center justify-center text-academy-800 mb-6 mx-auto">
          <BookOpen size={32} />
        </div>
        <h2 className="text-2xl font-bold text-gray-800 font-serif mb-2">测试结束</h2>
        <p className="text-gray-500 mb-8">本次练习得分: {score}</p>

        <div className="w-full border-t border-b border-gray-100 py-6 mb-8 grid grid-cols-2 divide-x divide-gray-100">
          <div>
            <p className="text-3xl font-bold text-emerald-600 font-serif">{results.correct.length}</p>
            <p className="text-xs text-gray-400 uppercase tracking-wider mt-1">Correct</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-amber-500 font-serif">{results.almost.length}</p>
            <p className="text-xs text-gray-400 uppercase tracking-wider mt-1">Almost</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-red-500 font-serif">{results.wrong.length}</p>
            <p className="text-xs text-gray-400 uppercase tracking-wider mt-1">Review</p>
          </div>
        </div>

        <div className="flex gap-4 w-full">
          <button
            onClick={onExit}
            className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 py-3 rounded-lg font-medium transition-colors"
          >
            退出
          </button>
          <button
            onClick={handleRestart}
            className="flex-1 bg-academy-800 hover:bg-academy-900 text-white py-3 rounded-lg font-medium transition-colors"
          >
            再练一次
          </button>
        </div>
      </div>
    );
  }

  const progressPercent = ((currentIndex) / words.length) * 100;

  return (
    <div className="max-w-4xl mx-auto w-full" key={restartKey}>
      {/* Header Bar */}
      <div className="bg-white rounded-t-xl border-x border-t border-gray-200 p-4 relative overflow-hidden">

        {/* Score +1 Animation */}
        {scoreAnimation === 'plus' && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full text-emerald-500 font-bold text-4xl animate-bounce pointer-events-none z-10 font-serif">
            +1
          </div>
        )}

        <div className="flex justify-between items-center mb-3">
          <button
            onClick={onExit}
            className="text-gray-400 hover:text-gray-700 transition-colors flex items-center gap-1.5 text-sm font-medium px-2 py-1 rounded-md hover:bg-gray-50"
            title="退出练习"
          >
            <ArrowLeft size={18} /> <span className="hidden sm:inline">后退</span>
          </button>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-gray-50 px-3 py-1 rounded-full border border-gray-100">
              <span className={`text-sm font-mono font-bold ${timeLeft < 10 ? 'text-red-600' : 'text-academy-800'}`}>
                00:{timeLeft < 10 ? `0${timeLeft}` : timeLeft}
              </span>
            </div>

            <div className="flex items-center gap-2 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
              <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Score</span>
              <span className="text-sm font-bold text-emerald-700">{score}</span>
            </div>
          </div>

          <button
            onClick={handleRestart}
            className="text-gray-400 hover:text-academy-600 transition-colors flex items-center gap-1.5 text-sm font-medium px-2 py-1 rounded-md hover:bg-academy-50"
            title="重新开始"
          >
            <RotateCcw size={16} /> <span className="hidden sm:inline">重新开始</span>
          </button>
        </div>

        <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden mb-1">
          <div className="bg-academy-600 h-full transition-all duration-500" style={{ width: `${progressPercent}%` }}></div>
        </div>
        <div className="text-center">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Question {currentIndex + 1} of {words.length}</span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="bg-white rounded-b-xl border-x border-b border-gray-200 p-8 md:p-12 min-h-[450px] flex flex-col justify-center relative shadow-sm">

        {gameState === 'playing' ? (
          <div className="max-w-2xl mx-auto w-full space-y-8 animate-fade-in">
            <div className="text-center space-y-4">
              <h2 className="text-2xl md:text-3xl text-gray-800 font-sans font-bold">
                {currentWord.definition}
              </h2>
              <div className="w-12 h-1 bg-gray-100 mx-auto rounded"></div>
            </div>

            <div className="bg-[#fcfbf9] p-6 border-l-4 border-gray-300 italic text-gray-600 font-serif text-lg leading-loose">
              "{getMaskedSentence(currentWord.exampleSentence, currentWord.term)}"
            </div>

            <div className="space-y-6">
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit(false)}
                  placeholder="Type answer here..."
                  className="w-full text-center text-2xl font-serif font-bold border-b-2 border-gray-200 focus:border-academy-600 focus:outline-none py-2 bg-transparent transition-colors placeholder:font-sans placeholder:text-gray-200 placeholder:font-normal"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  onClick={() => playAudio(currentWord.term)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-academy-600 transition-colors p-2"
                  title="播放发音"
                >
                  <Volume2 size={24} />
                </button>
              </div>

              {/* Hint Display */}
              {showHint && (
                <div className="text-center animate-fade-in">
                  <p className="text-academy-600 font-mono text-lg tracking-[0.4em] font-bold bg-academy-50 inline-block px-4 py-1 rounded">
                    {getHintContent()}
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-4">
                <button
                  onClick={() => setShowHint(!showHint)}
                  className={`p-3 rounded-lg border transition-all flex items-center justify-center gap-2 font-medium ${showHint ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-white text-gray-500 border-gray-200 hover:border-amber-300 hover:text-amber-500'}`}
                  title="显示提示"
                >
                  <Lightbulb size={20} />
                </button>

                <button
                  onClick={handleSkip}
                  className="p-3 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-all font-medium flex items-center gap-2"
                  title="跳过此题"
                >
                  <span className="hidden sm:inline">跳过</span>
                  <SkipForward size={20} />
                </button>

                <button
                  onClick={() => handleSubmit(false)}
                  className="flex-1 bg-academy-800 text-white py-3 rounded-lg font-medium hover:bg-academy-900 transition-colors shadow-sm flex items-center justify-center gap-2"
                >
                  提交答案 <ArrowRight size={18} />
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Feedback View */
          <div className="max-w-2xl mx-auto w-full animate-fade-in">
            <div className="flex flex-col items-center mb-10">
              <div className="mb-4">
                {results.correct.includes(currentWord.id) ? (
                  <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 shadow-sm animate-bounce-once">
                    <Check size={32} strokeWidth={3} />
                  </div>
                ) : currentIsAlmost ? (
                  <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center text-amber-500 shadow-sm animate-bounce-once">
                    <span className="font-serif font-bold text-3xl">!</span>
                  </div>
                ) : (
                  <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center text-red-500 shadow-sm animate-shake">
                    <X size={32} strokeWidth={3} />
                  </div>
                )}
              </div>

              <h2 className={`text-4xl font-serif font-bold mb-2 ${results.correct.includes(currentWord.id) ? 'text-emerald-700' : currentIsAlmost ? 'text-amber-600' : 'text-red-600'}`}>
                {currentWord.term}
              </h2>

              {currentIsAlmost && userInput && (
                <div className="mb-3 text-center">
                  <p className="text-sm text-gray-500 mb-1">Your spelling:</p>
                  <p className="line-through text-amber-700/60 font-serif text-xl border-b border-amber-200 inline-block px-2">
                    {userInput}
                  </p>
                </div>
              )}

              {/* Feedback Text */}
              <p className={`text-lg font-bold mb-2 ${results.correct.includes(currentWord.id) ? 'text-emerald-600' : currentIsAlmost ? 'text-amber-500' : 'text-red-500'}`}>
                {results.correct.includes(currentWord.id) ? '回答正确! +1 分' : currentIsAlmost ? 'Almost there! 差一点点就对了' : '回答错误'}
              </p>

              <div className="flex items-center gap-2">
                <span className="text-gray-500 text-lg">{currentWord.definition}</span>
                <button onClick={() => playAudio(currentWord.term)} className="text-academy-800 hover:opacity-75 p-1"><Volume2 size={20} /></button>
              </div>
            </div>

            <div className="space-y-4">
              <div className={`p-5 rounded-lg border ${results.correct.includes(currentWord.id) ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                <p className="text-gray-800 font-serif text-lg leading-relaxed mb-2">
                  {renderHighlightedSentence(currentWord.exampleSentence, currentWord.term)}
                </p>
                <p className="text-sm text-gray-500 border-t border-gray-200 pt-2 mt-2">
                  {currentWord.exampleSentenceTranslation}
                </p>
              </div>

              {currentWord.extendedSentence && (
                <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Advanced Context</p>
                  <p className="text-gray-700 font-serif text-lg leading-relaxed mb-2">
                    {renderHighlightedSentence(currentWord.extendedSentence, currentWord.term)}
                  </p>
                  <p className="text-sm text-gray-500 italic">
                    {currentWord.extendedSentenceTranslation}
                  </p>
                </div>
              )}
            </div>

            <button
              onClick={nextWord}
              className="w-full flex items-center justify-center gap-2 bg-academy-800 text-white py-3 rounded-lg font-medium hover:bg-academy-900 transition-colors mt-8 shadow-sm"
              autoFocus
            >
              Next Word <ArrowRight size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DictationGame;