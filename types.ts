export enum UserRole {
  TEACHER = 'TEACHER',
  STUDENT = 'STUDENT',
  NONE = 'NONE'
}

export interface ClassInfo {
  id: string;
  name: string;
}

export interface Word {
  id: string;
  term: string;
  definition: string; // Chinese definition
  exampleSentence?: string; // Standard example (English)
  exampleSentenceTranslation?: string; // Standard example (Chinese)
  extendedSentence?: string; // Advanced/Literature example (English)
  extendedSentenceTranslation?: string; // Advanced/Literature example (Chinese)
  unit: string;
  category: 'TEXTBOOK' | 'CET4' | 'CET6';
  difficulty: number; // 1-5
}

export interface WordLearningState {
  wordId: string;
  nextReviewDate: string; // YYYY-MM-DD
  interval: number; // Days until next review (Ebbinghaus)
  errorCount: number; // Total times answered incorrectly
  totalAttempts: number; // Total times tested
  consecutiveCorrect: number; // For spacing algorithm logic
  lastReviewed: string; // YYYY-MM-DD
}

export interface StudentRecord {
  id: string;
  studentName: string;
  score: number;
  totalWords: number;
  wrongWords: string[]; // IDs of wrong words
  date: string;
}

export interface ClassGroup {
  id: string;
  name: string;
  inviteCode: string;
  studentCount: number;
  averageAccuracy: number;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string; // Lucide icon name or simple string identifier
  condition: (progress: UserProgress, states: WordLearningState[]) => boolean;
}

export interface QuizQuestion {
  wordId: string;
  term: string;
  sentenceWithBlank: string;
  translation: string;
  options: string[]; // Usually 4 options including the correct one
}

export interface Quiz {
  id: string;
  title: string;
  content: QuizQuestion[];
  published_at: string;
  active: boolean;
  class_id?: string;
  target_student_ids?: string[];
}

export interface QuizResult {
  id: string;
  quiz_id: string;
  user_id: string;
  score: number;
  total: number;
  completed_at: string;
}

export interface UserProgress {
  totalGamesPlayed: number;
  perfectScores: number;
  currentStreak: number;
  lastPracticeDate: string; // YYYY-MM-DD
  unlockedAchievementIds: string[];
  realName?: string;
  classId?: string;
}

export interface TeacherMetrics {
  classMastery: number; // Percentage of mastered words (interval > 7)
  classAccuracy: number; // Total correct / Total attempts
  topErrorWords: { word: Word; errorCount: number; totalAttempts: number }[];
  inactiveStudents: { userId: string; realName: string; lastPracticeDate: string }[];
  streakLeaderboard: { userId: string; realName: string; streak: number }[];
  allStudents: { userId: string; realName: string; streak: number; lastPracticeDate: string }[];
  totalStudents: number;
  progressLeaderboard: { userId: string; realName: string; improvement: number }[];
}

export interface AppState {
  currentView: 'LANDING' | 'TEACHER_DASH' | 'STUDENT_DASH' | 'DICTATION_GAME' | 'ANALYSIS';
  currentUserRole: UserRole;
  selectedUnit: string | null;
}