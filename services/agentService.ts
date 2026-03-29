import { AgentAlert, AlertCategory, AlertSeverity, Word, LearningPlan } from '../types';
import { storageService } from './storageService';

let alertIdCounter = 0;
function nextAlertId(): string {
  return `alert-${Date.now()}-${++alertIdCounter}`;
}

function makeAlert(
  category: AlertCategory,
  severity: AlertSeverity,
  title: string,
  description: string,
  relatedStudents?: string[],
  relatedWords?: string[],
): AgentAlert {
  return { id: nextAlertId(), category, severity, title, description, relatedStudents, relatedWords, detectedAt: new Date().toISOString() };
}

// ─── Main Entry: Run all detectors and return sorted alerts ───

export async function runAgentAnalysis(classId: string | null): Promise<AgentAlert[]> {
  const [sessions, states, nameMap] = await Promise.all([
    storageService.getRecentSessionsByClass(classId, 6),
    storageService.getClassLearningStates(classId),
    storageService.getStudentNames(classId),
  ]);

  const alerts: AgentAlert[] = [];

  alerts.push(...detectAccuracyDrop(sessions, nameMap));
  alerts.push(...detectErrorWordSpike(states, nameMap));
  alerts.push(...detectStagnation(sessions, states, nameMap));
  alerts.push(...detectMasteryRegression(states, nameMap));

  // Resolve word IDs to readable terms
  const allWordIds = new Set<string>();
  alerts.forEach(a => a.relatedWords?.forEach(id => allWordIds.add(id)));
  if (allWordIds.size > 0) {
    const wordTerms = await storageService.getWordTerms([...allWordIds]);
    alerts.forEach(a => {
      if (a.relatedWords) {
        const terms = a.relatedWords.map(id => wordTerms[id] || id);
        a.description = a.description.replace(
          /\[WORDS\]/,
          terms.join(', ')
        );
      }
    });
  }

  const severityOrder: Record<AlertSeverity, number> = { critical: 3, warning: 2, info: 1 };
  return alerts.sort((a, b) => severityOrder[b.severity] - severityOrder[a.severity]);
}

// ─── Detector 1: Accuracy Drop ───
// Compare each student's accuracy in the last 3 days vs the 3 days before that.

function detectAccuracyDrop(
  sessions: { user_id: string; correct_count: number; total_count: number; created_at: string }[],
  nameMap: Record<string, string>,
): AgentAlert[] {
  const alerts: AgentAlert[] = [];
  const now = Date.now();
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;

  const userBuckets = new Map<string, { recent: { correct: number; total: number }; previous: { correct: number; total: number } }>();

  sessions.forEach(s => {
    const t = new Date(s.created_at).getTime();
    const isRecent = (now - t) <= threeDaysMs;
    const isPrevious = (now - t) > threeDaysMs && (now - t) <= threeDaysMs * 2;

    if (!isRecent && !isPrevious) return;

    if (!userBuckets.has(s.user_id)) {
      userBuckets.set(s.user_id, {
        recent: { correct: 0, total: 0 },
        previous: { correct: 0, total: 0 },
      });
    }
    const bucket = userBuckets.get(s.user_id)!;
    const target = isRecent ? bucket.recent : bucket.previous;
    target.correct += s.correct_count;
    target.total += s.total_count;
  });

  userBuckets.forEach((bucket, userId) => {
    if (bucket.previous.total < 5 || bucket.recent.total < 5) return;
    const prevAcc = bucket.previous.correct / bucket.previous.total;
    const recentAcc = bucket.recent.correct / bucket.recent.total;
    const drop = Math.round((prevAcc - recentAcc) * 100);

    if (drop >= 15) {
      const name = nameMap[userId] || userId;
      const severity: AlertSeverity = drop >= 25 ? 'critical' : 'warning';
      alerts.push(makeAlert(
        'accuracy_drop', severity,
        `${name} 正确率骤降`,
        `${name}近3天正确率从 ${Math.round(prevAcc * 100)}% 降至 ${Math.round(recentAcc * 100)}%，降幅 ${drop}%`,
        [userId],
      ));
    }
  });

  return alerts;
}

