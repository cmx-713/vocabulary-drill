import React, { useEffect, useState } from 'react';
import { LearningPlan as LearningPlanType, Word } from '../types';
import { generatePersonalPlan } from '../services/agentService';
import { storageService } from '../services/storageService';
import { Target, BookOpen, RotateCcw, CheckCircle2, Loader2, Sparkles, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';

interface LearningPlanProps {
  userId: string;
}

const LearningPlanCard: React.FC<LearningPlanProps> = ({ userId }) => {
  const [plan, setPlan] = useState<LearningPlanType | null>(null);
  const [focusWords, setFocusWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    generatePersonalPlan(userId)
      .then(async (p) => {
        if (cancelled) return;
        setPlan(p);
        if (p.focusWordIds.length > 0) {
          const terms = await storageService.getWordTerms(p.focusWordIds);
          const words = p.focusWordIds
            .filter(id => terms[id])
            .map(id => ({ id, term: terms[id] } as unknown as Word));
          if (!cancelled) setFocusWords(words);
        }
      })
      .catch(() => { if (!cancelled) setPlan(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 flex items-center justify-center gap-3 text-gray-400">
        <Loader2 size={20} className="animate-spin" /> 正在生成本周学习计划...
      </div>
    );
  }

  if (!plan) return null;

  const isCompleted = plan.status === 'completed';

  const progressItems = [
    {
      label: '新词学习',
      completed: plan.completedNewWords,
      target: plan.targetNewWords,
      icon: <BookOpen size={16} />,
      color: 'academy',
    },
    {
      label: '复习巩固',
      completed: plan.completedReviewWords,
      target: plan.targetReviewWords,
      icon: <RotateCcw size={16} />,
      color: 'emerald',
    },
    {
      label: '练习次数',
      completed: plan.completedSessions,
      target: plan.targetSessions,
      icon: <Target size={16} />,
      color: 'amber',
    },
  ];

  const overallProgress = Math.min(100, Math.round(
    ((plan.completedNewWords / Math.max(1, plan.targetNewWords)) +
     (plan.completedReviewWords / Math.max(1, plan.targetReviewWords)) +
     (plan.completedSessions / Math.max(1, plan.targetSessions))) / 3 * 100
  ));

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden ${isCompleted ? 'border-emerald-200' : 'border-gray-200'}`}>
      {/* Header */}
      <div className={`px-5 py-3 flex items-center justify-between ${isCompleted ? 'bg-emerald-50' : 'bg-gradient-to-r from-academy-50 to-blue-50'}`}>
        <div className="flex items-center gap-2">
          <Sparkles size={16} className={isCompleted ? 'text-emerald-500' : 'text-academy-600'} />
          <h3 className="font-bold text-sm text-gray-800">
            {isCompleted ? '本周计划已完成!' : '本周学习计划'}
          </h3>
          <span className="text-[10px] text-gray-400 bg-white/80 px-2 py-0.5 rounded">
            {plan.weekStart} 起
          </span>
        </div>
        {!isCompleted && (
          <span className="text-xs font-bold text-academy-700 bg-white px-2 py-0.5 rounded-full shadow-sm">
            {overallProgress}%
          </span>
        )}
        {isCompleted && (
          <CheckCircle2 size={18} className="text-emerald-500" />
        )}
      </div>

      {/* Progress Bars */}
      <div className="px-5 py-4 space-y-3">
        {progressItems.map((item) => {
          const pct = Math.min(100, Math.round((item.completed / Math.max(1, item.target)) * 100));
          const done = item.completed >= item.target;
          return (
            <div key={item.label}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5 text-xs text-gray-600">
                  <span className={done ? 'text-emerald-500' : 'text-gray-400'}>{item.icon}</span>
                  <span className="font-medium">{item.label}</span>
                </div>
                <span className={`text-xs font-bold ${done ? 'text-emerald-600' : 'text-gray-500'}`}>
                  {item.completed} / {item.target}
                </span>
              </div>
              <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${done ? 'bg-emerald-400' : item.color === 'academy' ? 'bg-academy-500' : item.color === 'emerald' ? 'bg-emerald-400' : 'bg-amber-400'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Feedback loop info + Focus words */}
      {(plan.previousCompletionRate !== undefined || focusWords.length > 0) && (
        <div className="px-5 pb-4 space-y-2">
          {plan.previousCompletionRate !== undefined && (
            <div className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-md ${plan.previousCompletionRate > 90 ? 'bg-emerald-50 text-emerald-700' : plan.previousCompletionRate < 40 ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-600'}`}>
              {plan.previousCompletionRate > 90 ? <TrendingUp size={12} /> : plan.previousCompletionRate < 40 ? <TrendingDown size={12} /> : <AlertTriangle size={12} />}
              <span>
                上周完成率 <b>{plan.previousCompletionRate}%</b>
                {plan.previousCompletionRate > 90 && '，本周目标已自动提升'}
                {plan.previousCompletionRate < 40 && '，本周目标已适当降低'}
              </span>
            </div>
          )}
          {focusWords.length > 0 && (
            <div className="text-[11px] text-gray-500 px-2.5">
              <span className="font-medium text-gray-600">重点关注：</span>
              {focusWords.map(w => w.term).join('、')}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LearningPlanCard;
