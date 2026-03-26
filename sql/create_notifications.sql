-- 站内提醒通知表
CREATE TABLE IF NOT EXISTS notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  message text NOT NULL,
  type text DEFAULT 'reminder',
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- 索引：按用户查询未读通知
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications (user_id, is_read) WHERE is_read = false;

-- RLS 策略
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read own notifications"
  ON notifications FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update own notifications"
  ON notifications FOR UPDATE
  USING (true);
