const { google } = require('googleapis');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

class AuthService {
  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
  }

  // 生成 OAuth 認證 URL
  getAuthUrl() {
    const scopes = [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.modify'
    ];

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent' // 強制顯示同意畫面以獲取 refresh token
    });
  }

  // 處理 OAuth 回調並儲存 tokens
  async handleCallback(code) {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      this.oauth2Client.setCredentials(tokens);

      // 獲取用戶資訊
      const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
      const { data } = await oauth2.userinfo.get();
      
      const userInfo = {
        email: data.email,
        name: data.name,
        picture: data.picture,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date,
        token_type: tokens.token_type,
        scope: tokens.scope
      };

      // 儲存到 Supabase
      const { data: existingUser, error: fetchError } = await supabase
        .from('gmail_users')
        .select('*')
        .eq('email', data.email)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        throw fetchError;
      }

      if (existingUser) {
        // 更新現有用戶
        const { error: updateError } = await supabase
          .from('gmail_users')
          .update(userInfo)
          .eq('email', data.email);
        
        if (updateError) throw updateError;
      } else {
        // 新增用戶
        const { error: insertError } = await supabase
          .from('gmail_users')
          .insert(userInfo);
        
        if (insertError) throw insertError;
      }

      return { success: true, user: userInfo };
    } catch (error) {
      console.error('OAuth callback error:', error);
      throw error;
    }
  }

  // 獲取用戶 tokens
  async getUserTokens(email) {
    try {
      const { data, error } = await supabase
        .from('gmail_users')
        .select('*')
        .eq('email', email)
        .single();

      if (error) throw error;
      if (!data) throw new Error('User not found');

      return data;
    } catch (error) {
      console.error('Get user tokens error:', error);
      throw error;
    }
  }

  // 刷新 access token
  async refreshAccessToken(email) {
    try {
      const userData = await this.getUserTokens(email);
      
      if (!userData.refresh_token) {
        throw new Error('No refresh token available');
      }

      this.oauth2Client.setCredentials({
        refresh_token: userData.refresh_token
      });

      const { credentials } = await this.oauth2Client.refreshAccessToken();
      
      // 更新 Supabase 中的 tokens
      const { error } = await supabase
        .from('gmail_users')
        .update({
          access_token: credentials.access_token,
          expiry_date: credentials.expiry_date
        })
        .eq('email', email);

      if (error) throw error;

      return credentials;
    } catch (error) {
      console.error('Refresh token error:', error);
      throw error;
    }
  }

  // 檢查 token 是否過期
  isTokenExpired(expiryDate) {
    return new Date() >= new Date(expiryDate);
  }

  // 獲取有效的 OAuth client
  async getValidOAuthClient(email) {
    try {
      const userData = await this.getUserTokens(email);
      
      // 檢查 token 是否過期
      if (this.isTokenExpired(userData.expiry_date)) {
        console.log('Token expired, refreshing...');
        await this.refreshAccessToken(email);
        const updatedData = await this.getUserTokens(email);
        userData.access_token = updatedData.access_token;
        userData.expiry_date = updatedData.expiry_date;
      }

      this.oauth2Client.setCredentials({
        access_token: userData.access_token,
        refresh_token: userData.refresh_token
      });

      return this.oauth2Client;
    } catch (error) {
      console.error('Get valid OAuth client error:', error);
      throw error;
    }
  }
}

module.exports = AuthService;
