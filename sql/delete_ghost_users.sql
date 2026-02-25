-- ============================================
-- LexiTrack: 清除旧测试账号（无班级归属的幽灵用户）
-- 这些是建立班级管理功能之前残留的测试用户
-- 请在 Supabase SQL Editor 中执行
-- ============================================

-- 删除没有班级归属的 user_progress 记录
-- （即 class_id 为 NULL 的用户，这些都是早期测试产生的）
DELETE FROM lexitrack.user_progress
WHERE class_id IS NULL;