// ─── Detector 2: Error Word Spike ───
// Find words where the class-wide error rate (errors / attempts) exceeds 60%
// and at least 3 students attempted it recently.

function detectErrorWordSpike(
  states: { user_id: string; word_id: string; error_count: number; total_attempts: number; last_reviewed: string }[],
  _nameMap: Record<string, string>,
): AgentAlert[] {
  const alerts: AgentAlert[] = [];
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const cutoff = threeDaysAgo.toISOString().split('T')[0];

  const wordStats = new Map<string, { errors: number; attempts: number; students: Set<string> }>();

  states.forEach(s => {
    if (!s.last_reviewed || s.last_reviewed < cutoff) return;
    if (!wordStats.has(s.word_id)) {
      wordStats.set(s.word_id, { errors: 0, attempts: 0, students: new Set() });
    }
    const ws = wordStats.get(s.word_id)!;
    ws.errors += s.error_count;
    ws.attempts += s.total_attempts;
    ws.students.add(s.user_id);
  });

  wordStats.forEach((ws, wordId) => {
    if (ws.students.size < 3 || ws.attempts < 5) return;
    const errorRate = ws.errors / ws.attempts;
    if (errorRate >= 0.6) {
      const pct = Math.round(errorRate * 100);
      alerts.push(makeAlert(
        'error_word_spike', pct >= 80 ? 'critical' : 'warning',
        `高频错词爆发`,
        `单词 [WORDS] 全班错误率达 ${pct}%（${ws.students.size} 人作答），建议课堂重点讲解`,
        undefined,
        [wordId],
      ));
    }
  });

  return alerts;
}

// ─── Detector 3: Learning Stagnation ───
// Student has practiced >= 10 sessions recently but mastered word count hasn't grown.

function detectStagnation(
  sessions: { user_id: string; correct_count: number; total_count: number; created_at: string }[],
  states: { user_id: string; interval_days: number }[],
  nameMap: Record<string, string>,
): AgentAlert[] {
  const alerts: AgentAlert[] = [];

  // Count recent sessions per student
  const sessionCounts = new Map<string, number>();
  sessions.forEach(s => {
    sessionCounts.set(s.user_id, (sessionCounts.get(s.user_id) || 0) + 1);
  });

  // Count mastered words per student
  const masteredCounts = new Map<string, number>();
  states.forEach(s => {
    if (s.interval_days >= 7) {
      masteredCounts.set(s.user_id, (masteredCounts.get(s.user_id) || 0) + 1);
    }
  });

  sessionCounts.forEach((count, userId) => {
    if (count < 10) return;
    const mastered = masteredCounts.get(userId) || 0;
    if (mastered <= 2) {
      const name = nameMap[userId] || userId;
      alerts.push(makeAlert(
        'stagnation', 'warning',
        `${name} 学习停滞`,
        `${name}近期已练习 ${count} 次，但仅掌握 ${mastered} 个单词，可能存在刷量不刷质的问题`,
        [userId],
      ));
    }
  });

  return alerts;
}

// ─── Detector 4: Mastery Regression ───
// Words that were mastered (interval >= 7) but have regressed (interval dropped back to < 4).

function detectMasteryRegression(
  states: { user_id: string; word_id: string; interval_days: number; consecutive_correct: number; error_count: number; total_attempts: number }[],
  nameMap: Record<string, string>,
): AgentAlert[] {
  const alerts: AgentAlert[] = [];

  // Group by user: count words that were likely mastered before but regressed
  // Heuristic: total_attempts >= 4 (practiced enough to have reached interval 7+) but interval is now <= 2
  const userRegressed = new Map<string, string[]>();

  states.forEach(s => {
    if (s.total_attempts >= 4 && s.interval_days <= 2 && s.error_count > 0 && s.consecutive_correct === 0) {
      if (!userRegressed.has(s.user_id)) userRegressed.set(s.user_id, []);
      userRegressed.get(s.user_id)!.push(s.word_id);
    }
  });

  userRegressed.forEach((wordIds, userId) => {
    if (wordIds.length < 3) return;
    const name = nameMap[userId] || userId;
    alerts.push(makeAlert(
      'mastery_regression', wordIds.length >= 6 ? 'critical' : 'warning',
      `${name} 词汇退化`,
      `${name}有 ${wordIds.length} 个曾学过的单词出现掌握退化（复习间隔回退），建议安排针对性复习`,
      [userId],
      wordIds.slice(0, 5),
    ));
  });

  return alerts;
}

