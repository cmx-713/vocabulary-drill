import { supabase } from './supabaseClient';
import { Word, ClassInfo, ClassGroup, StudentRecord, UserProgress, Achievement, WordLearningState, TeacherMetrics, Quiz } from '../types';

// Ebbinghaus intervals (in days)
const EBBINGHAUS_INTERVALS = [1, 2, 4, 7, 15, 30];

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first_perfect',
    name: '初出茅庐',
    description: '首次获得满分',
    icon: 'sprout',
    condition: (progress) => progress.perfectScores >= 1
  },
  {
    id: 'perfect_score',
    name: '百发百中',
    description: '在一次练习中获得 100% 正确率',
    icon: 'target',
    condition: (progress) => progress.perfectScores >= 1 // This condition is for a single perfect score, not cumulative.
  },
  {
    id: 'streak_3',
    name: '持之以恒',
    description: '连续打卡练习 3 天',
    icon: 'flame',
    condition: (progress) => progress.currentStreak >= 3
  },
  {
    id: 'master_5_perfect',
    name: '词汇大师',
    description: '累计获得 5 次全对',
    icon: 'crown',
    condition: (progress) => progress.perfectScores >= 5
  },
  {
    id: 'master_10_words',
    name: '词汇达人',
    description: '掌握 10 个以上单词',
    icon: 'book',
    condition: (_, states) => states.filter(s => s.interval >= 7).length >= 10
  },
];

const INITIAL_PROGRESS: UserProgress = {
  totalGamesPlayed: 0,
  perfectScores: 0,
  currentStreak: 0,
  lastPracticeDate: '',
  unlockedAchievementIds: [],
  realName: ''
};

// In-memory cache for word bank to save Supabase Egress
let cachedAllWords: Word[] | null = null;
let cachedAllWordsTime: number = 0;

