-- ============================================
-- LexiTrack: 清除测试数据脚本
-- 🚨 警告：执行此脚本将清空所有学生的练习记录、测验数据和进度
-- 但会保留：题库(words)、班级列表(classes) 和 学生名单(user_progress 中的名单)
-- 请在 Supabase SQL Editor 中执行
-- ============================================

-- 1. 清空单词学习状态（艾宾浩斯记忆数据）
TRUNCATE TABLE lexitrack.word_learning_states CASCADE;

-- 2. 清空练习会话记录（每次打字听写的记录）
TRUNCATE TABLE lexitrack.practice_sessions CASCADE;

-- 3. 清空学生提交的随堂测验结果
TRUNCATE TABLE lexitrack.quiz_results CASCADE;

-- 4. 清空教师发布的随堂测验题目
TRUNCATE TABLE lexitrack.quizzes CASCADE;

-- 5. 重置学生的统计数据（但保留学号、姓名和班级归属）
UPDATE lexitrack.user_progress
SET 
  total_games_played = 0,
  perfect_scores = 0,
  current_streak = 0,
  last_practice_date = NULL;

-- ============================================
-- 执行完毕后，刷新教师端页面，数据将恢复为 0
-- ============================================
