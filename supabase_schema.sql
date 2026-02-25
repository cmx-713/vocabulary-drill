-- ============================================
-- LexiTrack 单词听写系统 - Supabase Schema
-- Schema: lexitrack
-- ============================================

-- 1. 词汇主表
CREATE TABLE lexitrack.words (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  term TEXT NOT NULL,
  definition TEXT NOT NULL,
  example_sentence TEXT,
  example_sentence_translation TEXT,
  extended_sentence TEXT,
  extended_sentence_translation TEXT,
  unit TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('TEXTBOOK', 'CET4', 'CET6')),
  difficulty INT2 DEFAULT 3 CHECK (difficulty BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 学生学习状态表 (艾宾浩斯记忆曲线)
CREATE TABLE lexitrack.word_learning_states (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  word_id UUID NOT NULL REFERENCES lexitrack.words(id) ON DELETE CASCADE,
  next_review_date DATE DEFAULT CURRENT_DATE,
  interval_days INT4 DEFAULT 0,
  error_count INT4 DEFAULT 0,
  total_attempts INT4 DEFAULT 0,
  consecutive_correct INT4 DEFAULT 0,
  last_reviewed DATE DEFAULT CURRENT_DATE,
  UNIQUE(user_id, word_id)
);

-- 3. 用户进度表
CREATE TABLE lexitrack.user_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL,
  real_name TEXT,                    -- 学生真实姓名
  total_games_played INT4 DEFAULT 0,
  perfect_scores INT4 DEFAULT 0,
  current_streak INT4 DEFAULT 0,
  last_practice_date DATE,
  unlocked_achievement_ids TEXT[] DEFAULT '{}'
);

-- 4. 随堂测验表 (AI Generated Quizzes)
CREATE TABLE lexitrack.quizzes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content JSONB NOT NULL, -- Array of QuizQuestions
  published_at TIMESTAMPTZ DEFAULT NOW(),
  active BOOLEAN DEFAULT true
);

-- 如果表已存在，请在 SQL Editor 执行以下语句：
-- ALTER TABLE lexitrack.user_progress ADD COLUMN real_name TEXT;
-- ALTER TABLE lexitrack.word_learning_states ADD COLUMN total_attempts INT4 DEFAULT 0;

-- ============================================
-- RLS (Row Level Security) 策略
-- 允许 anon 角色完全访问（无认证场景）
-- ============================================

ALTER TABLE lexitrack.words ENABLE ROW LEVEL SECURITY;
ALTER TABLE lexitrack.word_learning_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE lexitrack.user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE lexitrack.quizzes ENABLE ROW LEVEL SECURITY;

-- words 表: 所有人可读，教师可写
CREATE POLICY "Allow public read on words"
  ON lexitrack.words FOR SELECT
  TO anon USING (true);

CREATE POLICY "Allow public insert on words"
  ON lexitrack.words FOR INSERT
  TO anon WITH CHECK (true);

CREATE POLICY "Allow public update on words"
  ON lexitrack.words FOR UPDATE
  TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow public delete on words"
  ON lexitrack.words FOR DELETE
  TO anon USING (true);

-- word_learning_states 表: 所有人可读写
CREATE POLICY "Allow public all on word_learning_states"
  ON lexitrack.word_learning_states FOR ALL
  TO anon USING (true) WITH CHECK (true);

-- user_progress 表: 所有人可读写
CREATE POLICY "Allow public all on user_progress"
  ON lexitrack.user_progress FOR ALL
  TO anon USING (true) WITH CHECK (true);

-- quizzes 表: 所有人可读写
CREATE POLICY "Allow public all on quizzes"
  ON lexitrack.quizzes FOR ALL
  TO anon USING (true) WITH CHECK (true);

-- ============================================
-- 暴露 lexitrack schema 给 PostgREST (Supabase API)
-- ============================================

GRANT USAGE ON SCHEMA lexitrack TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA lexitrack TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA lexitrack TO anon, authenticated;

-- 对未来创建的表也自动授权
ALTER DEFAULT PRIVILEGES IN SCHEMA lexitrack
  GRANT ALL ON TABLES TO anon, authenticated;

-- ============================================
-- 预置词汇数据
-- ============================================

INSERT INTO lexitrack.words (term, definition, example_sentence, example_sentence_translation, extended_sentence, extended_sentence_translation, unit, category, difficulty) VALUES
  ('Ambiguous', '模棱两可的；有歧义的',
   'The ending of the movie was ambiguous, leaving the audience debating what happened.',
   '电影的结局模棱两可，留给观众去争论到底发生了什么。',
   'His ambiguous reply made it difficult to discern his true intentions regarding the merger.',
   '他模棱两可的回答让人难以分辨他对这次合并的真实意图。',
   'NHRW1-Unit 1', 'TEXTBOOK', 3),

  ('Benevolent', '仁慈的；乐善好施的',
   'The benevolent donor gave millions to the charity.',
   '这位仁慈的捐赠者向慈善机构捐赠了数百万美元。',
   'A benevolent dictatorship is theoretically ideal but practically impossible to sustain.',
   '仁慈的独裁在理论上是理想的，但在实践中几乎不可能维持。',
   'NHRW1-Unit 1', 'TEXTBOOK', 2),

  ('Diligent', '勤勉的；用功的',
   'He is a diligent student who always finishes his homework on time.',
   '他是个勤奋的学生，总是按时完成作业。',
   'The lawyer conducted a diligent search for the missing heir.',
   '律师对失踪的继承人进行了细致的搜寻。',
   'NHRW2-Unit 1', 'TEXTBOOK', 1),

  ('Abandon', '放弃；抛弃',
   'They had to abandon their car and walk the rest of the way.',
   '他们不得不弃车步行走完剩下的路。',
   'He abandoned his principles for the sake of expediency.',
   '为了权宜之计，他放弃了自己的原则。',
   'CET-4 Set 1', 'CET4', 2),

  ('Hierarchy', '等级制度；阶层',
   'There is a strict hierarchy within the company.',
   '公司内部有严格的等级制度。',
   'Maslow created a hierarchy of needs to explain human motivation.',
   '马斯洛创造了需求层次理论来解释人类的动机。',
   'CET-6 Set 1', 'CET6', 4);