export const storageService = {
  // No init needed for Supabase — DB is always ready
  init: () => { },

  // --- Class Management ---

  getClasses: async (): Promise<ClassInfo[]> => {
    const { data } = await supabase.from('classes').select('id, name').order('created_at', { ascending: true });
    return (data || []) as ClassInfo[];
  },

  createClass: async (name: string): Promise<ClassInfo | null> => {
    const { data, error } = await supabase.from('classes').insert({ name }).select('id, name').single();
    if (error) { console.error('Error creating class:', error); return null; }
    return data as ClassInfo;
  },

  deleteClass: async (classId: string): Promise<boolean> => {
    // Unlink students first (set class_id to null), then delete class
    await supabase.from('user_progress').update({ class_id: null }).eq('class_id', classId);
    const { error } = await supabase.from('classes').delete().eq('id', classId);
    return !error;
  },

  importStudents: async (classId: string, students: { studentId: string; name: string }[]): Promise<number> => {
    let imported = 0;
    for (const s of students) {
      // Check if student already exists
      const { data: existing } = await supabase.from('user_progress').select('user_id').eq('user_id', s.studentId).single();
      if (existing) {
        // Update class_id and name
        const { error } = await supabase.from('user_progress').update({ class_id: classId, real_name: s.name }).eq('user_id', s.studentId);
        if (error) console.error("Error updating student:", error);
      } else {
        // Create new student record
        const { error } = await supabase.from('user_progress').insert({
          user_id: s.studentId,
          real_name: s.name,
          class_id: classId,
          total_games_played: 0,
          perfect_scores: 0,
          current_streak: 0,
          last_practice_date: null,
          unlocked_achievement_ids: [],
        });
        if (error) {
          console.error("Error inserting student:", error);
          throw new Error('批量导入失败: ' + error.message);
        }
      }
      imported++;
    }
    return imported;
  },

  // Get students in a class
  getClassStudents: async (classId: string): Promise<{ userId: string; name: string }[]> => {
    const { data } = await supabase.from('user_progress').select('user_id, real_name').eq('class_id', classId);
    return (data || []).map(s => ({ userId: s.user_id, name: s.real_name || s.user_id }));
  },

  // Delete a student entirely (including their learning data)
  deleteStudent: async (studentId: string): Promise<boolean> => {
    // Due to ON DELETE CASCADE or loose relations, we should clean up related tables if necessary
    // But since user_progress.user_id is TEXT without a hard FK in word_learning_states,
    // we explicitly delete from learning states and quizzes results, then progress.
    await supabase.from('word_learning_states').delete().eq('user_id', studentId);
    await supabase.from('quiz_results').delete().eq('user_id', studentId);
    const { error } = await supabase.from('user_progress').delete().eq('user_id', studentId);

    if (error) {
      console.error('Error deleting student:', error);
      return false;
    }
    return true;
  },

  // Validate student login (whitelist check)
  validateStudentLogin: async (studentId: string): Promise<{ valid: boolean; className?: string; classId?: string }> => {
    const { data } = await supabase
      .from('user_progress')
      .select('class_id, classes:class_id(name)')
      .eq('user_id', studentId)
      .single();

    if (!data || !data.class_id) return { valid: false };
    const className = (data as any).classes?.name || '';
    return { valid: true, className, classId: data.class_id };
  },

  // Get all words from Supabase (with in-memory caching to save Egress bandwidth)
  getWords: async (forceRefresh = false): Promise<Word[]> => {
    const now = Date.now();
    // Cache for 1 hour
    if (!forceRefresh && cachedAllWords && (now - cachedAllWordsTime < 1000 * 60 * 60)) {
      return cachedAllWords;
    }

    const { data, error } = await supabase
      .from('words')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching words:', error);
      return cachedAllWords || [];
    }

    // Map DB snake_case to frontend camelCase
    const words = (data || []).map(mapDbWordToWord);
    cachedAllWords = words;
    cachedAllWordsTime = now;
    return words;
  },

  // Get words by unit
  getWordsByUnit: async (unit: string): Promise<Word[]> => {
    const { data, error } = await supabase
      .from('words')
      .select('*')
      .eq('unit', unit)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching words by unit:', error);
      return [];
    }

    return (data || []).map(mapDbWordToWord);
  },

  // Add a new word to Supabase
  addWord: async (word: Omit<Word, 'id'>): Promise<Word | null> => {
    const { data, error } = await supabase
      .from('words')
      .insert({
        term: word.term,
        definition: word.definition,
        example_sentence: word.exampleSentence || null,
        example_sentence_translation: word.exampleSentenceTranslation || null,
        extended_sentence: word.extendedSentence || null,
        extended_sentence_translation: word.extendedSentenceTranslation || null,
        unit: word.unit,
        category: getCategory(word.unit),
        difficulty: word.difficulty,
      })
      .select()
      .single();

    if (error) {
      console.error('Error adding word:', error);
      return null;
    }

    return mapDbWordToWord(data);
  },

  // Update a word's example sentences
  updateWordSentences: async (
    wordId: string,
    sentences: {
      exampleSentence: string;
      exampleSentenceTranslation: string;
      extendedSentence: string;
      extendedSentenceTranslation: string;
    }
  ): Promise<boolean> => {
    const { error } = await supabase
      .from('words')
      .update({
        example_sentence: sentences.exampleSentence,
        example_sentence_translation: sentences.exampleSentenceTranslation,
        extended_sentence: sentences.extendedSentence,
        extended_sentence_translation: sentences.extendedSentenceTranslation,
      })
      .eq('id', wordId);

    if (error) {
      console.error('Error updating word sentences:', error);
      return false;
    }
    return true;
  },

  // Get User Progress from Supabase (and auto-initialize if missing)
  getUserProgress: async (userId: string, realName?: string): Promise<UserProgress> => {
    const { data, error } = await supabase
      .from('user_progress')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      // Auto-initialize a new user record in the DB so they show up immediately
      // on the teacher dashboard, even before playing their first game.
      const initialProgress = { ...INITIAL_PROGRESS };
      if (realName) {
        initialProgress.realName = realName;
      }

      await supabase.from('user_progress').insert({
        user_id: userId,
        real_name: initialProgress.realName,
        total_games_played: initialProgress.totalGamesPlayed,
        perfect_scores: initialProgress.perfectScores,
        current_streak: initialProgress.currentStreak,
        last_practice_date: initialProgress.lastPracticeDate || null,
        unlocked_achievement_ids: initialProgress.unlockedAchievementIds,
      });

      return initialProgress;
    }

    // Since realName might be updated on subsequent logins, let's update it if provided
    if (realName && data.real_name !== realName) {
      await supabase.from('user_progress').update({ real_name: realName }).eq('user_id', userId);
      data.real_name = realName;
    }

    return {
      totalGamesPlayed: data.total_games_played,
      perfectScores: data.perfect_scores,
      currentStreak: data.current_streak,
      lastPracticeDate: data.last_practice_date || '',
      unlockedAchievementIds: data.unlocked_achievement_ids || [],
      realName: data.real_name || '',
    };
  },

  // Get ALL students progress (for Teacher View)
  getAllStudentsProgress: async (): Promise<UserProgress[]> => {
    const { data, error } = await supabase
      .from('user_progress')
      .select('*')
      .not('class_id', 'is', 'null')
      .order('last_practice_date', { ascending: false });

    if (error) {
      console.error('Error fetching all students progress:', error);
      return [];
    }

    return (data || []).map(d => ({
      userId: d.user_id,
      realName: d.real_name || '未知姓名',
      totalGamesPlayed: d.total_games_played,
      perfectScores: d.perfect_scores,
      currentStreak: d.current_streak,
      lastPracticeDate: d.last_practice_date || '',
      unlockedAchievementIds: d.unlocked_achievement_ids || [],
    }));
  },

  // Get aggregated metrics for Teacher Dashboard
  getTeacherMetrics: async (classId?: string | null): Promise<TeacherMetrics> => {
    const today = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

    // 1. Fetch progress (optionally filtered by class)
    let progressQuery = supabase.from('user_progress').select('*');
    if (classId) progressQuery = progressQuery.eq('class_id', classId);
    else progressQuery = progressQuery.not('class_id', 'is', 'null');
    const { data: allProgress } = await progressQuery;
    const progress = allProgress || [];
    const classUserIds = progress.map(p => p.user_id);

    // Inactive Students
    const inactiveStudents = progress
      .filter(p => !p.last_practice_date || p.last_practice_date < sevenDaysAgoStr)
      .map(p => ({
        userId: p.user_id,
        realName: p.real_name || '未知姓名',
        lastPracticeDate: p.last_practice_date || '无记录'
      }));

    // Streak Leaderboard
    const streakLeaderboard = [...progress]
      .filter(p => p.current_streak > 0)
      .sort((a, b) => b.current_streak - a.current_streak)
      .slice(0, 5)
      .map(p => ({
        userId: p.user_id,
        realName: p.real_name || '未知姓名',
        streak: p.current_streak
      }));

    // All Students (for the detailed modal)
    const allStudents = progress.map(p => ({
      userId: p.user_id,
      realName: p.real_name || '未知姓名',
      streak: p.current_streak,
      lastPracticeDate: p.last_practice_date || '无记录'
    }));

    // Average Accuracy
    const totalPlayed = progress.reduce((sum, p) => sum + p.total_games_played, 0);
    const totalPerfect = progress.reduce((sum, p) => sum + p.perfect_scores, 0);
    const classAccuracy = totalPlayed > 0 ? Math.round((totalPerfect / totalPlayed) * 100) : 0;

    // 2. Fetch word learning states (filtered by class user IDs if needed)
    let statesQuery = supabase.from('word_learning_states').select('word_id, user_id, interval_days, error_count, total_attempts');
    if (classId && classUserIds.length > 0) statesQuery = statesQuery.in('user_id', classUserIds);
    else if (classId && classUserIds.length === 0) return { classMastery: 0, classAccuracy: 0, topErrorWords: [], inactiveStudents, streakLeaderboard, allStudents: [], totalStudents: progress.length, progressLeaderboard: [] };
    const { data: allStates } = await statesQuery;
    const states = allStates || [];

    // Class Mastery
    const masteredCount = states.filter(s => s.error_count === 0 && s.total_attempts >= 2).length;
    const classMastery = states.length > 0 ? Math.round((masteredCount / states.length) * 100) : 0;

    // Top Error Words
    const wordStatsMap = new Map<string, { errors: number; attempts: number }>();
    states.forEach(s => {
      if (s.error_count > 0 || (s.total_attempts && s.total_attempts > 0)) {
        const current = wordStatsMap.get(s.word_id) || { errors: 0, attempts: 0 };
        wordStatsMap.set(s.word_id, {
          errors: current.errors + s.error_count,
          attempts: current.attempts + (s.total_attempts || 0)
        });
      }
    });

    const sortedErrorIds = Array.from(wordStatsMap.entries())
      .filter((a) => a[1].errors > 0)
      .sort((a, b) => b[1].errors - a[1].errors)
      .slice(0, 50);

    let topErrorWords: { word: Word; errorCount: number; totalAttempts: number }[] = [];
    if (sortedErrorIds.length > 0) {
      const { data: words } = await supabase
        .from('words')
        .select('*')
        .in('id', sortedErrorIds.map(e => e[0]));

      if (words) {
        topErrorWords = sortedErrorIds.map(([id, stats]) => {
          const w = words.find(item => item.id === id);
          return {
            word: w ? mapDbWordToWord(w) : { id: id, term: '未知', definition: '未知', unit: '0', category: 'TEXTBOOK' as const, difficulty: 1 },
            errorCount: stats.errors,
            totalAttempts: stats.attempts,
          };
        });
      }
    }

    // --- Progress Leaderboard (超越自我榜 - 增值评价) ---
    // Get practice sessions for the last 6 days
    const todayMillis = new Date().getTime();
    const sixDaysAgoStr = new Date(todayMillis - 6 * 24 * 60 * 60 * 1000).toISOString();
    const threeDaysAgoTime = todayMillis - 3 * 24 * 60 * 60 * 1000;

    let sessionsQuery = supabase
      .from('wc_practice_sessions')
      .select('user_id, correct_count, total_count, created_at')
      .gte('created_at', sixDaysAgoStr);

    if (classId && classUserIds.length > 0) {
      sessionsQuery = sessionsQuery.in('user_id', classUserIds);
    }
    const { data: recentSessions } = await sessionsQuery;

    interface UserProgressStats {
      lastCycle: { correct: number, total: number };
      thisCycle: { correct: number, total: number };
      name: string;
    }
    const progressStatsMap = new Map<string, UserProgressStats>();

    if (recentSessions) {
      recentSessions.forEach(session => {
        const sessionTime = new Date(session.created_at).getTime();
        const isThisCycle = sessionTime >= threeDaysAgoTime;

        let userStats = progressStatsMap.get(session.user_id);
        if (!userStats) {
          const uProgress = progress.find(p => p.user_id === session.user_id);
          userStats = {
            name: uProgress?.real_name || '未知姓名',
            lastCycle: { correct: 0, total: 0 },
            thisCycle: { correct: 0, total: 0 }
          };
          progressStatsMap.set(session.user_id, userStats);
        }

        if (isThisCycle) {
          userStats.thisCycle.correct += session.correct_count;
          userStats.thisCycle.total += session.total_count;
        } else {
          userStats.lastCycle.correct += session.correct_count;
          userStats.lastCycle.total += session.total_count;
        }
      });
    }

    // Calculate improvement and sort
    const progressLeaderboard = Array.from(progressStatsMap.entries())
      .filter(([_, stats]) => stats.lastCycle.total >= 5 && stats.thisCycle.total >= 5) // Filter for minimum robustness
      .map(([userId, stats]) => {
        const lastCycleAcc = stats.lastCycle.correct / stats.lastCycle.total;
        const thisCycleAcc = stats.thisCycle.correct / stats.thisCycle.total;
        const improvement = Math.round((thisCycleAcc - lastCycleAcc) * 100);
        return { userId, realName: stats.name, improvement };
      })
      .filter(item => item.improvement > 0) // Only positive growth
      .sort((a, b) => b.improvement - a.improvement)
      .slice(0, 5); // Top 5

    return {
      classMastery,
      classAccuracy,
      topErrorWords,
      inactiveStudents,
      streakLeaderboard,
      allStudents,
      totalStudents: progress.length,
      progressLeaderboard
    };
  },

  // Get additional leaderboard dimensions for teacher dashboard
  getLeaderboardData: async (classId?: string | null): Promise<{
    practiceChampions: { userId: string; realName: string; totalGames: number }[];
    perfectScoreChampions: { userId: string; realName: string; perfectScores: number }[];
    vocabularyMasters: { userId: string; realName: string; masteredCount: number }[];
  }> => {
    // 1. Fetch student progress (filtered by class)
    let progressQuery = supabase.from('user_progress').select('user_id, real_name, total_games_played, perfect_scores');
    if (classId) progressQuery = progressQuery.eq('class_id', classId);
    else progressQuery = progressQuery.not('class_id', 'is', 'null');
    const { data: allProgress } = await progressQuery;
    const progress = allProgress || [];
    const classUserIds = progress.map(p => p.user_id);

    // Practice Champions
    const practiceChampions = [...progress]
      .filter(p => p.total_games_played > 0)
      .sort((a, b) => b.total_games_played - a.total_games_played)
      .slice(0, 10)
      .map(p => ({ userId: p.user_id, realName: p.real_name || '未知姓名', totalGames: p.total_games_played }));

    // Perfect Score Champions
    const perfectScoreChampions = [...progress]
      .filter(p => p.perfect_scores > 0)
      .sort((a, b) => b.perfect_scores - a.perfect_scores)
      .slice(0, 10)
      .map(p => ({ userId: p.user_id, realName: p.real_name || '未知姓名', perfectScores: p.perfect_scores }));

    // 2. Vocabulary Mastery (filtered by class user IDs)
    let statesQuery = supabase.from('word_learning_states').select('user_id, error_count, total_attempts');
    if (classId && classUserIds.length > 0) statesQuery = statesQuery.in('user_id', classUserIds);
    else if (classId && classUserIds.length === 0) return { practiceChampions, perfectScoreChampions, vocabularyMasters: [] };
    const { data: allStates } = await statesQuery;

    const masteryMap = new Map<string, number>();
    (allStates || []).forEach(s => {
      if (s.error_count === 0 && s.total_attempts >= 2) {
        masteryMap.set(s.user_id, (masteryMap.get(s.user_id) || 0) + 1);
      }
    });

    const nameMap = new Map<string, string>();
    progress.forEach(p => nameMap.set(p.user_id, p.real_name || '未知姓名'));

    const vocabularyMasters = Array.from(masteryMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([userId, count]) => ({ userId, realName: nameMap.get(userId) || '未知姓名', masteredCount: count }));

    return { practiceChampions, perfectScoreChampions, vocabularyMasters };
  },

  // Get class accuracy trend from real DB data (last 7 days)
  getClassAccuracyTrend: async (classId?: string | null) => {
    const dates: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().split('T')[0]);
    }

    // Get class user IDs if filtering by class
    let userFilter: string[] | null = null;
    if (classId) {
      const { data: classStudents } = await supabase.from('user_progress').select('user_id').eq('class_id', classId);
      userFilter = (classStudents || []).map(s => s.user_id);
      if (userFilter.length === 0) return dates.map(d => ({ date: new Date(d).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }), accuracy: 0 }));
    } else {
      const { data: classStudents } = await supabase.from('user_progress').select('user_id').not('class_id', 'is', 'null');
      userFilter = (classStudents || []).map(s => s.user_id);
      if (userFilter.length === 0) return dates.map(d => ({ date: new Date(d).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }), accuracy: 0 }));
    }

    // Fetch word_learning_states reviewed in past 7 days
    let statesQuery = supabase.from('word_learning_states')
      .select('user_id, last_reviewed, error_count, total_attempts')
      .gte('last_reviewed', dates[0]);
    if (userFilter) statesQuery = statesQuery.in('user_id', userFilter);
    const { data: states } = await statesQuery;

    // Group by date
    const dayMap = new Map<string, { totalAttempts: number; totalErrors: number }>();
    dates.forEach(d => dayMap.set(d, { totalAttempts: 0, totalErrors: 0 }));

    (states || []).forEach(s => {
      const dateStr = s.last_reviewed;
      if (dayMap.has(dateStr)) {
        const entry = dayMap.get(dateStr)!;
        entry.totalAttempts += (s.total_attempts || 0);
        entry.totalErrors += (s.error_count || 0);
      }
    });

    return dates.map(d => {
      const entry = dayMap.get(d)!;
      const displayDate = new Date(d).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
      const accuracy = entry.totalAttempts > 0
        ? Math.round(((entry.totalAttempts - entry.totalErrors) / entry.totalAttempts) * 100)
        : 0;
      return { date: displayDate, accuracy };
    });
  },

  // Smart Daily Practice: auto-select the best words for today
  getDailyPracticeWords: async (userId: string, targetCount: number = 15): Promise<Word[]> => {
    const today = new Date().toISOString().split('T')[0];
    const collectedWordIds: string[] = [];

    // --- Priority 1: Ebbinghaus due review words ---
    const { data: dueStates } = await supabase
      .from('word_learning_states')
      .select('word_id')
      .eq('user_id', userId)
      .lte('next_review_date', today);

    if (dueStates) {
      for (const s of dueStates) {
        if (collectedWordIds.length >= targetCount) break;
        if (!collectedWordIds.includes(s.word_id)) {
          collectedWordIds.push(s.word_id);
        }
      }
    }

    // --- Priority 2: High-error words (not yet mastered, interval < 7) ---
    if (collectedWordIds.length < targetCount) {
      const { data: errorStates } = await supabase
        .from('word_learning_states')
        .select('word_id, error_count, interval_days')
        .eq('user_id', userId)
        .gt('error_count', 0)
        .lt('interval_days', 7)
        .order('error_count', { ascending: false })
        .limit(targetCount);

      if (errorStates) {
        for (const s of errorStates) {
          if (collectedWordIds.length >= targetCount) break;
          if (!collectedWordIds.includes(s.word_id)) {
            collectedWordIds.push(s.word_id);
          }
        }
      }
    }

    // --- Priority 3: New/unseen words (never practiced by this student) ---
    if (collectedWordIds.length < targetCount) {
      // Get all word IDs the student has already practiced
      const { data: allPracticedStates } = await supabase
        .from('word_learning_states')
        .select('word_id')
        .eq('user_id', userId);

      const practicedIds = new Set((allPracticedStates || []).map(s => s.word_id));

      // Get all words, ordered by unit so we go through units in order
      const { data: allWords } = await supabase
        .from('words')
        .select('id, unit')
        .order('unit', { ascending: true })
        .order('created_at', { ascending: true });

      if (allWords) {
        for (const w of allWords) {
          if (collectedWordIds.length >= targetCount) break;
          if (!practicedIds.has(w.id) && !collectedWordIds.includes(w.id)) {
            collectedWordIds.push(w.id);
          }
        }
      }
    }

    // --- Fetch full Word objects ---
    if (collectedWordIds.length === 0) {
      return [];
    }

    const { data: wordRows, error: wordsError } = await supabase
      .from('words')
      .select('*')
      .in('id', collectedWordIds);

    if (wordsError || !wordRows) return [];

    // Maintain the priority order we built
    return collectedWordIds
      .map(id => wordRows.find(w => w.id === id))
      .filter(Boolean)
      .map(mapDbWordToWord);
  },

  // Get words due for review today (Ebbinghaus)
  getDueReviewWords: async (userId: string, limit: number = 5): Promise<Word[]> => {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('word_learning_states')
      .select('word_id')
      .eq('user_id', userId)
      .lte('next_review_date', today);

    if (error || !data || data.length === 0) {
      return [];
    }

    const wordIds = data.map(s => s.word_id).slice(0, limit);

    const { data: words, error: wordsError } = await supabase
      .from('words')
      .select('*')
      .in('id', wordIds);

    if (wordsError || !words) {
      return [];
    }

    return words.map(mapDbWordToWord);
  },

  // Get statistics for mistakes
  getMistakeStats: async (userId: string): Promise<{ word: Word; errorCount: number }[]> => {
    const { data, error } = await supabase
      .from('word_learning_states')
      .select('word_id, error_count')
      .eq('user_id', userId)
      .gt('error_count', 0)
      .order('error_count', { ascending: false })
      .limit(10);

    if (error || !data || data.length === 0) {
      return [];
    }

    const wordIds = data.map(s => s.word_id);
    const { data: words, error: wordsError } = await supabase
      .from('words')
      .select('*')
      .in('id', wordIds);

    if (wordsError || !words) return [];

    return data
      .map(state => {
        const word = words.find(w => w.id === state.word_id);
        return word ? { word: mapDbWordToWord(word), errorCount: state.error_count } : null;
      })
      .filter((item): item is { word: Word; errorCount: number } => item !== null);
  },

  // Handle individual word result update (Ebbinghaus algorithm)
  updateWordResult: async (userId: string, wordId: string, isCorrect: boolean) => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // Fetch existing state
    const { data: existing } = await supabase
      .from('word_learning_states')
      .select('*')
      .eq('user_id', userId)
      .eq('word_id', wordId)
      .single();

    let intervalDays: number;
    let consecutiveCorrect: number;
    let errorCount: number;
    let nextReviewDate: string;

    const totalAttempts = (existing?.total_attempts || 0) + 1;

    if (isCorrect) {
      const prevInterval = existing?.interval_days || 0;
      consecutiveCorrect = (existing?.consecutive_correct || 0) + 1;
      errorCount = existing?.error_count || 0;

      const intervalIndex = EBBINGHAUS_INTERVALS.indexOf(prevInterval);
      if (intervalIndex !== -1 && intervalIndex < EBBINGHAUS_INTERVALS.length - 1) {
        intervalDays = EBBINGHAUS_INTERVALS[intervalIndex + 1];
      } else if (prevInterval >= 30) {
        intervalDays = 60;
      } else {
        intervalDays = 1;
      }

      const nextDate = new Date(today);
      nextDate.setDate(today.getDate() + intervalDays);
      nextReviewDate = nextDate.toISOString().split('T')[0];
    } else {
      intervalDays = 1;
      consecutiveCorrect = 0;
      errorCount = (existing?.error_count || 0) + 1;

      const nextDate = new Date(today);
      nextDate.setDate(today.getDate() + 1);
      nextReviewDate = nextDate.toISOString().split('T')[0];
    }

    // Upsert the state
    await supabase
      .from('word_learning_states')
      .upsert({
        user_id: userId,
        word_id: wordId,
        interval_days: intervalDays,
        consecutive_correct: consecutiveCorrect,
        error_count: errorCount,
        total_attempts: totalAttempts,
        next_review_date: nextReviewDate,
        last_reviewed: todayStr,
      }, {
        onConflict: 'user_id,word_id'
      });
  },

  // Update overall progress and check for new achievements
  updateProgress: async (userId: string, isPerfectScore: boolean, realName?: string): Promise<{ progress: UserProgress; newAchievements: Achievement[] }> => {
    const current = await storageService.getUserProgress(userId);
    const today = new Date().toISOString().split('T')[0];

    // ... (streak logic remains)
    let newStreak = current.currentStreak;
    if (current.lastPracticeDate === today) {
      // Already practiced today
    } else {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      if (current.lastPracticeDate === yesterdayStr) {
        newStreak += 1;
      } else {
        newStreak = 1;
      }
    }

    const updatedProgress: UserProgress = {
      totalGamesPlayed: current.totalGamesPlayed + 1,
      perfectScores: isPerfectScore ? current.perfectScores + 1 : current.perfectScores,
      currentStreak: newStreak,
      lastPracticeDate: today,
      unlockedAchievementIds: [...current.unlockedAchievementIds],
      realName: realName || current.realName || '',
    };

    // ... (achievement logic remains)
    const newUnlocked: Achievement[] = [];
    if (!updatedProgress.unlockedAchievementIds.includes('first_perfect')) {
      const ach = ACHIEVEMENTS.find(a => a.id === 'first_perfect');
      if (ach) newUnlocked.push(ach);
    }
    if (isPerfectScore && !updatedProgress.unlockedAchievementIds.includes('perfect_score')) {
      const ach = ACHIEVEMENTS.find(a => a.id === 'perfect_score');
      if (ach) newUnlocked.push(ach);
    }
    if (updatedProgress.currentStreak >= 3 && !updatedProgress.unlockedAchievementIds.includes('streak_3')) {
      const ach = ACHIEVEMENTS.find(a => a.id === 'streak_3');
      if (ach) newUnlocked.push(ach);
    }
    if (updatedProgress.perfectScores >= 5 && !updatedProgress.unlockedAchievementIds.includes('master_5_perfect')) {
      const ach = ACHIEVEMENTS.find(a => a.id === 'master_5_perfect');
      if (ach) newUnlocked.push(ach);
    }

    if (newUnlocked.length > 0) {
      updatedProgress.unlockedAchievementIds = [
        ...updatedProgress.unlockedAchievementIds,
        ...newUnlocked.map(a => a.id)
      ];
    }

    // Upsert progress to Supabase
    await supabase
      .from('user_progress')
      .upsert({
        user_id: userId,
        real_name: updatedProgress.realName,
        total_games_played: updatedProgress.totalGamesPlayed,
        perfect_scores: updatedProgress.perfectScores,
        current_streak: updatedProgress.currentStreak,
        last_practice_date: updatedProgress.lastPracticeDate,
        unlocked_achievement_ids: updatedProgress.unlockedAchievementIds,
      }, {
        onConflict: 'user_id'
      });

    return { progress: updatedProgress, newAchievements: newUnlocked };
  },

  // Reset data (for debugging)
  resetData: async (userId: string) => {
    await supabase.from('word_learning_states').delete().eq('user_id', userId);
    await supabase.from('user_progress').delete().eq('user_id', userId);
    window.location.reload();
  },

  // --- Quiz Management Methods ---

  createQuiz: async (title: string, content: any[], classId?: string | null, targetStudentIds?: string[] | null): Promise<Quiz | null> => {
    const insertData: any = { title, content };
    if (classId) insertData.class_id = classId;
    if (targetStudentIds && targetStudentIds.length > 0) insertData.target_student_ids = targetStudentIds;

    const { data, error } = await supabase
      .from('quizzes')
      .insert([insertData])
      .select()
      .single();

    if (error) {
      console.error('Error creating quiz:', error);
      return null;
    }
    return data as Quiz;
  },



  deleteQuiz: async (quizId: string): Promise<boolean> => {
    // Delete the quiz. Quiz results should CASCADE delete if the DB is set up that way,
    // or we can just delete from quizzes table directly.
    const { error } = await supabase.from('quizzes').delete().eq('id', quizId);
    if (error) {
      console.error('Error deleting quiz:', error);
      return false;
    }
    return true;
  },

  getActiveQuizzes: async (studentClassId?: string | null): Promise<Quiz[]> => {
    let query = supabase.from('quizzes').select('*').eq('active', true);
    // If student has a class, show quizzes for their class OR quizzes with no class (global)
    if (studentClassId) {
      query = query.or(`class_id.eq.${studentClassId},class_id.is.null`);
    }
    const { data: allQuizzes, error } = await query.order('published_at', { ascending: false });

    if (error) {
      console.error('Error fetching active quizzes:', error);
      return [];
    }

    return (allQuizzes as Quiz[]) || [];
  },

  // Get quiz completion stats for the teacher dashboard (with per-student details)
  getQuizCompletionStats: async (classId?: string | null): Promise<{
    quizId: string;
    title: string;
    publishedAt: string;
    totalStudents: number;
    completedCount: number;
    averageScore: number;
    completionRate: number;
    completedStudents: { name: string; bestScore: number; total: number; attempts: number }[];
    incompleteStudents: { name: string }[];
  }[]> => {
    // Get active quizzes (filtered by class if specified)
    let quizQuery = supabase.from('quizzes').select('*').eq('active', true);
    if (classId) quizQuery = quizQuery.or(`class_id.eq.${classId},class_id.is.null`);
    const { data: quizzesData } = await quizQuery.order('published_at', { ascending: false });
    const quizzes = (quizzesData as Quiz[]) || [];

    if (!quizzes || quizzes.length === 0) return [];

    // Get students (filtered by class)
    let studentsQuery = supabase.from('user_progress').select('user_id, real_name');
    if (classId) studentsQuery = studentsQuery.eq('class_id', classId);
    const { data: students } = await studentsQuery;
    const allStudents = (students || []).map(s => ({ userId: s.user_id, name: s.real_name || s.user_id }));
    const totalStudents = allStudents.length;

    // Get all quiz results (with user_id for per-student breakdown)
    const { data: results } = await supabase
      .from('quiz_results')
      .select('quiz_id, user_id, score, total');

    // Group results by quiz_id -> user_id -> best score & attempts
    const resultsByQuiz = new Map<string, Map<string, { bestScore: number; total: number; attempts: number }>>();
    (results || []).forEach(r => {
      if (!resultsByQuiz.has(r.quiz_id)) resultsByQuiz.set(r.quiz_id, new Map());
      const quizMap = resultsByQuiz.get(r.quiz_id)!;
      const existing = quizMap.get(r.user_id);
      if (existing) {
        existing.bestScore = Math.max(existing.bestScore, r.score);
        existing.attempts += 1;
      } else {
        quizMap.set(r.user_id, { bestScore: r.score, total: r.total, attempts: 1 });
      }
    });

    return quizzes.map(q => {
      const quizResults = resultsByQuiz.get(q.id) || new Map();
      const completedCount = quizResults.size; // unique students
      const allScores = Array.from(quizResults.values());
      const avgPercent = completedCount > 0
        ? Math.round(allScores.reduce((sum, s) => sum + s.bestScore, 0) / allScores.reduce((sum, s) => sum + s.total, 0) * 100)
        : 0;

      // Filter students who are actually targeted by this quiz
      const targetedStudents = allStudents.filter(s => {
        if (!q.target_student_ids || q.target_student_ids.length === 0) return true;
        return q.target_student_ids.includes(s.userId);
      });
      const quizTotalStudents = targetedStudents.length;

      // Build completed/incomplete student lists
      const completedStudents = targetedStudents
        .filter(s => quizResults.has(s.userId))
        .map(s => {
          const r = quizResults.get(s.userId)!;
          return { name: s.name, bestScore: r.bestScore, total: r.total, attempts: r.attempts };
        })
        .sort((a, b) => (b.bestScore / b.total) - (a.bestScore / a.total)); // sort by score desc

      const incompleteStudents = targetedStudents
        .filter(s => !quizResults.has(s.userId))
        .map(s => ({ name: s.name }));

      return {
        quizId: q.id,
        title: q.title,
        publishedAt: q.published_at,
        totalStudents: quizTotalStudents,
        completedCount,
        averageScore: avgPercent,
        completionRate: quizTotalStudents > 0 ? Math.round((completedCount / quizTotalStudents) * 100) : 0,
        completedStudents,
        incompleteStudents,
      };
    });
  },

  // Submit a quiz result (insert new row each time to allow retakes & track all attempts)
  submitQuizResult: async (quizId: string, userId: string, score: number, total: number): Promise<boolean> => {
    const { error } = await supabase
      .from('quiz_results')
      .insert({
        quiz_id: quizId,
        user_id: userId,
        score,
        total,
        completed_at: new Date().toISOString(),
      });

    if (error) {
      console.error('Error submitting quiz result:', error);
      return false;
    }
    return true;
  },

  // Get all quiz results for a specific user
  getUserQuizResults: async (userId: string): Promise<Record<string, { score: number; total: number }>> => {
    const { data, error } = await supabase
      .from('quiz_results')
      .select('quiz_id, score, total')
      .eq('user_id', userId);

    if (error) {
      console.error('Error fetching quiz results:', error);
      return {};
    }

    const resultMap: Record<string, { score: number; total: number }> = {};
    (data || []).forEach(r => {
      resultMap[r.quiz_id] = { score: r.score, total: r.total };
    });
    return resultMap;
  },

  // Get comprehensive student learning report
  getStudentReport: async (userId: string, classId?: string | null): Promise<{
    realName: string;
    totalGamesPlayed: number;
    perfectScores: number;
    currentStreak: number;
    lastPracticeDate: string;
    overallAccuracy: number;
    masteredWordCount: number;
    totalWordsStudied: number;
    topErrorWords: { term: string; definition: string; errorCount: number; totalAttempts: number }[];
    masteredWords: { term: string; definition: string }[];
    achievements: string[];
    quizResults: { title: string; score: number; total: number; completedAt: string }[];
    classComparison: { totalStudents: number; classAvgAccuracy: number; classAvgGames: number; rank: number };
  }> => {
    // 1. User progress
    const { data: prog } = await supabase
      .from('user_progress')
      .select('*')
      .eq('user_id', userId)
      .single();

    const progress = prog || { real_name: '未知', total_games_played: 0, perfect_scores: 0, current_streak: 0, last_practice_date: '', unlocked_achievement_ids: [] };

    // 2. Word learning states
    const { data: states } = await supabase
      .from('word_learning_states')
      .select('word_id, interval_days, error_count, total_attempts')
      .eq('user_id', userId);

    const allStates = states || [];
    const totalWordsStudied = allStates.length;
    const masteredStates = allStates.filter(s => s.error_count === 0 && s.total_attempts >= 2);
    const masteredWordCount = masteredStates.length;
    const totalAttempts = allStates.reduce((sum, s) => sum + (s.total_attempts || 0), 0);
    const totalErrors = allStates.reduce((sum, s) => sum + (s.error_count || 0), 0);
    const overallAccuracy = totalAttempts > 0 ? Math.round(((totalAttempts - totalErrors) / totalAttempts) * 100) : 0;

    // 3. Top error words (top 10)
    const errorStates = allStates
      .filter(s => s.error_count > 0)
      .sort((a, b) => b.error_count - a.error_count)
      .slice(0, 10);

    // Collect all word IDs we need (errors + mastered)
    const allNeededWordIds = [
      ...errorStates.map(s => s.word_id),
      ...masteredStates.map(s => s.word_id)
    ];
    const uniqueWordIds = [...new Set(allNeededWordIds)];

    let wordsMap: Record<string, { term: string; definition: string }> = {};
    if (uniqueWordIds.length > 0) {
      const { data: words } = await supabase
        .from('words')
        .select('id, term, definition')
        .in('id', uniqueWordIds);
      (words || []).forEach(w => { wordsMap[w.id] = { term: w.term, definition: w.definition }; });
    }

    const topErrorWords = errorStates.map(s => ({
      term: wordsMap[s.word_id]?.term || '(unknown)',
      definition: wordsMap[s.word_id]?.definition || '',
      errorCount: s.error_count,
      totalAttempts: s.total_attempts || 0,
    }));

    const masteredWords = masteredStates.map(s => ({
      term: wordsMap[s.word_id]?.term || '(unknown)',
      definition: wordsMap[s.word_id]?.definition || '',
    }));

    // 4. Quiz results
    const { data: qResults } = await supabase
      .from('quiz_results')
      .select('quiz_id, score, total, completed_at')
      .eq('user_id', userId);

    let quizResults: { title: string; score: number; total: number; completedAt: string }[] = [];
    if (qResults && qResults.length > 0) {
      const quizIds = qResults.map(r => r.quiz_id);
      const { data: quizzes } = await supabase
        .from('quizzes')
        .select('id, title')
        .in('id', quizIds);

      quizResults = qResults.map(r => {
        const q = (quizzes || []).find(q => q.id === r.quiz_id);
        return {
          title: q?.title || '测验',
          score: r.score,
          total: r.total,
          completedAt: new Date(r.completed_at).toLocaleDateString('zh-CN'),
        };
      });
    }

    // 5. Class comparison — aggregate all students for ranking (optionally filtered by class)
    let progressQuery = supabase.from('user_progress').select('user_id, total_games_played');
    if (classId) progressQuery = progressQuery.eq('class_id', classId);
    else progressQuery = progressQuery.not('class_id', 'is', 'null');
    const { data: allProgress } = await progressQuery;

    const classUserIds = (allProgress || []).map(p => p.user_id);

    let statesQuery = supabase.from('word_learning_states').select('user_id, error_count, total_attempts');
    if (classId && classUserIds.length > 0) statesQuery = statesQuery.in('user_id', classUserIds);
    else if (classId && classUserIds.length === 0) statesQuery = statesQuery.eq('user_id', 'NON_EXISTENT_USER'); // Force empty if no users in class
    const { data: allLearningStates } = await statesQuery;

    const studentStats = new Map<string, { attempts: number; errors: number; games: number }>();
    (allProgress || []).forEach(p => {
      studentStats.set(p.user_id, { attempts: 0, errors: 0, games: p.total_games_played || 0 });
    });
    (allLearningStates || []).forEach(s => {
      const entry = studentStats.get(s.user_id) || { attempts: 0, errors: 0, games: 0 };
      entry.attempts += (s.total_attempts || 0);
      entry.errors += (s.error_count || 0);
      studentStats.set(s.user_id, entry);
    });

    const totalStudents = studentStats.size;
    let classAvgAccuracy = 0;
    let classAvgGames = 0;
    const accuracies: { userId: string; accuracy: number }[] = [];
    studentStats.forEach((v, k) => {
      const acc = v.attempts > 0 ? ((v.attempts - v.errors) / v.attempts) * 100 : 0;
      accuracies.push({ userId: k, accuracy: acc });
      classAvgAccuracy += acc;
      classAvgGames += v.games;
    });
    classAvgAccuracy = totalStudents > 0 ? Math.round(classAvgAccuracy / totalStudents) : 0;
    classAvgGames = totalStudents > 0 ? Math.round(classAvgGames / totalStudents) : 0;

    // Rank by accuracy (descending)
    accuracies.sort((a, b) => b.accuracy - a.accuracy);
    const rank = accuracies.findIndex(a => a.userId === userId) + 1;

    return {
      realName: progress.real_name || '未知姓名',
      totalGamesPlayed: progress.total_games_played,
      perfectScores: progress.perfect_scores,
      currentStreak: progress.current_streak,
      lastPracticeDate: progress.last_practice_date || '无记录',
      overallAccuracy,
      masteredWordCount,
      totalWordsStudied,
      topErrorWords,
      masteredWords,
      achievements: progress.unlocked_achievement_ids || [],
      quizResults,
      classComparison: { totalStudents, classAvgAccuracy, classAvgGames, rank },
    };
  },

  // --- Practice Session Tracking (Plan B: Pre/Post Comparison) ---

  savePracticeSession: async (userId: string, unit: string, correctCount: number, totalCount: number) => {
    const accuracy = totalCount > 0 ? Math.round((correctCount / totalCount) * 10000) / 100 : 0;
    await supabase.from('practice_sessions').insert({
      user_id: userId,
      unit,
      correct_count: correctCount,
      total_count: totalCount,
      accuracy,
    });
  },

  getPrePostComparison: async (userId: string): Promise<{
    unitComparisons: { unit: string; firstAccuracy: number; firstDate: string; latestAccuracy: number; latestDate: string; sessionsCount: number; improvement: number }[];
    overallFirst: number;
    overallLatest: number;
    overallImprovement: number;
  }> => {
    const { data: sessions } = await supabase
      .from('practice_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (!sessions || sessions.length === 0) {
      return { unitComparisons: [], overallFirst: 0, overallLatest: 0, overallImprovement: 0 };
    }

    // Group by unit
    const unitMap = new Map<string, typeof sessions>();
    sessions.forEach(s => {
      if (!unitMap.has(s.unit)) unitMap.set(s.unit, []);
      unitMap.get(s.unit)!.push(s);
    });

    const unitComparisons: { unit: string; firstAccuracy: number; firstDate: string; latestAccuracy: number; latestDate: string; sessionsCount: number; improvement: number }[] = [];

    unitMap.forEach((unitSessions, unit) => {
      if (unitSessions.length < 1) return;
      const first = unitSessions[0]; // already sorted ascending
      const latest = unitSessions[unitSessions.length - 1];
      const improvement = Number(latest.accuracy) - Number(first.accuracy);
      // Prettify unit name: remove book prefix like "NHRW1-"
      const displayUnit = unit.replace(/^[^-]+-/, '');
      unitComparisons.push({
        unit: displayUnit,
        firstAccuracy: Number(first.accuracy),
        firstDate: first.created_at,
        latestAccuracy: Number(latest.accuracy),
        latestDate: latest.created_at,
        sessionsCount: unitSessions.length,
        improvement,
      });
    });

    // Overall: average of first sessions vs average of latest sessions
    const firstAccuracies = unitComparisons.map(c => c.firstAccuracy);
    const latestAccuracies = unitComparisons.map(c => c.latestAccuracy);
    const overallFirst = firstAccuracies.length > 0 ? Math.round(firstAccuracies.reduce((a, b) => a + b, 0) / firstAccuracies.length) : 0;
    const overallLatest = latestAccuracies.length > 0 ? Math.round(latestAccuracies.reduce((a, b) => a + b, 0) / latestAccuracies.length) : 0;

    return {
      unitComparisons,
      overallFirst,
      overallLatest,
      overallImprovement: overallLatest - overallFirst,
    };
  },

  // --- Notifications ---
  sendReminders,
  getUnreadNotifications,
  dismissNotifications,
};

