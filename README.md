# Gmail MCP Gateway

🚀 **統一 Gmail API 接口，讓所有 AI 工具都能操作 Gmail**

## 🎯 專案目標

建立一個「Gmail MCP Gateway」，讓 ChatGPT、Claude、n8n 等所有 AI 工具都能透過統一接口操作 Gmail，支援：

- ✅ 永久 refresh token（不用經常重新登入）
- ✅ 一個 gateway 管理多個 Gmail 帳號
- ✅ 自然語言式控制（「列出 Revolut 收據電郵」、「回覆某封信」）
- ✅ 支援 MCP（Model Context Protocol）協議

## 🏗️ 專案結構

```
📦 gmail-mcp-gateway/
├── 📁 src/
│   ├── index.js          # Express 主入口
│   ├── auth.js           # OAuth 認證和 token 管理
│   └── gmailService.js   # Gmail API 操作
├── .env.example          # 環境變數範例
├── package.json          # 專案依賴
└── README.md            # 說明文件
```

## 🚀 快速開始

### 1. 安裝依賴

```bash
npm install
```

### 2. 設定環境變數

複製 `.env.example` 到 `.env` 並填入你的憑證：

```bash
cp .env.example .env
```

編輯 `.env` 檔案：

```env
# Google OAuth 設定
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback

# Supabase 設定
SUPABASE_URL=your_supabase_url_here
SUPABASE_ANON_KEY=your_supabase_anon_key_here

# Server 設定
PORT=3000
NODE_ENV=development
```

### 3. 設定 Google OAuth

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)
2. 建立新專案或選擇現有專案
3. 啟用 Gmail API
4. 建立 OAuth 2.0 憑證
5. 設定授權重定向 URI：`http://localhost:3000/auth/google/callback`

### 4. 設定 Supabase

1. 前往 [Supabase](https://supabase.com/) 建立新專案
2. 在 SQL Editor 中執行以下 SQL 建立表格：

```sql
CREATE TABLE gmail_users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  picture TEXT,
  access_token TEXT,
  refresh_token TEXT,
  expiry_date BIGINT,
  token_type TEXT,
  scope TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 5. 啟動服務

```bash
# 開發模式
npm run dev

# 生產模式
npm start
```

## 📚 API 文檔

### 認證流程

#### 1. 獲取 OAuth URL
```http
GET /auth/google
```

回應：
```json
{
  "success": true,
  "authUrl": "https://accounts.google.com/oauth/authorize?...",
  "message": "請訪問此 URL 進行 OAuth 認證"
}
```

#### 2. OAuth 回調
```http
GET /auth/google/callback?code=...
```

### Gmail API 端點

#### 列出郵件
```http
GET /api/listEmails?email=user@example.com&query=is:unread&maxResults=10
```

#### 讀取郵件
```http
GET /api/readEmail/:messageId?email=user@example.com
```

#### 發送郵件
```http
POST /api/sendEmail
Content-Type: application/json

{
  "email": "user@example.com",
  "to": "recipient@example.com",
  "subject": "測試郵件",
  "body": "這是測試內容",
  "cc": "cc@example.com",
  "bcc": "bcc@example.com"
}
```

#### 回覆郵件
```http
POST /api/replyEmail
Content-Type: application/json

{
  "email": "user@example.com",
  "threadId": "thread_id_here",
  "subject": "回覆：原主題",
  "body": "回覆內容"
}
```

#### 自然語言查詢
```http
POST /api/naturalQuery
Content-Type: application/json

{
  "email": "user@example.com",
  "query": "列出 Revolut 收據電郵",
  "maxResults": 10
}
```

支援的自然語言模式：
- `"unread"` → `is:unread`
- `"from:revolut"` → `from:revolut`
- `"revolut 收據"` → `from:revolut OR subject:receipt`
- `"今天"` → `newer_than:1d`
- `"昨天"` → `newer_than:2d older_than:1d`

## 🤖 AI 工具整合

### ChatGPT / Claude 使用範例

```python
import requests

# 自然語言查詢
response = requests.post('http://localhost:3000/api/naturalQuery', json={
    "email": "your-email@gmail.com",
    "query": "列出 Revolut 收據電郵"
})

emails = response.json()['data']['messages']
```

### n8n 工作流程

1. 使用 HTTP Request 節點
2. URL: `http://your-gateway.com/api/naturalQuery`
3. Method: POST
4. Body: JSON 格式的查詢

## 🚀 部署

### Railway 部署

1. 推送代碼到 Git：
```bash
git add .
git commit -m "Initial Gmail MCP Gateway"
git push origin main
```

2. 部署到 Railway：
```bash
railway up
```

### Vercel 部署

1. 安裝 Vercel CLI：
```bash
npm i -g vercel
```

2. 部署：
```bash
vercel
```

### Render 部署

1. 連接 GitHub 倉庫
2. 設定環境變數
3. 自動部署

## 🔧 進階功能

### 多帳號支援

在請求中加入 `x-account-id` header：

```http
POST /api/naturalQuery
x-account-id: account1
```

### 自動 Token 刷新

系統會自動檢查 token 過期時間並刷新，無需手動處理。

### 錯誤處理

所有 API 都返回統一的 JSON 格式：

```json
{
  "success": true/false,
  "data": {...},
  "error": "錯誤訊息"
}
```

## 🛠️ 開發

### 本地開發

```bash
npm run dev
```

### 測試

```bash
# 健康檢查
curl http://localhost:3000/health

# 獲取 OAuth URL
curl http://localhost:3000/auth/google
```

## 📝 授權

MIT License

## 🤝 貢獻

歡迎提交 Issue 和 Pull Request！

## 📞 支援

如有問題，請提交 Issue 或聯繫開發者。
