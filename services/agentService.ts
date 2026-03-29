import { AgentAlert, AlertCategory, AlertSeverity } from '../types';
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
