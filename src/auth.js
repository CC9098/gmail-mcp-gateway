const { google } = require('googleapis');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

class AuthService {
  constructor() {
    // 多個 Google 憑證配置
    this.configs = {
      personal: {
        clientId: process.env.GOOGLE_CLIENT_ID_PERSONAL,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET_PERSONAL
      },
      companyA: {
        clientId: process.env.GOOGLE_CLIENT_ID_COMPANY_A,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET_COMPANY_A
      },
      companyB: {
        clientId: process.env.GOOGLE_CLIENT_ID_COMPANY_B,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET_COMPANY_B
      }
    };
    
    this.redirectUri = process.env.GOOGLE_REDIRECT_URI;
  }

  // 根據郵箱域名獲取配置
  getConfigForEmail(email) {
    if (email.endsWith('@gmail.com')) {
      return this.configs.personal;
    } else if (email.includes('stceciliacare.com')) {
      return this.configs.companyA;
    } else if (email.includes('summerhillcare.uk')) {
      return this.configs.companyB;
    } else {
      // 預設使用個人配置
      return this.configs.personal;
    }
  }

  // 獲取預設配置（用於 OAuth 流程開始時）
  getDefaultConfig() {
    // 預設使用個人 Gmail 配置
    const config = this.configs.personal;
    console.log('Using default config:', { 
      clientId: config.clientId ? 'Set' : 'Not Set',
      clientSecret: config.clientSecret ? 'Set' : 'Not Set'
    });
    return config;
  }

  // 創建 OAuth2 客戶端
  createOAuth2Client(email) {
    const config = this.getConfigForEmail(email);
    return new google.auth.OAuth2(
      config.clientId,
      config.clientSecret,
      this.redirectUri
    );
  }

  // 生成 OAuth 認證 URL
  getAuthUrl(email = '') {
    const scopes = [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.modify'
    ];

    // 如果沒有指定郵箱，使用預設配置
    const config = email ? this.getConfigForEmail(email) : this.getDefaultConfig();
    const oauth2Client = new google.auth.OAuth2(
      config.clientId,
      config.clientSecret,
      this.redirectUri
    );
    
    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent' // 強制顯示同意畫面以獲取 refresh token
    });
  }

  // 處理 OAuth 回調並儲存 tokens
  async handleCallback(code, email = '') {
    try {
      console.log('OAuth callback started with code:', code);
      
      // 使用預設配置處理 OAuth 回調
      const config = this.getDefaultConfig();
      console.log('OAuth config:', {
        clientId: config.clientId,
        clientSecret: config.clientSecret ? 'Set' : 'Not Set',
        redirectUri: this.redirectUri
      });
      
      const oauth2Client = new google.auth.OAuth2(
        config.clientId,
        config.clientSecret,
        this.redirectUri
      );
      
      console.log('Getting tokens from Google...');
      const { tokens } = await oauth2Client.getToken(code);
      console.log('Tokens received:', { 
        access_token: tokens.access_token ? 'Set' : 'Not Set',
        refresh_token: tokens.refresh_token ? 'Set' : 'Not Set',
        expiry_date: tokens.expiry_date
      });
      
      oauth2Client.setCredentials(tokens);

      // 獲取用戶資訊
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
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
      console.log('Storing user data to Supabase:', { email: data.email });
      const { data: existingUser, error: fetchError } = await supabase
        .from('gmail_users')
        .select('*')
        .eq('email', data.email)
        .single();
      
      console.log('Supabase fetch result:', { existingUser, fetchError });

      if (fetchError && fetchError.code !== 'PGRST116') {
        throw fetchError;
      }

      if (existingUser) {
        // 更新現有用戶
        console.log('Updating existing user:', data.email);
        const { error: updateError } = await supabase
          .from('gmail_users')
          .update(userInfo)
          .eq('email', data.email);
        
        console.log('Update result:', { updateError });
        if (updateError) throw updateError;
      } else {
        // 新增用戶
        console.log('Inserting new user:', data.email);
        const { error: insertError } = await supabase
          .from('gmail_users')
          .insert(userInfo);
        
        console.log('Insert result:', { insertError });
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

      const oauth2Client = this.createOAuth2Client(email);
      oauth2Client.setCredentials({
        refresh_token: userData.refresh_token
      });

      const { credentials } = await oauth2Client.refreshAccessToken();
      
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

      const oauth2Client = this.createOAuth2Client(email);
      oauth2Client.setCredentials({
        access_token: userData.access_token,
        refresh_token: userData.refresh_token
      });

      return oauth2Client;
    } catch (error) {
      console.error('Get valid OAuth client error:', error);
      throw error;
    }
  }
}

module.exports = AuthService;
