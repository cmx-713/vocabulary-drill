import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { UserRole, Word, ClassInfo, ClassGroup, StudentRecord, UserProgress, Achievement, TeacherMetrics, QuizQuestion, Quiz } from './types';
import DictationGame from './components/DictationGame';
import TrendChart from './components/TrendChart';
import QuizTake from './components/QuizTake';
import { generateClozeTest } from './services/geminiService';
import { storageService, ACHIEVEMENTS } from './services/storageService';
import AiTutor from './components/AiTutor';
import {
  BookOpen,
  Users,
  TrendingUp,
  Settings,
  Award,
  Clock,
  PlayCircle,
  Plus,
  Upload,
  LogOut,
  BrainCircuit,
  AlertTriangle,
  Layout,
  List,
  Library,
  GraduationCap,
  Book,
  User,
  Lock,
  ArrowLeft,
  KeyRound,
  ArrowRight,
  RefreshCw,
  School,
  CheckCircle2,
  XCircle,
  Database,
  Server,
  Target,
  Flame,
  Crown,
  Sprout,
  X,
  BarChart2,
  Trophy,
  Medal,
  ArrowUp,
  Sparkles,
  Volume2, Wand2, FileText, Printer, Save, Check, ChevronDown, ChevronUp, Trash2, Edit3, Star, Zap, Send, Search, LogIn, ChevronRight, Info, Calendar, Download, Loader2, Brain, Lightbulb, Bell
} from 'lucide-react';

const MOCK_CLASSES: ClassGroup[] = [
  { id: 'c1', name: '大一英语 A 班', inviteCode: 'ENG-101', studentCount: 32, averageAccuracy: 85 },
  { id: 'c2', name: '高级写作 B 班', inviteCode: 'WRT-202', studentCount: 28, averageAccuracy: 72 },
];

const MOCK_RECORDS: StudentRecord[] = [
  { id: 'r1', studentName: '李雷', score: 90, totalWords: 10, wrongWords: ['5'], date: '2023-10-24' },
  { id: 'r2', studentName: '韩梅梅', score: 60, totalWords: 10, wrongWords: ['1', '3', '5', '2'], date: '2023-10-23' },
  { id: 'r3', studentName: '你', score: 80, totalWords: 5, wrongWords: ['1'], date: '今天' },
];

// Mock Data for Leaderboards
const MOCK_DAILY_LEADERBOARD = [
  { id: 's1', name: 'Alice Chen', score: 100, time: '09:15' },
  { id: 's2', name: '李雷', score: 98, time: '10:30' },
  { id: 's3', name: 'Bob Wang', score: 95, time: '11:45' },
  { id: 's4', name: 'David Zhang', score: 92, time: '08:50' },
  { id: 's5', name: 'Eva Wu', score: 88, time: '14:20' },
  { id: 's6', name: 'Frank Liu', score: 85, time: '13:10' },
];

const MOCK_PROGRESS_LEADERBOARD = [
  { id: 'p1', name: 'Grace Ma', increase: 15, current: 85, prev: 70 },
  { id: 'p2', name: 'Henry Zhao', increase: 12, current: 78, prev: 66 },
  { id: 'p3', name: 'Ivy Sun', increase: 10, current: 92, prev: 82 },
  { id: 'p4', name: 'Jack Qian', increase: 8, current: 68, prev: 60 },
  { id: 'p5', name: '韩梅梅', increase: 5, current: 88, prev: 83 },
];

// --- CONSTANTS ---
const TEXTBOOK_SERIES = [
  { id: 'NHRW1', name: '新视野读写教程 1' },
  { id: 'NHRW2', name: '新视野读写教程 2' },
  { id: 'NHRW3', name: '新视野读写教程 3' },
  { id: 'NHRW4', name: '新视野读写教程 4' },
];

const UNIT_LIST = ['Unit 1', 'Unit 2', 'Unit 3', 'Unit 4', 'Unit 5'];

const CET_SETS = {
  CET4: ['CET-4 Set 1', 'CET-4 Set 2', 'CET-4 Set 3', 'CET-4 Set 4', 'CET-4 High Freq'],
  CET6: ['CET-6 Set 1', 'CET-6 Set 2', 'CET-6 Set 3', 'CET-6 Set 4', 'CET-6 Hard'],
};

