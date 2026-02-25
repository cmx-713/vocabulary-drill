-- 先清理 public schema 中误建的表（如存在）
DROP TABLE IF EXISTS public.practice_sessions;

-- 在 lexitrack schema 中创建练习会话记录表
CREATE TABLE IF NOT EXISTS lexitrack.practice_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  unit TEXT NOT NULL,
  correct_count INT NOT NULL DEFAULT 0,
  total_count INT NOT NULL DEFAULT 0,
  accuracy NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 索引：按用户+单元查询
CREATE INDEX idx_practice_sessions_user_unit ON lexitrack.practice_sessions(user_id, unit, created_at);

-- RLS 策略
ALTER TABLE lexitrack.practice_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to practice_sessions"
  ON lexitrack.practice_sessions
  FOR ALL
  USING (true)
  WITH CHECK (true);
