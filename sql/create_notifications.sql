-- 站内提醒通知表 (在 lexitrack schema 下)
CREATE TABLE IF NOT EXISTS lexitrack.notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  message text NOT NULL,
  type text DEFAULT 'reminder',
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- 索引：按用户查询未读通知，提升性能
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON lexitrack.notifications (user_id, is_read) WHERE is_read = false;

-- RLS 权限策略声明
ALTER TABLE lexitrack.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read own notifications"
  ON lexitrack.notifications FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert notifications"
  ON lexitrack.notifications FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update own notifications"
  ON lexitrack.notifications FOR UPDATE
  USING (true);