// ═══════════════════════════════════════════════════════
// Phase 2: Structured Pattern Recognition for LLM Diagnosis
// ═══════════════════════════════════════════════════════

export interface ErrorWordCluster {
  pattern: string;
  words: string[];
  description: string;
}

export interface StudentTrajectory {
  userId: string;
  name: string;
  type: 'improving' | 'stable' | 'declining' | 'cramming' | 'inactive';
  label: string;
  detail: string;
}

export interface StructuredDiagnosisContext {
  errorClusters: ErrorWordCluster[];
  trajectories: StudentTrajectory[];
  behaviorInsights: string[];
}

// ─── Build structured context for LLM diagnosis ───

export async function buildDiagnosisContext(classId: string | null): Promise<StructuredDiagnosisContext> {
  const [sessions, states, nameMap] = await Promise.all([
    storageService.getRecentSessionsByClass(classId, 6),
    storageService.getClassLearningStates(classId),
    storageService.getStudentNames(classId),
  ]);

  const allWords = await storageService.getWords();
  const wordMap = new Map<string, Word>();
  allWords.forEach(w => wordMap.set(w.id, w));

  const errorClusters = clusterErrorWords(states, wordMap);
  const trajectories = classifyTrajectories(sessions, states, nameMap);
  const behaviorInsights = analyzeBehavior(sessions, nameMap);

  return { errorClusters, trajectories, behaviorInsights };
}

// ─── Error Word Clustering ───

function clusterErrorWords(
  states: { user_id: string; word_id: string; error_count: number; total_attempts: number }[],
  wordMap: Map<string, Word>,
): ErrorWordCluster[] {
  const wordErrors = new Map<string, { errors: number; attempts: number; students: number }>();
  states.forEach(s => {
    if (s.error_count === 0) return;
    const existing = wordErrors.get(s.word_id) || { errors: 0, attempts: 0, students: 0 };
    existing.errors += s.error_count;
    existing.attempts += s.total_attempts;
    existing.students += 1;
    wordErrors.set(s.word_id, existing);
  });

  const topErrors = Array.from(wordErrors.entries())
    .filter(([, v]) => v.students >= 2)
    .sort((a, b) => b[1].errors - a[1].errors)
    .slice(0, 20);

  const errorWordObjs = topErrors
    .map(([id]) => wordMap.get(id))
    .filter((w): w is Word => !!w);

  const clusters: ErrorWordCluster[] = [];

  // Cluster 1: Morphologically similar words (edit distance <= 3)
  const confusionPairs: [Word, Word][] = [];
  for (let i = 0; i < errorWordObjs.length; i++) {
    for (let j = i + 1; j < errorWordObjs.length; j++) {
      const a = errorWordObjs[i].term.toLowerCase();
      const b = errorWordObjs[j].term.toLowerCase();
      if (editDistance(a, b) <= 3 && a !== b) {
        confusionPairs.push([errorWordObjs[i], errorWordObjs[j]]);
      }
    }
  }
  if (confusionPairs.length > 0) {
    clusters.push({
      pattern: '形近词混淆',
      words: confusionPairs.flatMap(([a, b]) => [a.term, b.term]).filter((v, i, arr) => arr.indexOf(v) === i),
      description: `以下单词拼写相近，学生容易混淆：${confusionPairs.map(([a, b]) => `${a.term}/${b.term}`).join('、')}`,
    });
  }

  // Cluster 2: Same-unit error concentration
  const unitErrorMap = new Map<string, string[]>();
  errorWordObjs.forEach(w => {
    if (!unitErrorMap.has(w.unit)) unitErrorMap.set(w.unit, []);
    unitErrorMap.get(w.unit)!.push(w.term);
  });
  unitErrorMap.forEach((terms, unit) => {
    if (terms.length >= 3) {
      clusters.push({
        pattern: '单元集中出错',
        words: terms,
        description: `${unit} 单元有 ${terms.length} 个高频错词（${terms.join('、')}），该单元可能需要整体复习`,
      });
    }
  });

  // Cluster 3: Long words (length >= 8) concentration
  const longWords = errorWordObjs.filter(w => w.term.length >= 8);
  if (longWords.length >= 3) {
    clusters.push({
      pattern: '长词拼写困难',
      words: longWords.map(w => w.term),
      description: `有 ${longWords.length} 个 8 字母以上的长词出错率较高（${longWords.map(w => w.term).join('、')}），建议通过词根词缀拆解教学`,
    });
  }

  return clusters;
}