// --- Helper functions ---

// Map Supabase snake_case row to frontend camelCase Word interface
function mapDbWordToWord(row: any): Word {
  return {
    id: row.id,
    term: row.term,
    definition: row.definition,
    exampleSentence: row.example_sentence || '',
    exampleSentenceTranslation: row.example_sentence_translation || '',
    extendedSentence: row.extended_sentence || '',
    extendedSentenceTranslation: row.extended_sentence_translation || '',
    unit: row.unit,
    category: row.category || getCategory(row.unit),
    difficulty: row.difficulty,
  };
}

// Determine category from unit string
function getCategory(unit: string): string {
  if (unit.startsWith('CET-4') || unit.startsWith('CET4')) return 'CET4';
  if (unit.startsWith('CET-6') || unit.startsWith('CET6')) return 'CET6';
  return 'TEXTBOOK';
}

// --- Notification Functions ---

async function sendReminders(studentIds: string[], message: string) {
  const rows = studentIds.map(id => ({
    user_id: id,
    message,
    type: 'reminder',
    is_read: false,
  }));
  const { error } = await supabase.from('notifications').insert(rows);
  if (error) throw error;
}

async function getUnreadNotifications(userId: string) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .eq('is_read', false)
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) throw error;
  return data || [];
}

async function dismissNotifications(userId: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);
  if (error) throw error;
}