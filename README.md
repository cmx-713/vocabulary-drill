# LexiTrack - 单词听写智能测评系统

基于 React + Vite 构建的大学英语词汇智能听写与分析平台。

## 🚀 快速启动 (Run Locally)

**环境要求:** Node.js

1. **安装依赖:**
   `npm install`

2. **配置数据库 (Supabase):**
   - 复制 `.env.example`（如果有）或直接创建 `.env.local` 文件。
   - 在 `.env.local` 中填入您的 Supabase 凭证：
     ```env
     VITE_SUPABASE_URL=您的_SUPABASE_URL
     VITE_SUPABASE_ANON_KEY=您的_ANON_KEY
     ```

3. **运行项目:**
   `npm run dev`

> **💡 AI 接口说明：**
> 本项目已将 AI（DeepSeek / Gemini）大模型接口配置项移至**前端 UI 界面**（教师端 -> API 设置）。您无需在本地 `.env` 文件中配置 AI 相关的 API Key，直接在运行后的网页中填入即可安全缓存在浏览器中。

## 📦 部署到 Cloudflare Pages

1. 将代码推送到 GitHub。
2. 在 Cloudflare Pages 中连接您的 GitHub 仓库。
3. 构建命令填入：`npm run build`
4. 输出目录填入：`dist`
5. **重要**：在环境变量 (Environment Variables) 中添加 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`。
6. 点击部署即可。