export default function App() {
  // Restore session from localStorage
  const savedSession = localStorage.getItem('LEXITRACK_SESSION');
  const initialSession = savedSession ? JSON.parse(savedSession) : null;

  const navigate = useNavigate();
  const location = useLocation();

  const [role, setRole] = useState<UserRole>(initialSession?.role || UserRole.NONE);

  // Derive 'view' from URL pathname
  type ViewType = 'LANDING' | 'DASHBOARD' | 'GAME' | 'LEADERBOARD' | 'QUIZ' | 'SETTINGS' | 'CLASS_MANAGE';
  const pathToView: Record<string, ViewType> = useMemo(() => ({
    '/': initialSession ? 'DASHBOARD' : 'LANDING',
    '/dashboard': 'DASHBOARD',
    '/game': 'GAME',
    '/leaderboard': 'LEADERBOARD',
    '/quiz': 'QUIZ',
    '/settings': 'SETTINGS',
    '/classes': 'CLASS_MANAGE',
  }), [initialSession]);
  const view: ViewType = pathToView[location.pathname] || (initialSession ? 'DASHBOARD' : 'LANDING');

  // Login State
  const [isLoggedIn, setIsLoggedIn] = useState(!!initialSession);
  const [loginForm, setLoginForm] = useState({
    username: initialSession?.username || '',
    password: '',
    studentName: initialSession?.studentName || '',
    studentId: initialSession?.studentId || ''
  });
  const [loginError, setLoginError] = useState('');

  // Data States
  const [words, setWords] = useState<Word[]>([]);
  const [userProgress, setUserProgress] = useState<UserProgress | null>(null);
  const [classes, setClasses] = useState<ClassGroup[]>(MOCK_CLASSES);
  // Class Management States
  const [classList, setClassList] = useState<ClassInfo[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [studentClassId, setStudentClassId] = useState<string | null>(initialSession?.classId || null);
  // Class management form states
  const [newClassName, setNewClassName] = useState('');
  const [importClassId, setImportClassId] = useState<string | null>(null);
  const [importText, setImportText] = useState('');
  const [importStatus, setImportStatus] = useState('');
  const [classStudentsMap, setClassStudentsMap] = useState<Record<string, { userId: string; name: string }[]>>({});
  const [expandedMgmtClassId, setExpandedMgmtClassId] = useState<string | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<string>('NHRW1-Unit 1');
  const [pendingUnit, setPendingUnit] = useState<string | null>(null);
  const [practiceWordCount, setPracticeWordCount] = useState<number>(0); // 0 = all
  const [cachedGameWords, setCachedGameWords] = useState<Word[]>([]);

  const [reviewWords, setReviewWords] = useState<Word[]>([]);
  const [mistakeStats, setMistakeStats] = useState<{ word: Word, errorCount: number }[]>([]);
  const [activeQuizzes, setActiveQuizzes] = useState<Quiz[]>([]);
  const [currentQuiz, setCurrentQuiz] = useState<Quiz | null>(null);
  const [quizResults, setQuizResults] = useState<Record<string, { score: number; total: number }>>({});

  // Achievement System State
  const [unlockedAchievement, setUnlockedAchievement] = useState<Achievement | null>(null);

  // Teacher Metrics State
  const [teacherMetrics, setTeacherMetrics] = useState<TeacherMetrics | null>(null);
  const [accuracyTrend, setAccuracyTrend] = useState<{ date: string, accuracy: number }[]>([]);
  const [isGeneratingDiagnosis, setIsGeneratingDiagnosis] = useState(false);
  const [classDiagnosis, setClassDiagnosis] = useState<{ weakness_analysis: string; focus_group: string; teaching_suggestion: string } | null>(null);

  // AI Quiz Generation States
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [generatedQuiz, setGeneratedQuiz] = useState<QuizQuestion[] | null>(null);
  const [isGeneratingWeakness, setIsGeneratingWeakness] = useState(false);
  const [quizModalOpen, setQuizModalOpen] = useState(false);
  const [dailyPracticeWords, setDailyPracticeWords] = useState<Word[]>([]);
  const [loadingDailyPractice, setLoadingDailyPractice] = useState(false);
  const [errorWordBook, setErrorWordBook] = useState<string>('ALL');
  const [errorWordUnit, setErrorWordUnit] = useState<string>('ALL');
  const [quizCompletionStats, setQuizCompletionStats] = useState<{
    quizId: string; title: string; publishedAt: string;
    totalStudents: number; completedCount: number; averageScore: number; completionRate: number;
    completedStudents: { name: string; bestScore: number; total: number; attempts: number }[];
    incompleteStudents: { name: string }[];
  }[]>([]);
  const [expandedQuizId, setExpandedQuizId] = useState<string | null>(null);

  // Teaching Week & Leaderboard states
  const [semesterStart, setSemesterStart] = useState(localStorage.getItem('LEXITRACK_SEMESTER_START') || '');
  const [leaderboardData, setLeaderboardData] = useState<{
    practiceChampions: { userId: string; realName: string; totalGames: number }[];
    perfectScoreChampions: { userId: string; realName: string; perfectScores: number }[];
    vocabularyMasters: { userId: string; realName: string; masteredCount: number }[];
  }>({ practiceChampions: [], perfectScoreChampions: [], vocabularyMasters: [] });
  const [showStudentDetail, setShowStudentDetail] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [studentReport, setStudentReport] = useState<{
    realName: string; totalGamesPlayed: number; perfectScores: number; currentStreak: number;
    lastPracticeDate: string; overallAccuracy: number; masteredWordCount: number; totalWordsStudied: number;
    topErrorWords: { term: string; definition: string; errorCount: number; totalAttempts: number }[];
    masteredWords: { term: string; definition: string }[];
    achievements: string[]; quizResults: { title: string; score: number; total: number; completedAt: string }[];
    classComparison: { totalStudents: number; classAvgAccuracy: number; classAvgGames: number; rank: number };
  } | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportUserId, setReportUserId] = useState('');
  const [prePostComparison, setPrePostComparison] = useState<{
    unitComparisons: { unit: string; firstAccuracy: number; firstDate: string; latestAccuracy: number; latestDate: string; sessionsCount: number; improvement: number }[];
    overallFirst: number; overallLatest: number; overallImprovement: number;
  } | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState<{ id: string; message: string; created_at: string }[]>([]);

  // AI Configuration State (Loaded from localStorage)
  const [aiConfig, setAiConfig] = useState({
    provider: localStorage.getItem('AI_PROVIDER') || 'DeepSeek',
    baseUrl: localStorage.getItem('AI_BASE_URL') || 'https://api.deepseek.com/chat/completions',
    apiKey: localStorage.getItem('AI_API_KEY') || ''
  });
  const [tempAiConfig, setTempAiConfig] = useState(aiConfig);

  // Student UI States
  const [activeCategory, setActiveCategory] = useState<'TEXTBOOK' | 'CET4' | 'CET6'>('TEXTBOOK');
  const [activeBookId, setActiveBookId] = useState<string>('NHRW1');

  // Derive userId from login form
  const userId = role === UserRole.STUDENT ? loginForm.studentId : loginForm.username;


  const refreshData = useCallback(async () => {
    const allWords = await storageService.getWords();
    setWords(allWords);

    if (role === UserRole.TEACHER) {
      // Load class list
      const cls = await storageService.getClasses();
      setClassList(cls);
      // Pass selectedClassId to all teacher APIs
      const cid = selectedClassId;
      const metrics = await storageService.getTeacherMetrics(cid);
      setTeacherMetrics(metrics);
      const trend = await storageService.getClassAccuracyTrend(cid);
      setAccuracyTrend(trend);
      const qStats = await storageService.getQuizCompletionStats(cid);
      setQuizCompletionStats(qStats);
      const lbData = await storageService.getLeaderboardData(cid);
      setLeaderboardData(lbData);
    } else if (role === UserRole.STUDENT && userId) {
      const progress = await storageService.getUserProgress(userId, loginForm.studentName);
      setUserProgress(progress);
      const review = await storageService.getDueReviewWords(userId, 5);
      setReviewWords(review);
      const mistakes = await storageService.getMistakeStats(userId);
      setMistakeStats(mistakes);
      const quizzes = await storageService.getActiveQuizzes(studentClassId);
      setActiveQuizzes(quizzes);
      const results = await storageService.getUserQuizResults(userId);
      setQuizResults(results);
      const notifs = await storageService.getUnreadNotifications(userId);
      setUnreadNotifications(notifs);
    }
  }, [role, userId, selectedClassId, loginForm.studentName, studentClassId]);

  useEffect(() => {
    if (!isLoggedIn) return;
    storageService.init();
    refreshData(); // Initial load
    const interval = setInterval(refreshData, 30000);
    const onFocus = () => refreshData();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [isLoggedIn, refreshData]);

  // --- HANDLERS ---
  const handleRoleSelect = (selectedRole: UserRole) => {
    setRole(selectedRole);
    navigate('/dashboard');
    setLoginError('');
  };

  const handleLogin = async (e: React.FormEvent | React.KeyboardEvent) => {
    if (e.preventDefault) e.preventDefault();
    setLoginError('');
    if (role === UserRole.TEACHER) {
      const savedUser = localStorage.getItem('TEACHER_USERNAME') || 'admin';
      const savedPass = localStorage.getItem('TEACHER_PASSWORD') || 'admin123';

      if (loginForm.username !== savedUser || loginForm.password !== savedPass) {
        setLoginError('用户名或密码错误。');
        return;
      }
      // Save session to localStorage
      localStorage.setItem('LEXITRACK_SESSION', JSON.stringify({
        role: UserRole.TEACHER, username: loginForm.username
      }));
      setIsLoggedIn(true);
    } else if (role === UserRole.STUDENT) {
      if (!loginForm.studentName || !loginForm.studentId) {
        setLoginError('请输入姓名和学号');
        return;
      }
      // Whitelist validation: check if student ID exists in a class roster
      // --- TEST ACCOUNT BYPASS ---
      const isTestAccount = loginForm.studentId === 'test' || loginForm.studentId === '000';

      let validation: { valid: boolean; classId?: string } = { valid: false, classId: undefined };
      if (isTestAccount) {
        validation = { valid: true, classId: undefined }; // Test account is global (no class)
      } else {
        validation = await storageService.validateStudentLogin(loginForm.studentId);
      }

      if (!validation.valid) {
        setLoginError('该学号未注册，请联系教师添加到班级名单中。（提示：可使用学号 test 体验系统）');
        return;
      }
      setStudentClassId(validation.classId || null);
      // Save session to localStorage
      localStorage.setItem('LEXITRACK_SESSION', JSON.stringify({
        role: UserRole.STUDENT, studentName: loginForm.studentName, studentId: loginForm.studentId, classId: validation.classId
      }));
      setIsLoggedIn(true);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('LEXITRACK_SESSION');
    setRole(UserRole.NONE);
    setIsLoggedIn(false);
    setLoginForm({ username: '', password: '', studentName: '', studentId: '' });
    navigate('/');

  };





  const handleGenerateQuiz = async () => {
    if (!teacherMetrics?.topErrorWords || teacherMetrics.topErrorWords.length === 0) {
      alert("当前没有易错词数据，无法生成测验。");
      return;
    }

    if (!selectedClassId) {
      alert("智能测验需要针对具体班级生成，请先在右上角选择一个班级。");
      return;
    }

    setIsGeneratingQuiz(true);
    try {
      const { generateClozeTest } = await import('./services/geminiService');
      const wordsToTest = teacherMetrics.topErrorWords.map(w => w.word).slice(0, 5); // top 5 words
      const quiz = await generateClozeTest(wordsToTest);
      setGeneratedQuiz(quiz);
      setQuizModalOpen(true);
    } catch (err: any) {
      alert(err.message || '生成测验失败，请检查配置。');
    } finally {
      setIsGeneratingQuiz(false);
    }
  };

  const handleSaveAndPublishQuiz = async () => {
    if (!generatedQuiz || !selectedClassId) return;

    try {
      const title = `${new Date().toLocaleDateString('zh-CN')} 随堂测验`;
      const savedQuiz = await storageService.createQuiz(title, generatedQuiz, selectedClassId);
      if (savedQuiz) {
        alert("测验保存并发布成功！已对该班级学生可见。");
        setQuizModalOpen(false);
        setGeneratedQuiz(null);
        refreshData();
      } else {
        alert("保存测验失败");
      }
    } catch (err) {
      console.error("Failed to save quiz:", err);
      alert("保存失败，请稍后重试。");
    }
  };

  const handleDeleteQuiz = async (quizId: string) => {
    if (!confirm('确定要删除这个测验吗？该操作同时会删除学生端的所有相关记录。')) return;
    const success = await storageService.deleteQuiz(quizId);
    if (success) {
      alert("测验已被删除。");
      refreshData();
    } else {
      alert("删除失败，请稍后重试。");
    }
  };

  const handleSaveAiConfig = () => {
    const trimmedUrl = tempAiConfig.baseUrl.trim();
    const trimmedKey = tempAiConfig.apiKey.trim();
    localStorage.setItem('AI_PROVIDER', tempAiConfig.provider);
    localStorage.setItem('AI_BASE_URL', trimmedUrl);
    localStorage.setItem('AI_API_KEY', trimmedKey);
    setAiConfig({ ...tempAiConfig, baseUrl: trimmedUrl, apiKey: trimmedKey });
    alert('AI 设置已保存！');
  };

  const handlePrintQuiz = () => {
    window.print();
  };

  const handleStartDailyPractice = async () => {
    setLoadingDailyPractice(true);
    try {
      const practiceWords = await storageService.getDailyPracticeWords(userId);
      if (practiceWords.length === 0) {
        alert('暂无可练习的词汇。请先在课程列表中导入词汇数据。');
        return;
      }
      setDailyPracticeWords(practiceWords);
      setSelectedUnit('DAILY_PRACTICE');
      navigate('/game');
    } catch (err) {
      console.error('Failed to load daily practice:', err);
      alert('加载今日练习失败，请重试。');
    } finally {
      setLoadingDailyPractice(false);
    }
  };

  const handleViewReport = async (userId: string) => {
    setLoadingReport(true);
    setReportUserId(userId);
    try {
      const report = await storageService.getStudentReport(userId, selectedClassId);
      setStudentReport(report);
      const comparison = await storageService.getPrePostComparison(userId);
      setPrePostComparison(comparison);
    } catch (err) {
      console.error('Failed to load report:', err);
      alert('加载学情报告失败');
    } finally {
      setLoadingReport(false);
    }
  };

  const handleWeaknessBreakthrough = async () => {
    if (mistakeStats.length < 3) {
      alert("你的错词较少，再多积累一些错题再来挑战吧！");
      return;
    }
    setIsGeneratingWeakness(true);
    try {
      const topWrongWords = mistakeStats.slice(0, Math.min(mistakeStats.length, 10)).map(s => s.word);
      const { generateWeaknessBreakthrough } = await import('./services/geminiService');
      const quiz = await generateWeaknessBreakthrough(topWrongWords);
      if (quiz && quiz.length > 0) {
        setGeneratedQuiz(quiz);
        // Create a temporary "Quiz" object to satisfy the QuizTake component's props
        const aiQuiz: Quiz = {
          id: 'ai-weakness-session',
          title: 'AI 弱点突破测验',
          content: quiz,
          active: true,
          published_at: new Date().toISOString(),
        };
        setCurrentQuiz(aiQuiz);
        navigate('/quiz');
      }
    } catch (err: any) {
      alert(err.message || '生成挑战失败');
    } finally {
      setIsGeneratingWeakness(false);
    }
  };

  const handleGenerateClassDiagnosis = async () => {
    if (!teacherMetrics) return;
    setIsGeneratingDiagnosis(true);
    try {
      const { generateClassDiagnosis } = await import('./services/geminiService');
      const report = await generateClassDiagnosis(teacherMetrics);
      setClassDiagnosis(report);
    } catch (err: any) {
      alert(err.message || '生成诊断报告失败，请检查配置。');
    } finally {
      setIsGeneratingDiagnosis(false);
    }
  };

  const handleGameComplete = async (results: { correct: string[], wrong: string[] }) => {
    console.log("Game Complete:", results);
    const isPerfect = results.wrong.length === 0 && results.correct.length > 0;

    // Update Progress via Service
    const { progress, newAchievements } = await storageService.updateProgress(
      userId,
      isPerfect,
      role === UserRole.STUDENT ? loginForm.studentName : undefined
    );
    setUserProgress(progress);

    // Save practice session for pre/post comparison (only for unit-based practice)
    if (selectedUnit && selectedUnit !== 'DAILY_PRACTICE' && selectedUnit !== 'REVIEW_MODE') {
      const correctCount = results.correct.length;
      const totalCount = results.correct.length + results.wrong.length;
      await storageService.savePracticeSession(userId, selectedUnit, correctCount, totalCount);
    }

    // Refresh review list and stats
    await refreshData();

    // Trigger Notification if achievements unlocked
    if (newAchievements.length > 0) {
      setUnlockedAchievement(newAchievements[0]);
    }
  };

  // --- VIEWS ---

  // 1. ROLE SELECTION (LANDING)
  if (role === UserRole.NONE) {
    return (
      <div className="min-h-screen bg-academy-50 flex flex-col items-center justify-center p-6 relative overflow-hidden">
        {/* Decorative Background Elements */}
        <div className="absolute top-0 left-0 w-full h-64 bg-academy-800 z-0"></div>
        <div className="absolute top-48 left-0 w-full h-24 bg-gradient-to-b from-academy-800 to-transparent z-0 opacity-50"></div>

        <div className="relative z-10 w-full max-w-5xl">
          <div className="text-center mb-16">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-white rounded-full shadow-lg mb-6 text-academy-900 border-4 border-academy-200">
              <School size={40} />
            </div>
            <h1 className="text-5xl font-bold text-white tracking-tight mb-2 font-serif">LexiTrack</h1>
            <p className="text-academy-700 text-lg font-medium tracking-wider">大学英语教学与测评辅助系统</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Teacher Card */}
            <button
              onClick={() => handleRoleSelect(UserRole.TEACHER)}
              className="bg-white group hover:bg-academy-50 border border-gray-200 p-10 rounded-xl transition-all duration-300 text-left shadow-lg hover:shadow-xl hover:-translate-y-1 relative"
            >
              <div className="flex items-start justify-between mb-6">
                <div className="p-4 bg-gray-100 rounded-lg text-gray-700 group-hover:bg-academy-700 group-hover:text-white transition-colors">
                  <Users size={32} />
                </div>
                <span className="text-gray-300 group-hover:text-academy-700 transition-colors"><ArrowRight size={24} /></span>
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-2">我是教师</h3>
              <p className="text-gray-500 leading-relaxed">管理班级教学进度，导入词汇库，通过学情数据优化教学策略。</p>
            </button>

            {/* Student Card */}
            <button
              onClick={() => handleRoleSelect(UserRole.STUDENT)}
              className="bg-white group hover:bg-academy-50 border border-gray-200 p-10 rounded-xl transition-all duration-300 text-left shadow-lg hover:shadow-xl hover:-translate-y-1 relative"
            >
              <div className="flex items-start justify-between mb-6">
                <div className="p-4 bg-gray-100 rounded-lg text-gray-700 group-hover:bg-academy-600 group-hover:text-white transition-colors">
                  <BookOpen size={32} />
                </div>
                <span className="text-gray-300 group-hover:text-academy-600 transition-colors"><ArrowRight size={24} /></span>
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-2">我是学生</h3>
              <p className="text-gray-500 leading-relaxed">完成课后听写任务，复习错题本，实时查看学习进度与排名。</p>
            </button>
          </div>

          <div className="mt-12 text-center text-gray-400 text-sm">
            © 2024 University English Department. All Rights Reserved.
          </div>
        </div>
      </div>
    );
  }

  // 2. LOGIN SCREEN
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-academy-50 flex items-center justify-center p-4">
        <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-8 md:p-12 w-full max-w-md animate-fade-in relative">
          <div className="absolute top-0 left-0 w-full h-2 bg-academy-800 rounded-t-xl"></div>

          <button
            onClick={() => setRole(UserRole.NONE)}
            className="flex items-center text-gray-400 hover:text-gray-700 mb-8 transition-colors group text-sm font-medium"
          >
            <ArrowLeft size={16} className="mr-1 group-hover:-translate-x-1 transition-transform" /> 返回首页
          </button>

          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900 font-serif">
              {role === UserRole.TEACHER ? '教师登录' : '学生登录'}
            </h2>
            <p className="text-gray-500 mt-2 text-sm">请输入您的身份信息以继续</p>
          </div>

          <div className="space-y-6" onKeyDown={(e) => { if (e.key === 'Enter') handleLogin(e); }}>
            {role === UserRole.TEACHER ? (
              <>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">用户名</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type="text"
                      className="w-full bg-gray-50 border border-gray-300 rounded-lg py-3 pl-11 pr-4 focus:outline-none focus:ring-2 focus:ring-academy-800 focus:border-transparent transition-all text-gray-800"
                      value={loginForm.username}
                      onChange={e => setLoginForm({ ...loginForm, username: e.target.value })}
                      autoFocus
                      autoComplete="off"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">密码</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type="password"
                      className="w-full bg-gray-50 border border-gray-300 rounded-lg py-3 pl-11 pr-4 focus:outline-none focus:ring-2 focus:ring-academy-800 focus:border-transparent transition-all text-gray-800"
                      value={loginForm.password}
                      onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
                      autoComplete="new-password"
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">姓名</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type="text"
                      className="w-full bg-gray-50 border border-gray-300 rounded-lg py-3 pl-11 pr-4 focus:outline-none focus:ring-2 focus:ring-academy-600 focus:border-transparent transition-all text-gray-800"
                      value={loginForm.studentName}
                      onChange={e => setLoginForm({ ...loginForm, studentName: e.target.value })}
                      autoFocus
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">学号</label>
                  <div className="relative">
                    <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type="text"
                      className="w-full bg-gray-50 border border-gray-300 rounded-lg py-3 pl-11 pr-4 focus:outline-none focus:ring-2 focus:ring-academy-600 focus:border-transparent transition-all text-gray-800"
                      value={loginForm.studentId}
                      onChange={e => setLoginForm({ ...loginForm, studentId: e.target.value })}
                    />
                  </div>
                </div>
              </>
            )}

            {loginError && (
              <div className="bg-red-50 text-red-700 text-sm py-3 px-4 rounded-lg flex items-center border border-red-200">
                <AlertTriangle size={16} className="mr-2 flex-shrink-0" />
                {loginError}
              </div>
            )}

            <button
              type="button"
              onClick={handleLogin}
              className={`w-full text-white font-bold py-3 rounded-lg shadow-sm hover:shadow-md transition-all active:scale-95 flex items-center justify-center text-base ${role === UserRole.TEACHER
                ? 'bg-academy-800 hover:bg-academy-900'
                : 'bg-academy-600 hover:bg-academy-700'
                }`}
            >
              登录系统 <ArrowRight size={18} className="ml-2" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Shared Report Modal JSX ---
  const reportModalJSX = studentReport ? (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-fade-in print:bg-white print:backdrop-blur-none">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto print:max-h-none print:shadow-none print:rounded-none">
        <div className="bg-gradient-to-r from-academy-800 to-academy-700 text-white p-8 rounded-t-2xl print:rounded-none relative">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold font-serif mb-1">学情报告</h2>
              <p className="text-academy-200 text-sm">{studentReport.realName} · 学号 {reportUserId}</p>
            </div>
            <div className="flex items-center gap-2 print:hidden">
              <button onClick={() => window.print()} className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors">
                <Printer size={16} /> 打印/导出
              </button>
              <button onClick={() => setStudentReport(null)} className="bg-white/20 hover:bg-white/30 text-white px-3 py-2 rounded-lg transition-colors">
                <X size={18} />
              </button>
            </div>
          </div>
        </div>
        <div className="p-8 space-y-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-academy-50 rounded-xl p-4 text-center border border-academy-100">
              <div className="text-3xl font-bold text-academy-800">{studentReport.totalGamesPlayed}</div>
              <div className="text-xs text-gray-500 font-bold mt-1">练习次数</div>
            </div>
            <div className="bg-emerald-50 rounded-xl p-4 text-center border border-emerald-100">
              <div className="text-3xl font-bold text-emerald-700">{studentReport.perfectScores}</div>
              <div className="text-xs text-gray-500 font-bold mt-1">满分次数</div>
            </div>
            <div className="bg-amber-50 rounded-xl p-4 text-center border border-amber-100">
              <div className="text-3xl font-bold text-amber-700">{studentReport.overallAccuracy}%</div>
              <div className="text-xs text-gray-500 font-bold mt-1">综合正确率</div>
            </div>
            <div className="bg-indigo-50 rounded-xl p-4 text-center border border-indigo-100">
              <div className="text-3xl font-bold text-indigo-700">{studentReport.masteredWordCount}<span className="text-sm text-gray-400">/{studentReport.totalWordsStudied}</span></div>
              <div className="text-xs text-gray-500 font-bold mt-1">已掌握/总学习</div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <Flame size={20} className="text-orange-500" />
              <div>
                <div className="font-bold text-gray-800">{studentReport.currentStreak} 天</div>
                <div className="text-xs text-gray-400">连续打卡</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <Clock size={20} className="text-gray-500" />
              <div>
                <div className="font-bold text-gray-800">{studentReport.lastPracticeDate}</div>
                <div className="text-xs text-gray-400">最后练习</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <Award size={20} className="text-purple-500" />
              <div>
                <div className="font-bold text-gray-800">{studentReport.achievements.length} 枚</div>
                <div className="text-xs text-gray-400">已获成就</div>
              </div>
            </div>
          </div>
          <div>
            <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2 text-sm">
              <AlertTriangle size={16} className="text-red-500" /> 个人易错词 {studentReport.topErrorWords.length > 0 ? `Top ${studentReport.topErrorWords.length}` : ''}
            </h3>
            {studentReport.topErrorWords.length > 0 ? (
              <div className="overflow-hidden rounded-lg border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left py-2 px-4 text-gray-500 text-xs">#</th>
                      <th className="text-left py-2 px-4 text-gray-500 text-xs">单词</th>
                      <th className="text-left py-2 px-4 text-gray-500 text-xs">释义</th>
                      <th className="text-center py-2 px-4 text-gray-500 text-xs">错误次数</th>
                      <th className="text-center py-2 px-4 text-gray-500 text-xs">错误率</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {studentReport.topErrorWords.map((w, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="py-2 px-4 font-mono text-gray-400">{i + 1}</td>
                        <td className="py-2 px-4 font-bold text-gray-800 font-serif">{w.term}</td>
                        <td className="py-2 px-4 text-gray-500 text-xs">{w.definition}</td>
                        <td className="py-2 px-4 text-center font-bold text-red-600">{w.errorCount}</td>
                        <td className="py-2 px-4 text-center text-red-700 font-mono">{w.totalAttempts > 0 ? Math.round((w.errorCount / w.totalAttempts) * 100) : 0}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-6 bg-emerald-50 rounded-lg border border-emerald-100">
                <CheckCircle2 size={24} className="mx-auto text-emerald-500 mb-2" />
                <p className="text-sm text-emerald-700 font-medium">太棒了！暂无易错词记录</p>
                <p className="text-xs text-gray-400 mt-1">继续保持，坚持每日练习！</p>
              </div>
            )}
          </div>
          {studentReport.quizResults.length > 0 && (
            <div>
              <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2 text-sm">
                <FileText size={16} className="text-indigo-500" /> 测验完成记录
              </h3>
              <div className="space-y-2">
                {studentReport.quizResults.map((q, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <div>
                      <div className="font-medium text-gray-800 text-sm">{q.title}</div>
                      <div className="text-xs text-gray-400">{q.completedAt}</div>
                    </div>
                    <div className={`text-lg font-bold font-mono ${q.score === q.total ? 'text-emerald-600' : 'text-gray-700'}`}>
                      {q.score}/{q.total}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Class Comparison */}
          {'classComparison' in studentReport && (
            <div>
              <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2 text-sm">
                <Users size={16} className="text-academy-600" /> 与班级对比
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-academy-50 rounded-lg p-4 text-center border border-academy-100">
                  <div className="text-2xl font-bold text-academy-800">#{studentReport.classComparison.rank}</div>
                  <div className="text-xs text-gray-500 mt-1">正确率排名 / {studentReport.classComparison.totalStudents}人</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                  <div className="flex justify-between text-xs text-gray-400 mb-2"><span>你</span><span>班级平均</span></div>
                  <div className="flex justify-between items-end">
                    <span className={`text-xl font-bold ${studentReport.overallAccuracy >= studentReport.classComparison.classAvgAccuracy ? 'text-emerald-600' : 'text-amber-600'}`}>{studentReport.overallAccuracy}%</span>
                    <span className="text-sm text-gray-400">{studentReport.classComparison.classAvgAccuracy}%</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-1">正确率</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                  <div className="flex justify-between text-xs text-gray-400 mb-2"><span>你</span><span>班级平均</span></div>
                  <div className="flex justify-between items-end">
                    <span className={`text-xl font-bold ${studentReport.totalGamesPlayed >= studentReport.classComparison.classAvgGames ? 'text-emerald-600' : 'text-amber-600'}`}>{studentReport.totalGamesPlayed}</span>
                    <span className="text-sm text-gray-400">{studentReport.classComparison.classAvgGames}</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-1">练习次数</div>
                </div>
              </div>
            </div>
          )}

          {/* Pre/Post Test Comparison */}
          {prePostComparison && prePostComparison.unitComparisons.length > 0 && (
            <div>
              <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2 text-sm">
                <TrendingUp size={16} className="text-blue-500" /> 前后测对比
              </h3>
              {/* Overall Summary */}
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-100 mb-3">
                <div className="flex items-center justify-center gap-4">
                  <div className="text-center">
                    <div className="text-xs text-gray-400 mb-1">首次平均</div>
                    <div className="text-2xl font-bold text-gray-600">{prePostComparison.overallFirst}%</div>
                  </div>
                  <div className="text-2xl text-gray-300">→</div>
                  <div className="text-center">
                    <div className="text-xs text-gray-400 mb-1">最近平均</div>
                    <div className="text-2xl font-bold text-blue-700">{prePostComparison.overallLatest}%</div>
                  </div>
                  <div className={`text-center px-3 py-1 rounded-full text-sm font-bold ${prePostComparison.overallImprovement >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                    {prePostComparison.overallImprovement >= 0 ? '+' : ''}{prePostComparison.overallImprovement}%
                  </div>
                </div>
              </div>
              {/* Per-unit Breakdown */}
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {prePostComparison.unitComparisons.map((uc, i) => (
                  <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 border border-gray-100 text-sm">
                    <span className="text-gray-700 font-medium truncate w-24">{uc.unit}</span>
                    <span className="text-gray-400">{uc.firstAccuracy}%</span>
                    <span className="text-gray-300">→</span>
                    <span className="text-gray-800 font-bold">{uc.latestAccuracy}%</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${uc.improvement >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                      {uc.improvement >= 0 ? '+' : ''}{uc.improvement}%
                    </span>
                    <span className="text-xs text-gray-400">{uc.sessionsCount}次</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mastered Words */}
          {'masteredWords' in studentReport && (
            <div>
              <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2 text-sm">
                <CheckCircle2 size={16} className="text-emerald-500" /> 已掌握词汇 ({studentReport.masteredWords.length} 词)
              </h3>
              {studentReport.masteredWords.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {studentReport.masteredWords.slice(0, 30).map((w, i) => (
                    <span key={i} className="bg-emerald-50 text-emerald-800 text-xs px-2.5 py-1 rounded-lg border border-emerald-200 font-medium" title={w.definition}>{w.term}</span>
                  ))}
                  {studentReport.masteredWords.length > 30 && (
                    <span className="text-xs text-gray-400 self-center">… 还有 {studentReport.masteredWords.length - 30} 词</span>
                  )}
                </div>
              ) : (
                <div className="text-center py-4 bg-gray-50 rounded-lg border border-gray-100">
                  <p className="text-sm text-gray-500">暂无已掌握词汇（需要连续复习 7 天以上）</p>
                </div>
              )}
            </div>
          )}

          {/* Achievements Detail */}
          {studentReport.achievements.length > 0 && (
            <div>
              <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2 text-sm">
                <Award size={16} className="text-purple-500" /> 已获得成就
              </h3>
              <div className="flex flex-wrap gap-3">
                {ACHIEVEMENTS.filter(a => studentReport.achievements.includes(a.id)).map(ach => (
                  <div key={ach.id} className="flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
                    <AchievementIcon icon={ach.icon} />
                    <div>
                      <div className="text-sm font-bold text-gray-800">{ach.name}</div>
                      <div className="text-xs text-gray-500">{ach.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="text-center text-xs text-gray-400 pt-4 border-t border-gray-100">
            LexiTrack 智能学情系统 · 报告生成时间：{new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </div>
      </div>
    </div>
  ) : null;

  // 3. TEACHER DASHBOARD
  if (role === UserRole.TEACHER) {
    return (
      <>
        <div className="min-h-screen bg-gray-50 flex">
          {/* Sidebar - Academy Dark Mode */}
          <aside className="w-64 bg-academy-900 text-gray-300 hidden md:flex flex-col shadow-xl">
            <div className="p-6 border-b border-academy-800">
              <h2 className="text-xl font-bold text-white flex items-center gap-2 font-serif tracking-wide">
                <School size={24} className="text-academy-300" /> LexiTrack
              </h2>
              <p className="text-xs text-academy-300 mt-1 uppercase tracking-widest">Teacher Panel</p>
            </div>
            <nav className="flex-1 p-4 space-y-2">
              <NavItem
                active={view === 'DASHBOARD'}
                icon={<Layout size={20} />}
                label="班级概览"
                onClick={() => navigate('/dashboard')}
                theme="dark"
              />
              <NavItem
                active={view === 'LEADERBOARD'}
                icon={<Trophy size={20} />}
                label="排行榜"
                onClick={() => navigate('/leaderboard')}
                theme="dark"
              />

              <NavItem
                active={view === 'SETTINGS'}
                icon={<Settings size={20} />}
                label="API 设置"
                onClick={() => navigate('/settings')}
                theme="dark"
              />
              <NavItem
                active={view === 'CLASS_MANAGE'}
                icon={<Users size={20} />}
                label="班级管理"
                onClick={() => navigate('/classes')}
                theme="dark"
              />
            </nav>
            <div className="p-4 border-t border-academy-800 space-y-2">
              <button onClick={handleLogout} className="flex items-center gap-3 text-academy-300 hover:text-red-400 w-full px-4 py-2 rounded-lg transition-colors text-sm hover:bg-academy-800">
                <LogOut size={16} /> 退出系统
              </button>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 overflow-auto bg-gray-50">
            <header className="bg-white border-b border-gray-200 sticky top-0 z-10 px-6 py-4 flex justify-between items-center md:hidden">
              <h1 className="font-bold text-lg text-gray-800 font-serif">LexiTrack</h1>
              <button onClick={handleLogout}><LogOut size={20} className="text-gray-600" /></button>
            </header>

            <div className="p-8 lg:p-12 w-full max-w-[1600px] mx-auto">
              {view === 'DASHBOARD' && (
                <>
                  <div className="flex justify-between items-end mb-8 border-b border-gray-200 pb-6">
                    <div>
                      <h1 className="text-3xl font-bold text-gray-900 font-serif">教学概览</h1>
                      <p className="text-gray-500 mt-1 text-base">欢迎回来，教师。{semesterStart ? (() => {
                        const start = new Date(semesterStart);
                        const now = new Date();
                        const diffDays = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
                        const week = Math.max(1, Math.ceil(diffDays / 7));
                        return `今天是第 ${week} 教学周。`;
                      })() : '请在设置中配置学期开始日期。'}</p>
                    </div>
                    {/* Class Selector Dropdown */}
                    {classList.length > 0 && (
                      <select
                        className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm text-gray-700 font-medium focus:outline-none focus:ring-2 focus:ring-academy-500 cursor-pointer"
                        value={selectedClassId || ''}
                        onChange={e => setSelectedClassId(e.target.value || null)}
                      >
                        <option value="">全部班级</option>
                        {classList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    )}
                  </div>

                  {/* Trend Line Chart */}
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-8">
                    <h3 className="font-bold text-lg text-gray-800 mb-4 flex items-center gap-2">
                      <TrendingUp size={20} className="text-academy-600" /> 班级平均正确率趋势 <span className="text-xs font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded ml-2">最近 7 天</span>
                    </h3>
                    <TrendChart data={accuracyTrend} />
                  </div>

                  {/* Stats Cards - Clean Academy Style */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <StatCard title="词汇掌握度" value={`${teacherMetrics?.classMastery || 0}%`} sub="艾宾浩斯记忆深度" icon={<BrainCircuit className="text-academy-600" size={24} />} />
                    <StatCard title="平均正确率" value={`${teacherMetrics?.classAccuracy || 0}%`} sub="全班练习表现" icon={<Award className="text-emerald-600" size={24} />} />
                    <div onClick={() => setShowStudentDetail(!showStudentDetail)} className="cursor-pointer hover:ring-2 hover:ring-academy-300 rounded-xl transition-all">
                      <StatCard title="注册学生" value={(teacherMetrics?.totalStudents || 0).toString()} sub="点击查看详情" icon={<Users className="text-academy-600" size={24} />} />
                    </div>
                  </div>

                  {/* Active Students Detail Panel */}
                  {showStudentDetail && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-8 overflow-hidden animate-fade-in">
                      <div className="p-4 bg-academy-50 border-b border-academy-100 flex justify-between items-center">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2"><Users size={18} className="text-academy-600" /> 全部学生详情</h3>
                        <button onClick={() => setShowStudentDetail(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                            <tr>
                              <th className="text-left py-3 px-4">姓名</th>
                              <th className="text-left py-3 px-4">学号</th>
                              <th className="text-center py-3 px-4">练习次数</th>
                              <th className="text-center py-3 px-4">满分次数</th>
                              <th className="text-center py-3 px-4">连续打卡</th>
                              <th className="text-center py-3 px-4">最近练习</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {(teacherMetrics?.allStudents || []).map(student => {
                              // Find full data from leaderboard data
                              const practiceInfo = leaderboardData.practiceChampions.find(p => p.userId === student.userId);
                              const perfectInfo = leaderboardData.perfectScoreChampions.find(p => p.userId === student.userId);
                              const inactiveInfo = teacherMetrics?.inactiveStudents.find(s => s.userId === student.userId);
                              return (
                                <tr key={student.userId} className="hover:bg-academy-50 cursor-pointer transition-colors" onClick={() => handleViewReport(student.userId)}>
                                  <td className="py-3 px-4 font-medium text-gray-800">
                                    <span className="hover:underline text-academy-700">{student.realName}</span>
                                  </td>
                                  <td className="py-3 px-4 text-gray-500 font-mono text-xs">{student.userId}</td>
                                  <td className="py-3 px-4 text-center font-bold">{practiceInfo?.totalGames || 0}</td>
                                  <td className="py-3 px-4 text-center font-bold text-emerald-600">{perfectInfo?.perfectScores || 0}</td>
                                  <td className="py-3 px-4 text-center">
                                    <span className="inline-flex items-center gap-1">{student.streak} <Flame size={12} className="text-orange-500" /></span>
                                  </td>
                                  <td className="py-3 px-4 text-center text-xs text-gray-500">{inactiveInfo?.lastPracticeDate || '近 3 天内'}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* AI Class Diagnosis Panel */}
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
                    <div className="p-6 bg-gradient-to-r from-indigo-900 to-purple-900 text-white flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <Brain size={28} className="text-purple-300" />
                        <div>
                          <h3 className="font-bold text-xl font-serif">AI 班级学情诊断与教学建议</h3>
                          <p className="text-indigo-200 text-sm mt-1">基于大模型深度分析近期测验数据，生成个性化辅导策略</p>
                        </div>
                      </div>
                      <button
                        onClick={handleGenerateClassDiagnosis}
                        disabled={isGeneratingDiagnosis}
                        className="bg-white/10 hover:bg-white/20 text-white border border-white/20 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
                      >
                        {isGeneratingDiagnosis ? (
                          <Loader2 size={18} className="animate-spin" />
                        ) : (
                          <Sparkles size={18} className="text-amber-300" />
                        )}
                        <span className="font-bold">{classDiagnosis ? '重新生成诊断' : '一键生成分析报告'}</span>
                      </button>
                    </div>

                    {classDiagnosis && (
                      <div className="p-6 bg-indigo-50/30">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          {/* Weakness Analysis */}
                          <div className="bg-white p-5 rounded-xl border border-indigo-100 shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-1 h-full bg-red-400"></div>
                            <div className="flex items-center gap-2 text-red-600 mb-3">
                              <AlertTriangle size={20} />
                              <h4 className="font-bold text-lg font-serif">词汇短板归因</h4>
                            </div>
                            <p className="text-gray-700 leading-relaxed text-sm">
                              {classDiagnosis.weakness_analysis}
                            </p>
                          </div>

                          {/* Focus Group */}
                          <div className="bg-white p-5 rounded-xl border border-indigo-100 shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-1 h-full bg-amber-400"></div>
                            <div className="flex items-center gap-2 text-amber-600 mb-3">
                              <Users size={20} />
                              <h4 className="font-bold text-lg font-serif">重点关注群体</h4>
                            </div>
                            <p className="text-gray-700 leading-relaxed text-sm">
                              {classDiagnosis.focus_group}
                            </p>
                          </div>

                          {/* Teaching Suggestion */}
                          <div className="bg-white p-5 rounded-xl border border-indigo-100 shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-1 h-full bg-emerald-400"></div>
                            <div className="flex items-center gap-2 text-emerald-600 mb-3">
                              <Lightbulb size={20} />
                              <h4 className="font-bold text-lg font-serif">下一步教学建议</h4>
                            </div>
                            <p className="text-gray-700 leading-relaxed text-sm">
                              {classDiagnosis.teaching_suggestion}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Content Grid */}
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                    {/* Top Error Words Section */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col relative">
                      <div className="flex justify-between items-center p-6 pb-0 mb-2">
                        <h3 onClick={() => { const s = new Set(collapsedSections); s.has('errorWords') ? s.delete('errorWords') : s.add('errorWords'); setCollapsedSections(s); }}
                          className="font-bold text-lg text-gray-800 flex items-center gap-2 cursor-pointer select-none hover:text-academy-600 transition-colors">
                          <AlertTriangle size={20} className="text-red-500" /> 全班易错词 {errorWordBook === 'ALL' ? 'Top 10' : ''}
                          {collapsedSections.has('errorWords') ? <ChevronDown size={18} className="text-gray-400" /> : <ChevronUp size={18} className="text-gray-400" />}
                        </h3>
                        <button
                          onClick={handleGenerateQuiz}
                          disabled={isGeneratingQuiz}
                          className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50 font-semibold shadow-sm"
                        >
                          {isGeneratingQuiz ? (
                            <div className="w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                          ) : (
                            <Sparkles size={14} className="text-amber-500" />
                          )}
                          智能生成测验卷
                        </button>
                      </div>
                      {/* Filter Bar */}
                      {!collapsedSections.has('errorWords') && (
                        <div className="px-6 pb-2 flex flex-wrap items-center gap-2">
                          <select
                            value={errorWordBook}
                            onChange={e => { setErrorWordBook(e.target.value); setErrorWordUnit('ALL'); }}
                            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-gray-50 text-gray-700 focus:outline-none focus:ring-1 focus:ring-academy-400"
                          >
                            <option value="ALL">全部教材</option>
                            {TEXTBOOK_SERIES.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            <option value="CET4">CET-4</option>
                            <option value="CET6">CET-6</option>
                          </select>
                          {errorWordBook !== 'ALL' && (
                            <select
                              value={errorWordUnit}
                              onChange={e => setErrorWordUnit(e.target.value)}
                              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-gray-50 text-gray-700 focus:outline-none focus:ring-1 focus:ring-academy-400"
                            >
                              <option value="ALL">全部单元</option>
                              {errorWordBook.startsWith('NHRW')
                                ? UNIT_LIST.map(u => <option key={u} value={`${errorWordBook}-${u}`}>{u}</option>)
                                : (errorWordBook === 'CET4' ? CET_SETS.CET4 : CET_SETS.CET6).map(s => <option key={s} value={s}>{s}</option>)
                              }
                            </select>
                          )}
                          {errorWordBook !== 'ALL' && (
                            <button onClick={() => { setErrorWordBook('ALL'); setErrorWordUnit('ALL'); }} className="text-[10px] text-gray-400 hover:text-red-500 transition-colors">× 清除筛选</button>
                          )}
                        </div>
                      )}
                      {!collapsedSections.has('errorWords') && (
                        <div className="flex-1 overflow-y-auto space-y-2 max-h-[400px] px-6 pb-6 pr-4">
                          {(() => {
                            const filteredWords = (teacherMetrics?.topErrorWords || []).filter(({ word }) => {
                              if (errorWordBook === 'ALL') return true;
                              if (errorWordUnit !== 'ALL') return word.unit === errorWordUnit;
                              if (errorWordBook.startsWith('NHRW')) return word.unit.startsWith(errorWordBook + '-');
                              if (errorWordBook === 'CET4') return word.unit.startsWith('CET-4');
                              if (errorWordBook === 'CET6') return word.unit.startsWith('CET-6');
                              return true;
                            }).slice(0, errorWordBook === 'ALL' ? 10 : 20);
                            return filteredWords.length > 0 ? filteredWords.map(({ word, errorCount, totalAttempts }) => {
                              const errorRate = totalAttempts > 0 ? ((errorCount / totalAttempts) * 100).toFixed(1) : 0;
                              return (
                                <div key={word.id} className="flex justify-between items-center p-3 bg-red-50/30 rounded-lg border border-red-100/50">
                                  <div>
                                    <p className="font-bold text-gray-800 font-serif">{word.term}</p>
                                    <p className="text-xs text-gray-500">{word.definition}</p>
                                    {errorWordBook === 'ALL' && <p className="text-[10px] text-gray-400 mt-0.5">{word.unit}</p>}
                                  </div>
                                  <div className="text-right flex items-center gap-4">
                                    <div className="text-center hidden sm:block">
                                      <span className="text-sm font-bold text-gray-700">{totalAttempts}<span className="text-[10px] text-gray-400 font-bold ml-1">次测试</span></span>
                                    </div>
                                    <div className="text-center bg-red-100 px-3 py-1 rounded-md hidden sm:block">
                                      <span className="text-sm font-bold text-red-600">{errorCount}<span className="text-[10px] text-red-400 font-bold ml-1">次错误</span></span>
                                    </div>
                                    <div className="text-center min-w-[3.5rem]">
                                      <span className="text-base font-bold text-red-700 font-mono">{errorRate}%</span>
                                      <p className="text-[9px] text-gray-500 uppercase tracking-tighter">错误率</p>
                                    </div>
                                  </div>
                                </div>
                              );
                            }) : (
                              <p className="text-center text-gray-400 py-8 text-sm italic">暂无易错词数据</p>
                            );
                          })()}
                        </div>
                      )}
                    </div>

                    {/* Inactive Students Section */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                          <Clock size={20} className="text-amber-500" /> 懒惰提醒 (超过 7 天未练)
                        </h3>
                        {teacherMetrics?.inactiveStudents && teacherMetrics.inactiveStudents.length > 0 && (
                          <button
                            onClick={async () => {
                              const btn = document.getElementById('send-app-reminder-btn');
                              if (btn) { btn.innerHTML = '<span class="animate-spin mr-1">↻</span> 发送中...'; btn.setAttribute('disabled', 'true'); }
                              try {
                                const students = teacherMetrics.inactiveStudents;
                                const today = new Date();
                                const studentIds = students.map(s => s.userId);
                                const message = `📢 词汇练习提醒：你已超过7天未进行词汇练习，请尽快完成今日练习！坚持每天练习，进步才能看得见！`;
                                await storageService.sendReminders(studentIds, message);
                                if (btn) { btn.innerHTML = '✓ 已一键提醒'; setTimeout(() => { btn.innerHTML = '🔔 站内一键提醒'; btn.removeAttribute('disabled'); }, 3000); }
                              } catch (e) {
                                alert('提醒发送失败，请重试');
                                if (btn) { btn.innerHTML = '🔔 站内一键提醒'; btn.removeAttribute('disabled'); }
                              }
                            }}
                            id="send-app-reminder-btn"
                            className="text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 px-3 py-1.5 rounded-lg transition-colors font-semibold shadow-sm flex items-center"
                          >
                            🔔 站内一键提醒
                          </button>
                        )}
                      </div>
                      <div className="flex-1 overflow-y-auto space-y-2 max-h-[400px] pr-2">
                        {teacherMetrics?.inactiveStudents.map(student => (
                          <div key={student.userId} className="flex justify-between items-center p-3 bg-amber-50/30 rounded-lg border border-amber-100/50">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 font-bold text-xs">
                                {student.realName.charAt(0)}
                              </div>
                              <div>
                                <p className="font-bold text-gray-800 text-sm">{student.realName}</p>
                                <p className="text-[10px] text-gray-400 uppercase tracking-tighter">学号: {student.userId}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-gray-500">最后练习</p>
                              <p className="text-xs font-bold text-gray-700">{student.lastPracticeDate}</p>
                            </div>
                          </div>
                        ))}
                        {(!teacherMetrics?.inactiveStudents || teacherMetrics.inactiveStudents.length === 0) && (
                          <div className="text-center py-8">
                            <CheckCircle2 size={32} className="text-emerald-500 mx-auto mb-2 opacity-20" />
                            <p className="text-gray-400 text-sm italic">全班都很勤奋，都在 3 天内练习过</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Quiz Completion Stats */}
                  {quizCompletionStats.length > 0 && (
                    <div className="col-span-1 xl:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                      <h3 className="font-bold text-lg text-gray-800 mb-4 flex items-center gap-2">
                        <FileText size={20} className="text-academy-600" /> 测验完成率统计
                      </h3>
                      <div className="space-y-3">
                        {quizCompletionStats.map(stat => (
                          <div key={stat.quizId} className="bg-gray-50 rounded-lg border border-gray-100 overflow-hidden">
                            {/* Summary Row */}
                            <div
                              className="flex items-center gap-4 p-4 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                              onClick={() => setExpandedQuizId(expandedQuizId === stat.quizId ? null : stat.quizId)}
                            >
                              <div className="flex-1 min-w-0">
                                <p className="font-bold text-sm text-gray-800 truncate">{stat.title}</p>
                                <p className="text-xs text-gray-400">{new Date(stat.publishedAt).toLocaleDateString('zh-CN')}</p>
                              </div>
                              {/* Progress bar */}
                              <div className="flex-1 hidden sm:block">
                                <div className="w-full bg-gray-200 rounded-full h-2.5">
                                  <div
                                    className={`h-2.5 rounded-full transition-all ${stat.completionRate >= 80 ? 'bg-emerald-500' :
                                      stat.completionRate >= 50 ? 'bg-amber-500' : 'bg-red-400'
                                      }`}
                                    style={{ width: `${Math.min(stat.completionRate, 100)}%` }}
                                  ></div>
                                </div>
                              </div>
                              <div className="text-center min-w-[4rem]">
                                <span className={`text-lg font-bold font-mono ${stat.completionRate >= 80 ? 'text-emerald-600' :
                                  stat.completionRate >= 50 ? 'text-amber-600' : 'text-red-500'
                                  }`}>{stat.completionRate}%</span>
                                <p className="text-[9px] text-gray-400 uppercase">完成率</p>
                              </div>
                              <div className="text-center min-w-[4rem]">
                                <span className="text-sm font-bold text-gray-700">{stat.completedCount}/{stat.totalStudents}</span>
                                <p className="text-[9px] text-gray-400 uppercase">人数</p>
                              </div>
                              <div className="text-center min-w-[4rem]">
                                <span className="text-sm font-bold text-academy-600">{stat.averageScore}%</span>
                                <p className="text-[9px] text-gray-400 uppercase">平均分</p>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDeleteQuiz(stat.quizId); }}
                                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                  title="删除测验"
                                >
                                  <Trash2 size={16} />
                                </button>
                                <ChevronDown size={16} className={`text-gray-400 transition-transform ${expandedQuizId === stat.quizId ? 'rotate-180' : ''}`} />
                              </div>
                            </div>

                            {/* Expanded Detail */}
                            {expandedQuizId === stat.quizId && (
                              <div className="px-4 pb-4 pt-0 border-t border-gray-200 animate-fade-in">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                                  {/* Completed Students */}
                                  <div>
                                    <h4 className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-2 flex items-center gap-1">
                                      <CheckCircle2 size={12} /> 已完成 ({stat.completedStudents.length})
                                    </h4>
                                    {stat.completedStudents.length > 0 ? (
                                      <div className="space-y-1 max-h-40 overflow-y-auto">
                                        {stat.completedStudents.map((s, i) => (
                                          <div key={i} className="flex items-center justify-between bg-emerald-50 rounded px-3 py-1.5 text-sm border border-emerald-100">
                                            <span className="text-gray-800 font-medium">{s.name}</span>
                                            <span className="text-emerald-700 text-xs font-bold">
                                              {s.bestScore}/{s.total}{s.attempts > 1 ? ` (${s.attempts}次)` : ''}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-xs text-gray-400 italic">暂无</p>
                                    )}
                                  </div>
                                  {/* Incomplete Students */}
                                  <div>
                                    <h4 className="text-xs font-bold text-red-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                                      <X size={12} /> 未完成 ({stat.incompleteStudents.length})
                                    </h4>
                                    {stat.incompleteStudents.length > 0 ? (
                                      <div className="space-y-1 max-h-40 overflow-y-auto">
                                        {stat.incompleteStudents.map((s, i) => (
                                          <div key={i} className="flex items-center bg-red-50 rounded px-3 py-1.5 text-sm border border-red-100">
                                            <span className="text-gray-700">{s.name}</span>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-xs text-gray-400 italic">全部完成 🎉</p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {view === 'LEADERBOARD' && (
                <div className="w-full space-y-8 animate-fade-in">
                  <div className="mb-8 border-b border-gray-200 pb-6">
                    <h1 className="text-3xl font-bold text-gray-900 font-serif flex items-center gap-3">
                      <Trophy size={32} className="text-academy-600" />
                      班级风云榜
                    </h1>
                    <p className="text-gray-500 mt-1">查看学生排位与进步情况</p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Streak Leaderboard */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                      <div onClick={() => { const s = new Set(collapsedSections); s.has('streak') ? s.delete('streak') : s.add('streak'); setCollapsedSections(s); }}
                        className="p-6 bg-gradient-to-r from-academy-900 to-academy-800 text-white flex justify-between items-center cursor-pointer select-none">
                        <div className="flex items-center gap-3">
                          <Flame size={24} className="text-orange-400" />
                          <h3 className="font-bold text-lg">连胜记录榜</h3>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs bg-academy-700/50 px-2 py-1 rounded border border-academy-600">荣誉奖章</span>
                          {collapsedSections.has('streak') ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                        </div>
                      </div>
                      {!collapsedSections.has('streak') && (
                        <div className="divide-y divide-gray-100">
                          {(teacherMetrics?.streakLeaderboard || []).map((student, index) => (
                            <div key={student.userId} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                              <div className="flex items-center gap-4">
                                <div className={`w-8 h-8 flex items-center justify-center rounded-full font-bold font-serif ${index === 0 ? 'bg-yellow-100 text-yellow-700' :
                                  index === 1 ? 'bg-gray-100 text-gray-600' :
                                    index === 2 ? 'bg-amber-100 text-amber-700' :
                                      'text-gray-400'
                                  }`}>
                                  {index + 1}
                                </div>
                                <div>
                                  <p className="font-bold text-gray-800">{student.realName}</p>
                                  <p className="text-xs text-gray-400">学号: {student.userId}</p>
                                </div>
                              </div>
                              <div className="text-right flex items-center gap-2">
                                <span className="text-xl font-bold text-orange-600 font-serif">{student.streak}</span>
                                <Flame size={16} className="text-orange-500" />
                              </div>
                            </div>
                          ))}
                          {(!teacherMetrics?.streakLeaderboard || teacherMetrics.streakLeaderboard.length === 0) && (
                            <p className="text-center text-gray-400 py-12 text-sm italic">暂无连胜数据，鼓励学生开始练习吧！</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Progress Leaderboard (超越自我榜) */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                      <div onClick={() => { const s = new Set(collapsedSections); s.has('progress') ? s.delete('progress') : s.add('progress'); setCollapsedSections(s); }}
                        className="p-6 bg-gradient-to-r from-pink-600 to-rose-500 text-white flex justify-between items-center cursor-pointer select-none">
                        <div className="flex items-center gap-3">
                          <TrendingUp size={24} className="text-pink-100" />
                          <h3 className="font-bold text-lg">超越自我榜</h3>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs bg-pink-700/50 px-2 py-1 rounded border border-pink-400">增值评价参数</span>
                          {collapsedSections.has('progress') ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                        </div>
                      </div>
                      {!collapsedSections.has('progress') && (
                        <div className="divide-y divide-gray-100">
                          {(teacherMetrics?.progressLeaderboard || []).map((student, index) => (
                            <div key={student.userId} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                              <div className="flex items-center gap-4">
                                <div className={`w-8 h-8 flex items-center justify-center rounded-full font-bold font-serif ${index === 0 ? 'bg-yellow-100 text-yellow-700' :
                                  index === 1 ? 'bg-gray-100 text-gray-600' :
                                    index === 2 ? 'bg-amber-100 text-amber-700' :
                                      'text-gray-400'
                                  }`}>
                                  {index + 1}
                                </div>
                                <div>
                                  <p className="font-bold text-gray-800">{student.realName}</p>
                                  <p className="text-xs text-gray-400">学号: {student.userId}</p>
                                </div>
                              </div>
                              <div className="text-right flex items-center gap-2 text-emerald-600">
                                <ArrowUp size={16} className="animate-bounce" />
                                <span className="text-xl font-bold font-serif">+{student.improvement}%</span>
                                <span className="text-xs text-gray-400 ml-1">正确率</span>
                              </div>
                            </div>
                          ))}
                          {(!teacherMetrics?.progressLeaderboard || teacherMetrics.progressLeaderboard.length === 0) && (
                            <div className="text-center py-12 px-6">
                              <TrendingUp size={32} className="mx-auto text-gray-300 mb-3" />
                              <p className="text-gray-500 text-sm font-medium">暂无足够的连续练习数据对比</p>
                              <p className="text-gray-400 text-xs mt-1">系统需要 6 天以上的持续练习记录才能测算增幅率</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Practice Champions (练习达人榜) */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                      <div onClick={() => { const s = new Set(collapsedSections); s.has('practice') ? s.delete('practice') : s.add('practice'); setCollapsedSections(s); }}
                        className="p-6 bg-gradient-to-r from-emerald-700 to-emerald-600 text-white flex justify-between items-center cursor-pointer select-none">
                        <div className="flex items-center gap-3">
                          <Target size={24} className="text-emerald-200" />
                          <h3 className="font-bold text-lg">练习达人榜</h3>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs bg-emerald-800/50 px-2 py-1 rounded border border-emerald-500">累计练习次数</span>
                          {collapsedSections.has('practice') ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                        </div>
                      </div>
                      {!collapsedSections.has('practice') && (
                        <div className="divide-y divide-gray-100">
                          {leaderboardData.practiceChampions.map((student, index) => (
                            <div key={student.userId} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                              <div className="flex items-center gap-4">
                                <div className={`w-8 h-8 flex items-center justify-center rounded-full font-bold font-serif ${index === 0 ? 'bg-yellow-100 text-yellow-700' : index === 1 ? 'bg-gray-100 text-gray-600' : index === 2 ? 'bg-amber-100 text-amber-700' : 'text-gray-400'}`}>
                                  {index + 1}
                                </div>
                                <div>
                                  <p className="font-bold text-gray-800">{student.realName}</p>
                                  <p className="text-xs text-gray-400">学号: {student.userId}</p>
                                </div>
                              </div>
                              <div className="text-right flex items-center gap-2">
                                <span className="text-xl font-bold text-emerald-600 font-serif">{student.totalGames}</span>
                                <span className="text-xs text-gray-400">次</span>
                              </div>
                            </div>
                          ))}
                          {leaderboardData.practiceChampions.length === 0 && (
                            <p className="text-center text-gray-400 py-12 text-sm italic">暂无数据</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Perfect Score Champions (满分冠军榜) */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                      <div onClick={() => { const s = new Set(collapsedSections); s.has('perfect') ? s.delete('perfect') : s.add('perfect'); setCollapsedSections(s); }}
                        className="p-6 bg-gradient-to-r from-amber-600 to-yellow-500 text-white flex justify-between items-center cursor-pointer select-none">
                        <div className="flex items-center gap-3">
                          <Crown size={24} className="text-yellow-200" />
                          <h3 className="font-bold text-lg">满分冠军榜</h3>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs bg-amber-700/50 px-2 py-1 rounded border border-amber-400">累计满分次数</span>
                          {collapsedSections.has('perfect') ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                        </div>
                      </div>
                      {!collapsedSections.has('perfect') && (
                        <div className="divide-y divide-gray-100">
                          {leaderboardData.perfectScoreChampions.map((student, index) => (
                            <div key={student.userId} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                              <div className="flex items-center gap-4">
                                <div className={`w-8 h-8 flex items-center justify-center rounded-full font-bold font-serif ${index === 0 ? 'bg-yellow-100 text-yellow-700' : index === 1 ? 'bg-gray-100 text-gray-600' : index === 2 ? 'bg-amber-100 text-amber-700' : 'text-gray-400'}`}>
                                  {index + 1}
                                </div>
                                <div>
                                  <p className="font-bold text-gray-800">{student.realName}</p>
                                  <p className="text-xs text-gray-400">学号: {student.userId}</p>
                                </div>
                              </div>
                              <div className="text-right flex items-center gap-2">
                                <span className="text-xl font-bold text-amber-600 font-serif">{student.perfectScores}</span>
                                <Award size={16} className="text-amber-500" />
                              </div>
                            </div>
                          ))}
                          {leaderboardData.perfectScoreChampions.length === 0 && (
                            <p className="text-center text-gray-400 py-12 text-sm italic">暂无数据</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Vocabulary Masters (词汇掌握量榜) */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                      <div onClick={() => { const s = new Set(collapsedSections); s.has('vocab') ? s.delete('vocab') : s.add('vocab'); setCollapsedSections(s); }}
                        className="p-6 bg-gradient-to-r from-academy-900 to-academy-800 text-white flex justify-between items-center cursor-pointer select-none">
                        <div className="flex items-center gap-3">
                          <BookOpen size={24} className="text-academy-300" />
                          <h3 className="font-bold text-lg">词汇掌握量榜</h3>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs bg-academy-700/50 px-2 py-1 rounded border border-academy-600">已掌握单词数</span>
                          {collapsedSections.has('vocab') ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                        </div>
                      </div>
                      {!collapsedSections.has('vocab') && (
                        <div className="divide-y divide-gray-100">
                          {leaderboardData.vocabularyMasters.map((student, index) => (
                            <div key={student.userId} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                              <div className="flex items-center gap-4">
                                <div className={`w-8 h-8 flex items-center justify-center rounded-full font-bold font-serif ${index === 0 ? 'bg-yellow-100 text-yellow-700' : index === 1 ? 'bg-gray-100 text-gray-600' : index === 2 ? 'bg-amber-100 text-amber-700' : 'text-gray-400'}`}>
                                  {index + 1}
                                </div>
                                <div>
                                  <p className="font-bold text-gray-800">{student.realName}</p>
                                  <p className="text-xs text-gray-400">学号: {student.userId}</p>
                                </div>
                              </div>
                              <div className="text-right flex items-center gap-2">
                                <span className="text-xl font-bold text-academy-700 font-serif">{student.masteredCount}</span>
                                <span className="text-xs text-gray-400">词</span>
                              </div>
                            </div>
                          ))}
                          {leaderboardData.vocabularyMasters.length === 0 && (
                            <p className="text-center text-gray-400 py-12 text-sm italic">暂无数据</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* === Teacher Dashboard Modal Overlays === */}

              {/* Loading AI Quiz Generator Modal */}
              {isGeneratingQuiz && (
                <div className="fixed inset-0 bg-academy-900/40 backdrop-blur-sm z-[100] flex flex-col items-center justify-center animate-fade-in print:hidden">
                  <div className="bg-white p-8 rounded-2xl shadow-2xl border border-white/20 flex flex-col items-center max-w-sm w-full mx-4">
                    <div className="relative mb-6">
                      <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
                      <Wand2 className="absolute inset-0 m-auto text-indigo-600 animate-pulse" size={24} />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">AI 正在命题中...</h3>
                    <p className="text-gray-500 text-sm text-center leading-relaxed">
                      正在根据全班高频易错词，<br />定制专属的完形填空测验卷。<br />请耐心等待。
                    </p>
                  </div>
                </div>
              )}

              {/* Quiz Preview & Publish Modal */}
              {quizModalOpen && generatedQuiz && (
                <div className="fixed inset-0 bg-academy-900/60 backdrop-blur-sm z-[110] flex flex-col items-center py-10 overflow-y-auto print:bg-white print:static print:z-auto print:block print:p-0">
                  <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full mx-4 flex flex-col print:shadow-none print:max-w-none print:mx-0 quiz-print-container relative">
                    {/* Header Setup for Screen, Hidden on Print */}
                    <div className="p-6 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white/95 backdrop-blur z-10 rounded-t-xl print:hidden">
                      <div>
                        <h2 className="text-2xl font-bold text-gray-900 font-serif flex items-center gap-2">
                          <FileText className="text-indigo-600" /> 随堂测验预览
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">基于当前班级易错词 AI 定制</p>
                      </div>
                      <button onClick={() => setQuizModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                        <X size={24} />
                      </button>
                    </div>

                    {/* Quiz Content body */}
                    <div className="p-8 print:p-0 text-gray-800" id="quiz-print-area">
                      {/* Paper Header for Print */}
                      <div className="text-center mb-8 pb-6 border-b-2 border-gray-900 relative">
                        <h1 className="text-3xl font-bold font-serif mb-6 tracking-wide uppercase">LexiTrack Quiz</h1>
                        <div className="flex justify-between items-end text-lg font-serif px-8">
                          <div className="flex gap-2 items-end"><span className="text-sm text-gray-500 uppercase tracking-widest">Name:</span> <span className="border-b border-gray-900 w-32 inline-block"></span></div>
                          <div className="flex gap-2 items-end"><span className="text-sm text-gray-500 uppercase tracking-widest">Class:</span> <span className="border-b border-gray-900 w-24 inline-block"></span></div>
                          <div className="flex gap-2 items-end"><span className="text-sm text-gray-500 uppercase tracking-widest">Date:</span> <span className="border-b border-gray-900 w-32 inline-block"></span></div>
                          <div className="flex gap-2 items-end"><span className="text-sm text-gray-500 uppercase tracking-widest">Score:</span> <span className="border-b border-gray-900 w-24 inline-block"></span></div>
                        </div>
                      </div>

                      <div className="text-lg font-medium text-gray-700 italic mb-6">
                        Directions: Choose the best word to fill in the blank for each sentence.
                      </div>

                      <div className="space-y-8">
                        {generatedQuiz.map((q, index) => (
                          <div key={index} className="quiz-question group">
                            {/* Question */}
                            <p className="text-xl font-serif leading-relaxed mb-4">
                              <span className="font-bold mr-2">{index + 1}.</span>
                              {q.sentenceWithBlank}
                            </p>

                            {/* Options */}
                            <div className="grid grid-cols-2 gap-y-3 gap-x-8 pl-6 mb-3">
                              {q.options.map((opt, optIndex) => (
                                <div key={optIndex} className="flex items-center gap-3 text-lg font-serif">
                                  <span className="font-bold w-6 text-gray-500">{String.fromCharCode(65 + optIndex)}.</span>
                                  <span>{opt}</span>
                                </div>
                              ))}
                            </div>

                            {/* Teacher Hints (Hidden in Print, Visible on Screen) */}
                            <div className="bg-indigo-50/50 p-3 rounded-lg border border-indigo-100/50 text-sm mt-4 print:hidden opacity-0 group-hover:opacity-100 transition-opacity">
                              <p><span className="font-bold text-indigo-700">Answer:</span> <span className="text-emerald-700 font-bold bg-emerald-100 px-2 rounded">{q.term}</span></p>
                              <p className="text-gray-500 mt-1"><span className="font-bold">Translation:</span> {q.translation}</p>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Footer for print */}
                      <div className="mt-16 text-center text-gray-400 text-sm italic border-t border-gray-200 pt-4 hidden print:block mb-8">
                        Generated by LexiTrack AI Assistant
                      </div>
                    </div>

                    {/* Actions, Hidden on Print */}
                    <div className="p-6 bg-gray-50 border-t border-gray-200 flex justify-end gap-3 rounded-b-xl print:hidden">
                      <button
                        onClick={handlePrintQuiz}
                        className="bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 px-6 py-2.5 rounded-lg font-medium transition-colors flex items-center gap-2 shadow-sm"
                      >
                        <Printer size={18} /> 导出 / 打印 PDF
                      </button>
                      <button
                        onClick={handleSaveAndPublishQuiz}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-lg font-bold transition-colors shadow-md flex items-center gap-2"
                      >
                        <Save size={18} /> 保存并发布给学生
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* === CLASS MANAGEMENT VIEW === */}
              {view === 'CLASS_MANAGE' && role === UserRole.TEACHER && (
                <div className="w-full animate-fade-in max-w-3xl mx-auto">
                  <div className="mb-8 border-b border-gray-200 pb-6">
                    <h1 className="text-3xl font-bold text-gray-900 font-serif flex items-center gap-3">
                      <Users size={32} className="text-academy-600" />
                      班级管理
                    </h1>
                    <p className="text-gray-500 mt-1">创建班级、导入学生名单。学生只有在名单中才能登录系统。</p>
                  </div>

                  {/* Create New Class */}
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
                    <h3 className="font-bold text-gray-800 mb-3">创建新班级</h3>
                    <div className="flex gap-3">
                      <input
                        type="text" value={newClassName} onChange={e => setNewClassName(e.target.value)}
                        placeholder="例如：23级英语1班" onKeyDown={e => { if (e.key === 'Enter' && newClassName.trim()) { storageService.createClass(newClassName.trim()).then(() => { setNewClassName(''); refreshData(); }); } }}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-academy-500"
                      />
                      <button onClick={() => { if (!newClassName.trim()) return; storageService.createClass(newClassName.trim()).then(() => { setNewClassName(''); refreshData(); }); }}
                        className="px-6 py-2 bg-academy-700 text-white rounded-lg text-sm font-medium hover:bg-academy-800 transition-colors flex items-center gap-2">
                        <Plus size={16} /> 创建
                      </button>
                    </div>
                  </div>

                  {/* Existing Classes */}
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
                    <h3 className="font-bold text-gray-800 mb-4">已有班级</h3>
                    {classList.length === 0 ? (
                      <p className="text-gray-400 text-sm italic py-4 text-center">还没有创建任何班级。</p>
                    ) : (
                      <div className="space-y-3">
                        {classList.map(c => (
                          <div key={c.id} className="border border-gray-100 rounded-lg overflow-hidden">
                            <div className="flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors"
                              onClick={() => {
                                const newId = expandedMgmtClassId === c.id ? null : c.id;
                                setExpandedMgmtClassId(newId);
                                if (newId && !classStudentsMap[c.id]) {
                                  storageService.getClassStudents(c.id).then(students => setClassStudentsMap(prev => ({ ...prev, [c.id]: students })));
                                }
                              }}>
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-academy-100 text-academy-700 rounded-full flex items-center justify-center text-sm font-bold">
                                  {c.name.charAt(0)}
                                </div>
                                <span className="font-medium text-gray-800">{c.name}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-xs text-gray-400">{classStudentsMap[c.id]?.length ?? '...'} 人</span>
                                <button onClick={(e) => { e.stopPropagation(); if (confirm('确定要删除这个班级吗？')) { storageService.deleteClass(c.id).then(() => refreshData()); } }}
                                  className="text-red-400 hover:text-red-600 p-1"><X size={14} /></button>
                              </div>
                            </div>
                            {expandedMgmtClassId === c.id && (
                              <div className="p-4 border-t border-gray-100">
                                {classStudentsMap[c.id] ? (
                                  classStudentsMap[c.id].length > 0 ? (
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                                      {classStudentsMap[c.id].map(s => (
                                        <div key={s.userId} className="bg-gray-50 rounded px-3 py-2 text-sm flex items-center justify-between group">
                                          <div>
                                            <span className="font-medium text-gray-700">{s.name}</span>
                                            <span className="text-gray-400 ml-2 text-xs">{s.userId}</span>
                                          </div>
                                          <button
                                            onClick={async (e) => {
                                              e.stopPropagation();
                                              if (confirm(`确定要从数据库中彻底删除学生 ${s.name} 及其所有学习记录吗？此操作不可恢复。`)) {
                                                const success = await storageService.deleteStudent(s.userId);
                                                if (success) {
                                                  storageService.getClassStudents(c.id).then(students => setClassStudentsMap(prev => ({ ...prev, [c.id]: students })));
                                                  refreshData();
                                                } else {
                                                  alert("删除失败，请稍后重试");
                                                }
                                              }
                                            }}
                                            className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                                            title="彻底删除学生"
                                          >
                                            <X size={14} />
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  ) : <p className="text-xs text-gray-400 italic">暂无学生</p>
                                ) : <p className="text-xs text-gray-400">加载中...</p>}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Import Students */}
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h3 className="font-bold text-gray-800 mb-3">批量导入学生</h3>
                    <div className="space-y-4">
                      <select value={importClassId || ''} onChange={e => setImportClassId(e.target.value || null)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-academy-500">
                        <option value="">选择目标班级</option>
                        {classList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <textarea
                        value={importText} onChange={e => setImportText(e.target.value)}
                        placeholder={'每行一个学生，格式：学号 姓名\n例如：\n001 张三\n002 李四\n003 王五'}
                        rows={8}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-academy-500 resize-none"
                      />
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">{importStatus}</span>
                        <button onClick={() => {
                          if (!importClassId || !importText.trim()) return;
                          const lines = importText.trim().split('\n').filter(l => l.trim());
                          const students = lines.map(line => {
                            const parts = line.trim().split(/\s+/);
                            return { studentId: parts[0], name: parts.slice(1).join(' ') || parts[0] };
                          }).filter(s => s.studentId);
                          if (students.length === 0) { setImportStatus('未检测到有效数据'); return; }
                          setImportStatus('导入中...');
                          storageService.importStudents(importClassId, students).then(count => {
                            setImportStatus(`成功导入 ${count} 名学生！`);
                            setImportText('');
                            storageService.getClassStudents(importClassId!).then(s => setClassStudentsMap(prev => ({ ...prev, [importClassId!]: s })));
                            refreshData();
                          });
                        }} disabled={!importClassId || !importText.trim()}
                          className="px-6 py-2 bg-academy-700 text-white rounded-lg text-sm font-medium hover:bg-academy-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2">
                          <Upload size={16} /> 导入
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* === SETTINGS VIEW (Teacher Only) === */}
              {view === 'SETTINGS' && role === UserRole.TEACHER && (
                <div className="w-full animate-fade-in max-w-2xl mx-auto">
                  <div className="mb-8 border-b border-gray-200 pb-6">
                    <h1 className="text-3xl font-bold text-gray-900 font-serif flex items-center gap-3">
                      <Settings size={32} className="text-academy-600" />
                      系统与 API 设置
                    </h1>
                    <p className="text-gray-500 mt-1">配置教师账号与本地大模型接口参数</p>
                  </div>

                  {/* Account Settings */}
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 mb-8 space-y-4">
                    <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2"><Lock size={20} className="text-academy-600" /> 修改教师账号</h3>
                    <p className="text-sm text-gray-500 mb-4">修改后将在此浏览器设备生效，下次需使用新账号密码登录。</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">新用户名</label>
                        <input type="text" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-academy-500"
                          id="adminUserInput" defaultValue={localStorage.getItem('TEACHER_USERNAME') || 'admin'} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">新密码</label>
                        <input type="password" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-academy-500"
                          id="adminPassInput" placeholder="输入新密码" />
                      </div>
                    </div>
                    <button onClick={() => {
                      const u = (document.getElementById('adminUserInput') as HTMLInputElement).value.trim();
                      const p = (document.getElementById('adminPassInput') as HTMLInputElement).value.trim();
                      if (!u || !p) { alert('用户名和密码不能为空'); return; }
                      localStorage.setItem('TEACHER_USERNAME', u);
                      localStorage.setItem('TEACHER_PASSWORD', p);
                      alert('教师账号修改成功！下次请使用新账号登录。');
                      (document.getElementById('adminPassInput') as HTMLInputElement).value = '';
                    }} className="px-6 py-2 bg-academy-700 text-white rounded-lg text-sm font-medium hover:bg-academy-800 transition-colors mt-2">
                      保存账号修改
                    </button>
                  </div>

                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 space-y-6">
                    <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2"><Wand2 size={20} className="text-purple-600" /> AI 接口设置</h3>
                    <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-4 rounded-lg text-sm mb-6">
                      <p className="font-bold flex items-center gap-2 mb-1"><AlertTriangle size={16} /> 安全提示</p>
                      <p>此处配置的 API 密钥将直接保存在您当前浏览器的本地缓存区（localStorage）中，且所有的 AI 生成请求均由浏览器直接发出（不会经过任何第三方服务器转发）。请只在值得信任的个人设备上保存密钥。</p>
                    </div>

                    {/* Semester Start Date Config */}
                    <div className="bg-academy-50 border border-academy-200 p-4 rounded-lg">
                      <label className="block text-sm font-medium text-gray-700 mb-1">学期开始日期</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="date"
                          value={semesterStart}
                          onChange={e => {
                            setSemesterStart(e.target.value);
                            localStorage.setItem('LEXITRACK_SEMESTER_START', e.target.value);
                          }}
                          className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-academy-500 focus:border-academy-500 outline-none transition-all"
                        />
                      </div>
                      <p className="text-xs text-gray-400 mt-1">配置后，教学概览页面将自动显示当前是第几教学周。</p>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">AI 接口供应商 (Provider)</label>
                        <select
                          value={tempAiConfig.provider}
                          onChange={e => setTempAiConfig({ ...tempAiConfig, provider: e.target.value })}
                          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-academy-500 focus:border-academy-500 outline-none transition-all"
                        >
                          <option value="DeepSeek">DeepSeek (兼容 OpenAI)</option>
                          <option value="OpenAI">OpenAI (ChatGPT)</option>
                          <option value="Zhipu">智谱 GLM</option>
                          <option value="Custom">自定义 (Ollama 等)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">接口基础地址 (Base URL)</label>
                        <input
                          type="text"
                          value={tempAiConfig.baseUrl}
                          onChange={e => setTempAiConfig({ ...tempAiConfig, baseUrl: e.target.value })}
                          placeholder="例如: https://api.deepseek.com/chat/completions"
                          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-academy-500 focus:border-academy-500 outline-none transition-all font-mono text-sm"
                        />
                        <p className="text-xs text-gray-400 mt-1">请填入支持 OpenAI Chat 格式的终端地址，请确保末尾包含路径（如 `/v1/chat/completions` 或 `/chat/completions` 取决于服务商）。</p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">API 密钥 (API Key)</label>
                        <input
                          type="password"
                          value={tempAiConfig.apiKey}
                          onChange={e => setTempAiConfig({ ...tempAiConfig, apiKey: e.target.value })}
                          placeholder="sk-..."
                          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-academy-500 focus:border-academy-500 outline-none transition-all font-mono"
                        />
                      </div>
                    </div>

                    <div className="pt-6 border-t border-gray-100 flex justify-end">
                      <button
                        onClick={handleSaveAiConfig}
                        className="bg-academy-600 hover:bg-academy-700 text-white font-bold py-3 px-8 rounded-lg shadow-md transition-all flex items-center gap-2"
                      >
                        <Save size={18} /> 确认并保存到本地
                      </button>
                    </div>
                  </div>
                </div>
              )}




            </div>
          </main>
        </div>


        {reportModalJSX}
      </>
    );
  }
  // 4. STUDENT VIEW
  if (role === UserRole.STUDENT) {
    const tutorContext = {
      studentName: loginForm.studentName,
      accuracy: userProgress ? Math.round((userProgress.perfectScores / Math.max(userProgress.totalGamesPlayed, 1)) * 100) : null,
      totalSessions: userProgress?.totalGamesPlayed || 0,
      lastPracticeDate: userProgress?.lastPracticeDate || '暂无记录',
      streak: userProgress?.currentStreak || 0,
      topWrongWords: mistakeStats.slice(0, 8).map(m => ({ term: m.word.term, definition: m.word.definition })),
    };
    if (view === 'GAME') {
      // Use cached words (computed when entering GAME view)
      let gameWords: Word[] = cachedGameWords;
      if (gameWords.length === 0) {
        // Fallback: compute from selected unit (e.g. daily practice / review)
        if (selectedUnit === 'DAILY_PRACTICE') {
          gameWords = dailyPracticeWords;
        } else if (selectedUnit === 'REVIEW_MODE') {
          gameWords = reviewWords.length > 0 ? reviewWords : words.slice(0, 5);
        } else {
          gameWords = words.filter(w => w.unit === selectedUnit);
        }
      }

      return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
          <DictationGame
            words={gameWords}
            userId={loginForm.studentId}
            onComplete={handleGameComplete}
            onExit={() => { setCachedGameWords([]); navigate('/dashboard'); }}
          />
          {unlockedAchievement && (
            <AchievementModal
              achievement={unlockedAchievement}
              onClose={() => setUnlockedAchievement(null)}
            />
          )}
          <AiTutor studentContext={tutorContext} />
        </div>
      );
    }

    if (view === 'QUIZ' && currentQuiz) {
      return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
          <QuizTake
            quiz={currentQuiz}
            onComplete={async (score, total) => {
              const isPerfect = score === total;
              // Submit quiz result to DB
              await storageService.submitQuizResult(currentQuiz.id, userId, score, total);
              const { progress, newAchievements } = await storageService.updateProgress(
                userId,
                isPerfect,
                role === UserRole.STUDENT ? loginForm.studentName : undefined
              );
              setUserProgress(progress);
              await refreshData();

              if (newAchievements.length > 0) {
                setUnlockedAchievement(newAchievements[0]);
              }
            }}
            onExit={() => {
              navigate('/dashboard');
              refreshData();
            }}
          />
          <AiTutor studentContext={tutorContext} />
        </div>
      );
    }


    return (
      <div className="min-h-screen bg-gray-50 pb-20 relative">
        {/* Student Notifications Banner */}
        {unreadNotifications.length > 0 && (
          <div className="bg-amber-50 border-b border-amber-200 p-3 sm:px-6 fixed top-0 w-full z-40 flex flex-col sm:flex-row items-start sm:items-center justify-between shadow-sm animate-fade-in">
            <div className="flex items-start sm:items-center gap-3 w-full sm:w-auto mb-2 sm:mb-0">
              <div className="bg-amber-100 p-1.5 flex-shrink-0 rounded-full text-amber-600 hidden sm:block">
                <Bell size={16} className="animate-pulse" />
              </div>
              <div>
                {unreadNotifications.map(notif => (
                  <p key={notif.id} className="text-amber-800 text-sm font-medium flex items-center gap-1.5">
                    <span className="sm:hidden text-amber-600"><Bell size={14} className="animate-pulse" inline="true" /></span>
                    {notif.message}
                  </p>
                ))}
              </div>
            </div>
            <button
              onClick={async () => {
                await storageService.dismissNotifications(userId);
                setUnreadNotifications([]);
              }}
              className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-sm active:scale-95"
            >
              <CheckCircle2 size={16} /> 这就去练
            </button>
          </div>
        )}

        {/* Global Padding adjustment for banner */}
        <div className={unreadNotifications.length > 0 ? "pt-24 sm:pt-16" : ""}></div>

        {/* Achievement Modal Overlay (if on dashboard) */}
        {unlockedAchievement && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
            <AchievementModal
              achievement={unlockedAchievement}
              onClose={() => setUnlockedAchievement(null)}
            />
          </div>
        )}

        {/* Word Count Selection Modal */}
        {pendingUnit && (() => {
          const unitWords = words.filter(w => w.unit === pendingUnit);
          const total = unitWords.length;
          const presets = [10, 15, 20, 30].filter(n => n < total);
          const displayName = pendingUnit.replace(/^[^-]+-/, '');
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fade-in">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-200">
                {/* Header */}
                <div className="bg-academy-800 text-white p-6">
                  <h3 className="text-xl font-bold font-serif">{displayName}</h3>
                  <p className="text-academy-200 text-sm mt-1">共 {total} 个词汇，选择本次练习数量</p>
                </div>
                {/* Preset Buttons */}
                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    {presets.map(n => (
                      <button
                        key={n}
                        onClick={() => {
                          const shuffled = [...unitWords].sort(() => Math.random() - 0.5);
                          setCachedGameWords(shuffled.slice(0, n));
                          setSelectedUnit(pendingUnit);
                          setPendingUnit(null);
                          navigate('/game');
                        }}
                        className="py-3 rounded-xl border-2 border-academy-200 bg-academy-50 hover:bg-academy-100 hover:border-academy-400 text-academy-800 font-bold text-lg transition-all shadow-sm"
                      >
                        {n} 词
                      </button>
                    ))}
                    <button
                      onClick={() => {
                        setCachedGameWords([...unitWords].sort(() => Math.random() - 0.5));
                        setSelectedUnit(pendingUnit);
                        setPendingUnit(null);
                        navigate('/game');
                      }}
                      className="py-3 rounded-xl border-2 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-400 text-emerald-800 font-bold text-lg transition-all shadow-sm"
                    >
                      全部
                    </button>
                  </div>
                  {/* Custom Input */}
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500 whitespace-nowrap">自定义：</span>
                    <input
                      type="number"
                      min="1"
                      max={total}
                      placeholder={`1-${total}`}
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-academy-400 focus:border-academy-400"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const val = parseInt((e.target as HTMLInputElement).value);
                          if (val > 0 && val <= total) {
                            const shuffled = [...unitWords].sort(() => Math.random() - 0.5);
                            setCachedGameWords(shuffled.slice(0, val));
                            setSelectedUnit(pendingUnit);
                            setPendingUnit(null);
                            navigate('/game');
                          }
                        }
                      }}
                      id="custom-word-count"
                    />
                    <button
                      onClick={() => {
                        const input = document.getElementById('custom-word-count') as HTMLInputElement;
                        const val = parseInt(input?.value);
                        if (val > 0 && val <= total) {
                          const shuffled = [...unitWords].sort(() => Math.random() - 0.5);
                          setCachedGameWords(shuffled.slice(0, val));
                          setSelectedUnit(pendingUnit);
                          setPendingUnit(null);
                          navigate('/game');
                        }
                      }}
                      className="bg-academy-700 hover:bg-academy-800 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors shadow-sm"
                    >
                      开始
                    </button>
                  </div>
                </div>
                {/* Cancel */}
                <div className="px-6 pb-6">
                  <button
                    onClick={() => setPendingUnit(null)}
                    className="w-full py-2.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    取消
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-20">
          <div className="w-full max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <School size={28} className="text-academy-800" />
              <span className="font-bold text-lg text-gray-800 font-serif tracking-tight">LexiTrack</span>
            </div>
            <div className="flex items-center gap-6">
              <span className="hidden md:inline text-sm text-gray-600">
                Student: <span className="font-semibold text-gray-900">{loginForm.studentName || 'Guest'}</span>
              </span>
              <button onClick={handleLogout} className="text-gray-400 hover:text-red-600 flex items-center gap-1 text-sm font-medium transition-colors">
                <LogOut size={16} />
                <span>Exit</span>
              </button>
            </div>
          </div>
        </header>

        <main className="w-full max-w-6xl mx-auto p-6 space-y-8">
          {/* Grid Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

            {/* Left Column: Hero & List */}
            <div className="lg:col-span-2 space-y-8">

              {/* Hero Banner - Academic Blue */}
              <div className="bg-academy-800 rounded-xl p-8 text-white shadow-lg relative overflow-hidden flex flex-col justify-center min-h-[180px]">
                {/* Pattern Overlay */}
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>

                <div className="relative z-10 flex justify-between items-end">
                  <div>
                    <h2 className="text-2xl font-bold mb-2 font-serif tracking-wide">每日单词挑战</h2>
                    <p className="text-academy-200 text-sm mb-6 max-w-sm">
                      坚持是学习语言的唯一捷径。你已经连续打卡 <span className="font-bold text-white">{userProgress?.currentStreak || 0}</span> 天。
                    </p>
                    <button
                      onClick={handleStartDailyPractice}
                      disabled={loadingDailyPractice}
                      className="bg-white text-academy-900 px-6 py-2.5 rounded shadow-sm font-semibold text-sm hover:bg-academy-50 transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      <PlayCircle size={16} /> {loadingDailyPractice ? '正在组卷...' : '开始今日练习'}
                    </button>
                  </div>
                  <div className="hidden sm:block opacity-80">
                    <Award size={80} className="text-academy-300" />
                  </div>
                </div>
              </div>

              {/* Dictation List */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-gray-200 pb-2">
                  <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                    <List size={20} className="text-gray-400" /> 课程列表
                  </h3>
                </div>

                {/* Category Tabs */}
                <div className="flex gap-1 bg-gray-200/50 p-1 rounded-lg w-fit">
                  <TabButton
                    active={activeCategory === 'TEXTBOOK'}
                    onClick={() => setActiveCategory('TEXTBOOK')}
                    label="教科书"
                  />
                  <TabButton
                    active={activeCategory === 'CET4'}
                    onClick={() => setActiveCategory('CET4')}
                    label="CET-4"
                  />
                  <TabButton
                    active={activeCategory === 'CET6'}
                    onClick={() => setActiveCategory('CET6')}
                    label="CET-6"
                  />
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 min-h-[300px]">
                  {/* Sub-Navigation for Books */}
                  {activeCategory === 'TEXTBOOK' && (
                    <div className="mb-6 border-b border-gray-100 pb-2 overflow-x-auto">
                      <div className="flex gap-4">
                        {TEXTBOOK_SERIES.map(book => (
                          <button
                            key={book.id}
                            onClick={() => setActiveBookId(book.id)}
                            className={`pb-2 text-sm font-medium whitespace-nowrap transition-all border-b-2 ${activeBookId === book.id
                              ? 'border-academy-800 text-academy-800'
                              : 'border-transparent text-gray-500 hover:text-gray-700'
                              }`}
                          >
                            {book.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Unit Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {activeCategory === 'TEXTBOOK' && UNIT_LIST.map((unit) => {
                      const unitId = `${activeBookId}-${unit}`;
                      const unitWordCount = words.filter(w => w.unit === unitId).length;
                      const isAvailable = unitWordCount > 0;

                      return (
                        <UnitCard
                          key={unitId}
                          title={unit}
                          count={unitWordCount}
                          isAvailable={isAvailable}
                          onClick={() => {
                            if (isAvailable) {
                              setPendingUnit(unitId);
                            } else {
                              alert(`暂无数据`);
                            }
                          }}
                        />
                      );
                    })}

                    {activeCategory === 'CET4' && CET_SETS.CET4.map((set) => (
                      <UnitCard
                        key={set}
                        title={set}
                        count={words.filter(w => w.unit === set).length}
                        isAvailable={words.filter(w => w.unit === set).length > 0}
                        onClick={() => {
                          if (words.filter(w => w.unit === set).length > 0) { setPendingUnit(set); }
                        }}
                      />
                    ))}

                    {activeCategory === 'CET6' && CET_SETS.CET6.map((set) => (
                      <UnitCard
                        key={set}
                        title={set}
                        count={words.filter(w => w.unit === set).length}
                        isAvailable={words.filter(w => w.unit === set).length > 0}
                        onClick={() => {
                          if (words.filter(w => w.unit === set).length > 0) { setPendingUnit(set); }
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Quick Stats & Actions */}
            <div className="space-y-6">

              {/* Active Quizzes */}
              {activeQuizzes.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-academy-600"></div>
                  <h3 className="font-bold text-gray-800 flex items-center gap-2 mb-4 font-serif">
                    <BookOpen size={18} className="text-academy-600" />
                    随堂测验
                    {activeQuizzes.some(q => !quizResults[q.id]) && (
                      <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full ml-auto animate-pulse">NEW</span>
                    )}
                  </h3>
                  <div className="space-y-3 max-h-[240px] overflow-y-auto pr-1">
                    {activeQuizzes.map(quiz => {
                      const result = quizResults[quiz.id];
                      const isCompleted = !!result;
                      return (
                        <div key={quiz.id} className={`p-3 rounded-lg border shadow-sm flex flex-col gap-2 transition cursor-pointer ${isCompleted
                          ? 'bg-emerald-50 border-emerald-200 hover:shadow-md hover:border-emerald-300'
                          : 'bg-gray-50 border-gray-200 hover:shadow-md hover:border-academy-300'
                          }`}
                          onClick={() => {
                            setCurrentQuiz(quiz);
                            navigate('/quiz');
                          }}
                        >
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-bold text-gray-800">{quiz.title}</span>
                            <span className="text-[10px] text-gray-400">{new Date(quiz.published_at).toLocaleDateString('zh-CN')}</span>
                          </div>
                          {isCompleted ? (
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-emerald-700 font-medium flex items-center gap-1">
                                <CheckCircle2 size={14} /> 最近得分 {result.score}/{result.total}
                              </span>
                              <span className="text-xs text-academy-600 font-medium">再做一次 →</span>
                            </div>
                          ) : (
                            <div className="text-xs text-academy-600 font-medium flex items-center gap-1">
                              <ArrowRight size={12} /> 点击开始测验
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Simple Stats Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 text-center">
                  <div className="text-gray-400 text-[10px] font-bold uppercase tracking-wider mb-1">练习次数</div>
                  <div className="text-3xl font-bold text-gray-800 font-sans">{userProgress?.totalGamesPlayed || 0}</div>
                </div>
                <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 text-center">
                  <div className="text-gray-400 text-[10px] font-bold uppercase tracking-wider mb-1">满分次数</div>
                  <div className="text-3xl font-bold text-emerald-700 font-sans">{userProgress?.perfectScores || 0}</div>
                </div>
              </div>

              {/* Student Self Report Card */}
              <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-gray-800 flex items-center gap-2 font-serif">
                    <FileText size={18} className="text-academy-600" /> 我的学情报告
                  </h3>
                  <button
                    onClick={() => handleViewReport(loginForm.studentId || loginForm.studentName)}
                    disabled={loadingReport}
                    className="text-xs bg-academy-50 hover:bg-academy-100 text-academy-700 border border-academy-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50 font-semibold shadow-sm"
                  >
                    {loadingReport ? '加载中...' : '查看完整报告'}
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-2xl font-bold text-gray-800">{userProgress?.totalGamesPlayed || 0}</div>
                    <div className="text-[10px] text-gray-400 font-bold uppercase">练习次数</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-2xl font-bold text-emerald-600">{userProgress?.perfectScores || 0}</div>
                    <div className="text-[10px] text-gray-400 font-bold uppercase">满分次数</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-2xl font-bold text-orange-600 flex items-center justify-center gap-1">{userProgress?.currentStreak || 0} <Flame size={14} /></div>
                    <div className="text-[10px] text-gray-400 font-bold uppercase">连续打卡</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Full-width Bottom Section: Achievements, Notebook, Error Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            {/* Achievement Section */}
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-800 flex items-center gap-2 font-serif">
                  <Award size={18} className="text-purple-600" /> 我的成就
                </h3>
              </div>
              <div className="space-y-3">
                {ACHIEVEMENTS.map(ach => {
                  const isUnlocked = userProgress?.unlockedAchievementIds.includes(ach.id);
                  return (
                    <div key={ach.id} className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${isUnlocked ? 'bg-purple-50 border-purple-200' : 'bg-gray-50 border-gray-100 opacity-60'}`}>
                      <div className={`p-2 rounded-full ${isUnlocked ? 'bg-white text-purple-600 shadow-sm' : 'bg-gray-200 text-gray-400'}`}>
                        <AchievementIcon icon={ach.icon} />
                      </div>
                      <div>
                        <p className={`text-sm font-bold ${isUnlocked ? 'text-gray-900' : 'text-gray-500'}`}>{ach.name}</p>
                        <p className="text-xs text-gray-500">{ach.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Mistake Notebook - Intelligent Review */}
            <div className="bg-[#fffdf5] rounded-xl p-6 border border-gray-200 shadow-sm relative overflow-hidden transition-all hover:shadow-md">
              <div className="absolute top-0 left-0 w-full h-1 bg-amber-500"></div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-800 flex items-center gap-2 font-serif">
                  <Book size={18} className="text-amber-600" /> 错题本
                </h3>
                {reviewWords.length > 0 ? (
                  <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded border border-red-200 font-bold animate-pulse">
                    {reviewWords.length} 待复习
                  </span>
                ) : (
                  <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200 font-bold">
                    今日已完成
                  </span>
                )}
              </div>

              {/* Review List Preview */}
              {reviewWords.length > 0 ? (
                <div className="space-y-3 mb-6">
                  {reviewWords.slice(0, 3).map(w => (
                    <div key={w.id} className="border-b border-amber-100 pb-1 text-sm text-gray-700 font-serif italic flex justify-between">
                      <span>{w.term}</span>
                      <span className="text-gray-400 not-italic text-xs">{w.definition.substring(0, 10)}...</span>
                    </div>
                  ))}
                  {reviewWords.length > 3 && (
                    <div className="text-xs text-center text-gray-400 mt-2">... and {reviewWords.length - 3} more</div>
                  )}
                </div>
              ) : (
                <div className="py-8 text-center text-gray-400 text-sm italic font-serif">
                  太棒了！你的记忆曲线处于完美状态。
                </div>
              )}

              <button
                onClick={handleWeaknessBreakthrough}
                disabled={mistakeStats.length < 3 || isGeneratingWeakness}
                className={`w-full py-2.5 rounded-lg text-sm font-bold transition-colors shadow-sm border mb-3 flex justify-center items-center gap-2 ${mistakeStats.length >= 3
                  ? 'bg-academy-600 text-white border-academy-700 hover:bg-academy-700'
                  : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                  }`}
              >
                {isGeneratingWeakness ? (
                  <><Loader2 size={18} className="animate-spin" /> AI 生成中...</>
                ) : (
                  mistakeStats.length >= 3 ? '🤖 AI 弱点突破测验' : '积累3个错词解锁AI突破'
                )}
              </button>

              <button
                onClick={() => {
                  if (reviewWords.length > 0) {
                    setSelectedUnit('REVIEW_MODE');
                    navigate('/game');
                  }
                }}
                disabled={reviewWords.length === 0}
                className={`w-full py-2.5 rounded-lg text-sm font-bold transition-colors shadow-sm border ${reviewWords.length > 0
                  ? 'bg-amber-500 text-white border-amber-600 hover:bg-amber-600'
                  : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                  }`}
              >
                {reviewWords.length > 0 ? '开始智能复习 (艾宾浩斯)' : '今日暂无复习任务'}
              </button>
            </div>

            {/* Mistake Statistics */}
            <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-800 flex items-center gap-2 font-serif">
                  <BarChart2 size={18} className="text-gray-600" /> 高频错词榜
                </h3>
              </div>

              {mistakeStats.length > 0 ? (
                <div className="space-y-3">
                  {mistakeStats.map((stat, idx) => (
                    <div key={stat.word.id} className="flex items-center gap-3 text-sm">
                      <span className={`font-mono font-bold w-4 text-center ${idx < 3 ? 'text-red-500' : 'text-gray-400'}`}>{idx + 1}</span>
                      <div className="flex-1">
                        <div className="flex justify-between mb-1">
                          <span className="font-medium text-gray-700">{stat.word.term}</span>
                          <span className="text-xs text-gray-500">{stat.errorCount} 错误</span>
                        </div>
                        <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-red-400 h-full" style={{ width: `${Math.min((stat.errorCount / 5) * 100, 100)}%` }}></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-sm text-gray-400">
                  暂无错题记录。继续保持！
                </div>
              )}
            </div>
          </div>
        </main>
        {reportModalJSX}
        {/* AI 助教悬浮窗 */}
        <AiTutor studentContext={tutorContext} />
      </div>
    );
  }


  return null;
}

// --- SUB-COMPONENTS ---

const TabButton = ({ active, onClick, label }: { active: boolean, onClick: () => void, label: string }) => (
  <button
    onClick={onClick}
    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${active
      ? 'bg-white text-gray-900 shadow-sm'
      : 'text-gray-500 hover:text-gray-700'
      }`}
  >
    {label}
  </button>
);

const UnitCard = ({ title, count, isAvailable, onClick }: { title: string, count: number, isAvailable: boolean, onClick: () => void }) => (
  <div
    className={`p-4 rounded-lg border flex justify-between items-center transition-all
  ${isAvailable
        ? 'bg-white border-gray-200 hover:border-blue-400 cursor-pointer hover:shadow-sm'
        : 'bg-gray-50 border-gray-100 opacity-60 cursor-not-allowed'
      }`}
    onClick={onClick}
  >
    <div>
      <h4 className={`font-bold text-sm ${isAvailable ? 'text-gray-800' : 'text-gray-400'}`}>
        {title}
      </h4>
      <p className="text-xs text-gray-500 mt-1">
        {count > 0 ? `${count} 词汇` : 'Empty'}
      </p>
    </div>
    {isAvailable && <div className="bg-gray-50 p-1.5 rounded-full text-gray-400"><ArrowRight size={14} /></div>}
  </div>
);

const NavItem = ({ active, icon, label, onClick, theme = 'light' }: { active: boolean, icon: React.ReactNode, label: string, onClick: () => void, theme?: 'light' | 'dark' }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-sm font-medium ${theme === 'dark'
      ? active ? 'bg-academy-800 text-white border-l-4 border-blue-400' : 'text-academy-200 hover:text-white hover:bg-academy-800/50'
      : active ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:bg-gray-50'
      }`}
  >
    {icon}
    <span>{label}</span>
  </button>
);

const StatCard = ({ title, value, sub, icon }: { title: string, value: string, sub: string, icon: React.ReactNode }) => (
  <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
    <div className="flex justify-between items-start mb-4">
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <div className="p-2 bg-gray-50 rounded-lg">{icon}</div>
    </div>
    <div>
      <h3 className="text-2xl font-bold text-gray-800 font-serif">{value}</h3>
      <p className="text-xs text-gray-400 mt-1">{sub}</p>
    </div>
  </div>
);

const AchievementIcon = ({ icon }: { icon: string }) => {
  switch (icon) {
    case 'target': return <Target size={20} />;
    case 'flame': return <Flame size={20} />;
    case 'crown': return <Crown size={20} />;
    case 'sprout': return <Sprout size={20} />;
    default: return <Award size={20} />;
  }
};

const AchievementModal = ({ achievement, onClose }: { achievement: Achievement, onClose: () => void }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
    <div className="bg-white rounded-xl shadow-2xl p-8 max-w-sm w-full text-center relative border-4 border-yellow-400 transform transition-all scale-100 hover:scale-105">
      <button onClick={onClose} className="absolute top-2 right-2 text-gray-400 hover:text-gray-600">
        <X size={24} />
      </button>

      <div className="absolute -top-12 left-1/2 -translate-x-1/2">
        <div className="bg-yellow-400 p-4 rounded-full shadow-lg border-4 border-white text-white animate-bounce">
          <AchievementIcon icon={achievement.icon} />
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-2xl font-bold text-gray-800 font-serif mb-2">成就解锁!</h2>
        <div className="h-1 w-16 bg-yellow-400 mx-auto rounded mb-4"></div>
        <h3 className="text-xl font-bold text-purple-700 mb-2">{achievement.name}</h3>
        <p className="text-gray-500 mb-6">{achievement.description}</p>

        <button
          onClick={onClose}
          className="bg-academy-800 text-white px-6 py-2.5 rounded-lg font-bold shadow hover:bg-academy-900 transition-colors w-full"
        >
          太棒了!
        </button>
      </div>
    </div>
  </div>
);