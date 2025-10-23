-- Gmail MCP Gateway 資料庫設定
-- 在 Supabase SQL Editor 中執行此腳本

-- 建立 gmail_users 表格
CREATE TABLE IF NOT EXISTS gmail_users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  picture TEXT,
  access_token TEXT,
  refresh_token TEXT,
  expiry_date BIGINT,
  token_type TEXT,
  scope TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 建立索引以提升查詢效能
CREATE INDEX IF NOT EXISTS idx_gmail_users_email ON gmail_users(email);
CREATE INDEX IF NOT EXISTS idx_gmail_users_created_at ON gmail_users(created_at);

-- 建立更新時間的觸發器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_gmail_users_updated_at 
    BEFORE UPDATE ON gmail_users 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- 設定 Row Level Security (RLS)
ALTER TABLE gmail_users ENABLE ROW LEVEL SECURITY;

-- 建立政策：允許插入和更新自己的資料
CREATE POLICY "Users can manage their own data" ON gmail_users
    FOR ALL USING (true);

-- 建立政策：允許讀取自己的資料
CREATE POLICY "Users can read their own data" ON gmail_users
    FOR SELECT USING (true);

-- 建立政策：允許更新自己的資料
CREATE POLICY "Users can update their own data" ON gmail_users
    FOR UPDATE USING (true);

-- 建立政策：允許插入新資料
CREATE POLICY "Users can insert their own data" ON gmail_users
    FOR INSERT WITH CHECK (true);

-- 建立政策：允許刪除自己的資料
CREATE POLICY "Users can delete their own data" ON gmail_users
    FOR DELETE USING (true);

-- 建立函數：獲取用戶 tokens
CREATE OR REPLACE FUNCTION get_user_tokens(user_email TEXT)
RETURNS TABLE (
    email TEXT,
    access_token TEXT,
    refresh_token TEXT,
    expiry_date BIGINT,
    token_type TEXT,
    scope TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        gu.email,
        gu.access_token,
        gu.refresh_token,
        gu.expiry_date,
        gu.token_type,
        gu.scope
    FROM gmail_users gu
    WHERE gu.email = user_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 建立函數：更新用戶 tokens
CREATE OR REPLACE FUNCTION update_user_tokens(
    user_email TEXT,
    new_access_token TEXT,
    new_expiry_date BIGINT
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE gmail_users 
    SET 
        access_token = new_access_token,
        expiry_date = new_expiry_date,
        updated_at = NOW()
    WHERE email = user_email;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 建立函數：檢查 token 是否過期
CREATE OR REPLACE FUNCTION is_token_expired(user_email TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    token_expiry BIGINT;
BEGIN
    SELECT expiry_date INTO token_expiry
    FROM gmail_users
    WHERE email = user_email;
    
    IF token_expiry IS NULL THEN
        RETURN TRUE;
    END IF;
    
    RETURN EXTRACT(EPOCH FROM NOW()) >= token_expiry;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 插入範例資料（可選）
-- INSERT INTO gmail_users (email, name, access_token, refresh_token, expiry_date, token_type, scope)
-- VALUES ('example@gmail.com', 'Example User', 'access_token_here', 'refresh_token_here', 1234567890, 'Bearer', 'gmail.readonly gmail.send');

-- 顯示設定完成訊息
SELECT 'Gmail MCP Gateway 資料庫設定完成！' AS message;
