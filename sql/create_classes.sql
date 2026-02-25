-- ============================================
-- LexiTrack: 班级管理 — 数据库迁移脚本
-- 请在 Supabase SQL Editor 中执行
-- ============================================

-- 1. 创建 classes（班级）表
CREATE TABLE IF NOT EXISTS lexitrack.classes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 给 user_progress 表添加 class_id 列
ALTER TABLE lexitrack.user_progress
  ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES lexitrack.classes(id) ON DELETE SET NULL;

-- 3. 给 quizzes 表添加 class_id 列（null = 所有班级）
ALTER TABLE lexitrack.quizzes
  ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES lexitrack.classes(id) ON DELETE SET NULL;

-- 4. 创建索引加速查询
CREATE INDEX IF NOT EXISTS idx_user_progress_class_id ON lexitrack.user_progress(class_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_class_id ON lexitrack.quizzes(class_id);

-- 5. RLS 策略 — classes 表
ALTER TABLE lexitrack.classes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to classes" ON lexitrack.classes;
CREATE POLICY "Allow all access to classes" ON lexitrack.classes
  FOR ALL USING (true) WITH CHECK (true);

-- 6. 删除 quiz_results 的唯一约束（如果之前没有执行过）
ALTER TABLE lexitrack.quiz_results DROP CONSTRAINT IF EXISTS quiz_results_quiz_id_user_id_key;
