-- 预警追踪表：智能体自我反思 — 记录每条预警的后续效果
CREATE TABLE IF NOT EXISTS lexitrack.alert_outcomes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_category TEXT NOT NULL,
  alert_severity TEXT NOT NULL,
  related_user_id TEXT,
  related_word_id TEXT,
  metric_at_alert NUMERIC,
  metric_after    NUMERIC,
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  evaluated_at TIMESTAMPTZ
);

CREATE INDEX idx_alert_outcomes_pending ON lexitrack.alert_outcomes(created_at) WHERE evaluated_at IS NULL;

ALTER TABLE lexitrack.alert_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to alert_outcomes"
  ON lexitrack.alert_outcomes
  FOR ALL
  USING (true)
  WITH CHECK (true);