// ─── Student Trajectory Classification ───

function classifyTrajectories(
  sessions: { user_id: string; correct_count: number; total_count: number; created_at: string }[],
  states: { user_id: string; interval_days: number }[],
  nameMap: Record<string, string>,
): StudentTrajectory[] {
  const now = Date.now();
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
  const trajectories: StudentTrajectory[] = [];

  const userStats = new Map<string, {
    recentCorrect: number; recentTotal: number; recentCount: number;
    prevCorrect: number; prevTotal: number; prevCount: number;
  }>();

  sessions.forEach(s => {
    const t = new Date(s.created_at).getTime();
    const isRecent = (now - t) <= threeDaysMs;
    if (!userStats.has(s.user_id)) {
      userStats.set(s.user_id, { recentCorrect: 0, recentTotal: 0, recentCount: 0, prevCorrect: 0, prevTotal: 0, prevCount: 0 });
    }
    const u = userStats.get(s.user_id)!;
    if (isRecent) { u.recentCorrect += s.correct_count; u.recentTotal += s.total_count; u.recentCount++; }
    else { u.prevCorrect += s.correct_count; u.prevTotal += s.total_count; u.prevCount++; }
  });

  const masteryMap = new Map<string, number>();
  states.forEach(s => {
    if (s.interval_days >= 7) masteryMap.set(s.user_id, (masteryMap.get(s.user_id) || 0) + 1);
  });

  Object.keys(nameMap).forEach(userId => {
    const name = nameMap[userId];
    const u = userStats.get(userId);

    if (!u || (u.recentCount === 0 && u.prevCount === 0)) {
      trajectories.push({ userId, name, type: 'inactive', label: '未活跃', detail: '近 6 天无练习记录' });
      return;
    }

    const recentAcc = u.recentTotal > 0 ? u.recentCorrect / u.recentTotal : 0;
    const prevAcc = u.prevTotal > 0 ? u.prevCorrect / u.prevTotal : 0;
    const totalSessions = u.recentCount + u.prevCount;
    const mastered = masteryMap.get(userId) || 0;

    if (u.prevTotal >= 5 && u.recentTotal >= 5) {
      const diff = recentAcc - prevAcc;
      if (diff >= 0.1) {
        trajectories.push({ userId, name, type: 'improving', label: '进步型', detail: `正确率提升 ${Math.round(diff * 100)}%，已掌握 ${mastered} 词` });
      } else if (diff <= -0.1) {
        trajectories.push({ userId, name, type: 'declining', label: '退步型', detail: `正确率下降 ${Math.round(Math.abs(diff) * 100)}%，需要关注` });
      } else {
        trajectories.push({ userId, name, type: 'stable', label: '稳定型', detail: `正确率稳定在 ${Math.round(recentAcc * 100)}%，已掌握 ${mastered} 词` });
      }
    } else if (totalSessions >= 5 && u.recentCount >= 4 && u.prevCount <= 1) {
      trajectories.push({ userId, name, type: 'cramming', label: '突击型', detail: `近 3 天集中练习 ${u.recentCount} 次，此前几乎无练习` });
    } else {
      const acc = u.recentTotal > 0 ? Math.round(recentAcc * 100) : 0;
      trajectories.push({ userId, name, type: 'stable', label: '数据不足', detail: `练习次数较少(${totalSessions}次)，正确率 ${acc}%` });
    }
  });

  return trajectories;
}

// ─── Behavior Insights ───

