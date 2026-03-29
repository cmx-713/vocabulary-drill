-- 学习计划表：智能体为每个学生自动生成的周学习计划
CREATE TABLE IF NOT EXISTS lexitrack.learning_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  week_start DATE NOT NULL,
  target_new_words INT NOT NULL DEFAULT 10,
  target_review_words INT NOT NULL DEFAULT 20,
  target_sessions INT NOT NULL DEFAULT 5,
  completed_new_words INT NOT NULL DEFAULT 0,
  completed_review_words INT NOT NULL DEFAULT 0,
  completed_sessions INT NOT NULL DEFAULT 0,
  focus_word_ids TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'expired')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, week_start)
);

CREATE INDEX idx_learning_plans_user ON lexitrack.learning_plans(user_id, week_start);

ALTER TABLE lexitrack.learning_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to learning_plans"
  ON lexitrack.learning_plans
  FOR ALL
  USING (true)
  WITH CHECK (true);