function analyzeBehavior(
  sessions: { user_id: string; correct_count: number; total_count: number; created_at: string }[],
  nameMap: Record<string, string>,
): string[] {
  const insights: string[] = [];
  const studentCount = Object.keys(nameMap).length;
  if (studentCount === 0) return insights;

  const activeUsers = new Set(sessions.map(s => s.user_id));
  const activeRate = Math.round((activeUsers.size / studentCount) * 100);
  if (activeRate < 50) {
    insights.push(`近 6 天仅有 ${activeRate}% 的学生参与了练习，整体参与度偏低`);
  } else if (activeRate >= 80) {
    insights.push(`近 6 天有 ${activeRate}% 的学生参与了练习，整体参与度良好`);
  }

  const weekdaySessions: number[] = [];
  const weekendSessions: number[] = [];
  sessions.forEach(s => {
    const day = new Date(s.created_at).getDay();
    if (day === 0 || day === 6) weekendSessions.push(1);
    else weekdaySessions.push(1);
  });
  if (weekdaySessions.length > 0 && weekendSessions.length === 0) {
    insights.push('学生练习集中在工作日，周末几乎无人练习，可考虑布置周末任务');
  }

  const sessionCounts = new Map<string, number>();
  sessions.forEach(s => sessionCounts.set(s.user_id, (sessionCounts.get(s.user_id) || 0) + 1));
  const avgSessions = activeUsers.size > 0
    ? Math.round(Array.from(sessionCounts.values()).reduce((a, b) => a + b, 0) / activeUsers.size * 10) / 10
    : 0;
  if (avgSessions >= 3) {
    insights.push(`活跃学生人均练习 ${avgSessions} 次/6天，练习频率较高`);
  } else if (avgSessions > 0) {
    insights.push(`活跃学生人均练习仅 ${avgSessions} 次/6天，建议鼓励增加练习频率`);
  }

  return insights;
}

// ─── Utility: Edit Distance ───

function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[m][n];
}

// ═══════════════════════════════════════════════════════
// Phase 3: Personalized Learning Plan Generation
// ═══════════════════════════════════════════════════════

export async function generatePersonalPlan(userId: string): Promise<LearningPlan> {
  const today = new Date();
  // Week starts on Monday
  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);
  const weekStart = monday.toISOString().split('T')[0];

  // Check if a plan already exists for this week
  const existing = await storageService.getActivePlan(userId);
  if (existing && existing.weekStart === weekStart) {
    return existing;
  }

  // Expire old active plans
  if (existing && existing.weekStart !== weekStart) {
    await storageService.upsertPlan({ ...existing, status: 'expired' });
  }

  // Gather student data to calibrate targets
  const todayStr = today.toISOString().split('T')[0];

  const [dueStates, errorStates, allPracticedStates] = await Promise.all([
    storageService.getDueReviewWords(userId, 100),
    storageService.getMistakeStats(userId),
    storageService.getWords(), // for counting total available
  ]);

  // Count words the student has already studied
  const { data: studiedStates } = await (await import('./supabaseClient')).supabase
    .from('word_learning_states')
    .select('word_id, interval_days, error_count')
    .eq('user_id', userId);

  const studied = studiedStates || [];
  const totalAvailable = allPracticedStates.length;
  const studiedCount = studied.length;
  const masteredCount = studied.filter(s => s.interval_days >= 7).length;
  const dueReviewCount = dueStates.length;
  const highErrorCount = errorStates.length;

  // Adaptive target calculation based on student's current state
  const unseenCount = totalAvailable - studiedCount;
  const targetNewWords = Math.min(Math.max(5, Math.round(unseenCount * 0.05)), 20);
  const targetReviewWords = Math.min(Math.max(10, dueReviewCount + highErrorCount), 40);
  const targetSessions = Math.max(3, Math.min(7, Math.round((targetNewWords + targetReviewWords) / 8)));

  // Focus words: top error words that need attention
  const focusWordIds = errorStates.slice(0, 5).map(e => e.word.id);

  const plan: Omit<LearningPlan, 'id'> = {
    userId,
    weekStart,
    targetNewWords,
    targetReviewWords,
    targetSessions,
    completedNewWords: 0,
    completedReviewWords: 0,
    completedSessions: 0,
    focusWordIds,
    status: 'active',
  };

  const saved = await storageService.upsertPlan(plan);
  return saved || { id: 'temp', ...plan };
}
