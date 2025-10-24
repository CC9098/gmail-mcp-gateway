const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const AuthService = require('./auth');
const GmailService = require('./gmailService');

const app = express();
const PORT = process.env.PORT || 3000;

// 中介軟體設定
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 速率限制
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分鐘
  max: 100, // 限制每個 IP 100 次請求
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// 初始化服務
const authService = new AuthService();
const gmailService = new GmailService();

// 健康檢查
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'Gmail MCP Gateway'
  });
});

// Supabase 連接測試
app.get('/test-supabase', async (req, res) => {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );
    
    // 測試連接
    const { data, error } = await supabase
      .from('gmail_users')
      .select('count')
      .limit(1);
    
    res.json({
      success: true,
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseKey: process.env.SUPABASE_ANON_KEY ? 'Set' : 'Not Set',
      connectionTest: error ? { error: error.message } : { success: true },
      data: data
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message,
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseKey: process.env.SUPABASE_ANON_KEY ? 'Set' : 'Not Set'
    });
  }
});

// MCP 端點
app.get('/mcp/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  
  res.json({
    success: true,
    message: 'Gmail MCP Gateway is ready',
    sessionId: sessionId,
    endpoints: {
      'list_emails': {
        method: 'POST',
        url: `/mcp/${sessionId}/list_emails`,
        description: '列出 Gmail 郵件'
      },
      'natural_query': {
        method: 'POST',
        url: `/mcp/${sessionId}/natural_query`,
        description: '使用自然語言查詢 Gmail'
      },
      'read_email': {
        method: 'POST',
        url: `/mcp/${sessionId}/read_email`,
        description: '讀取特定郵件內容'
      },
      'send_email': {
        method: 'POST',
        url: `/mcp/${sessionId}/send_email`,
        description: '發送郵件'
      }
    },
    usage: {
      example: `POST /mcp/${sessionId}/list_emails`,
      body: {
        email: 'user@gmail.com',
        maxResults: 10,
        query: ''
      }
    }
  });
});

// MCP 工具端點
app.post('/mcp/:sessionId/list_emails', async (req, res) => {
  try {
    const { email, maxResults = 10, query = '' } = req.body;
    const result = await gmailService.listEmails(email, query, maxResults);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/mcp/:sessionId/natural_query', async (req, res) => {
  try {
    const { email, query, maxResults = 10 } = req.body;
    const result = await gmailService.processNaturalQuery(email, query, maxResults);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/mcp/:sessionId/read_email', async (req, res) => {
  try {
    const { email, messageId } = req.body;
    const result = await gmailService.readEmail(email, messageId);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/mcp/:sessionId/send_email', async (req, res) => {
  try {
    const { email, to, subject, body } = req.body;
    const result = await gmailService.sendEmail(email, to, subject, body);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// OAuth 認證路由
app.get('/auth/google', (req, res) => {
  try {
    const authUrl = authService.getAuthUrl();
    res.json({ 
      success: true, 
      authUrl,
      message: '請訪問此 URL 進行 OAuth 認證'
    });
  } catch (error) {
    console.error('Auth URL generation error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to generate auth URL' 
    });
  }
});

app.get('/auth/google/callback', async (req, res) => {
  try {
    const { code, error: authError } = req.query;
    
    console.log('OAuth callback received:', { code, authError, query: req.query });
    
    if (authError) {
      return res.status(400).json({ 
        success: false, 
        error: `OAuth error: ${authError}` 
      });
    }
    
    if (!code) {
      return res.status(400).json({ 
        success: false, 
        error: 'Authorization code not provided' 
      });
    }

    console.log('Processing OAuth code:', code);
    const result = await authService.handleCallback(code);
    console.log('OAuth success:', result);
    
    res.json({ 
      success: true, 
      message: 'OAuth 認證成功',
      user: result.user
    });
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'OAuth callback failed',
      details: error.message 
    });
  }
});

// Gmail API 路由
app.get('/api/listEmails', async (req, res) => {
  try {
    const { email, query = '', maxResults = 10, pageToken } = req.query;
    
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email parameter is required' 
      });
    }

    const options = {
      query,
      maxResults: parseInt(maxResults),
      pageToken
    };

    const result = await gmailService.listEmails(email, options);
    res.json({ 
      success: true, 
      data: result 
    });
  } catch (error) {
    console.error('List emails error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to list emails' 
    });
  }
});

app.get('/api/readEmail/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email parameter is required' 
      });
    }

    const result = await gmailService.readEmail(email, messageId);
    res.json({ 
      success: true, 
      data: result 
    });
  } catch (error) {
    console.error('Read email error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to read email' 
    });
  }
});

app.post('/api/sendEmail', async (req, res) => {
  try {
    const { email, to, subject, body, cc, bcc } = req.body;
    
    if (!email || !to || !subject || !body) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: email, to, subject, body' 
      });
    }

    const emailData = { to, subject, body, cc, bcc };
    const result = await gmailService.sendEmail(email, emailData);
    
    res.json({ 
      success: true, 
      data: result,
      message: 'Email sent successfully'
    });
  } catch (error) {
    console.error('Send email error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to send email' 
    });
  }
});

app.post('/api/replyEmail', async (req, res) => {
  try {
    const { email, threadId, subject, body } = req.body;
    
    if (!email || !threadId || !subject || !body) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: email, threadId, subject, body' 
      });
    }

    const replyData = { subject, body };
    const result = await gmailService.replyToEmail(email, threadId, replyData);
    
    res.json({ 
      success: true, 
      data: result,
      message: 'Reply sent successfully'
    });
  } catch (error) {
    console.error('Reply email error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to reply to email' 
    });
  }
});

app.post('/api/markAsRead', async (req, res) => {
  try {
    const { email, messageIds, read = true } = req.body;
    
    if (!email || !messageIds || !Array.isArray(messageIds)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: email, messageIds (array)' 
      });
    }

    const result = await gmailService.markAsRead(email, messageIds, read);
    
    res.json({ 
      success: true, 
      data: result,
      message: `Emails marked as ${read ? 'read' : 'unread'}`
    });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to mark emails' 
    });
  }
});

app.post('/api/deleteEmails', async (req, res) => {
  try {
    const { email, messageIds } = req.body;
    
    if (!email || !messageIds || !Array.isArray(messageIds)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: email, messageIds (array)' 
      });
    }

    const result = await gmailService.deleteEmails(email, messageIds);
    
    res.json({ 
      success: true, 
      data: result,
      message: 'Emails deleted successfully'
    });
  } catch (error) {
    console.error('Delete emails error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete emails' 
    });
  }
});

app.post('/api/searchEmails', async (req, res) => {
  try {
    const { email, query, maxResults = 10, pageToken } = req.body;
    
    if (!email || !query) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: email, query' 
      });
    }

    const options = {
      maxResults: parseInt(maxResults),
      pageToken
    };

    const result = await gmailService.searchEmails(email, query, options);
    
    res.json({ 
      success: true, 
      data: result 
    });
  } catch (error) {
    console.error('Search emails error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to search emails' 
    });
  }
});

// 自然語言查詢路由
app.post('/api/naturalQuery', async (req, res) => {
  try {
    const { email, query, maxResults = 10 } = req.body;
    
    if (!email || !query) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: email, query' 
      });
    }

    const options = {
      maxResults: parseInt(maxResults)
    };

    const result = await gmailService.searchEmails(email, query, options);
    
    res.json({ 
      success: true, 
      data: result,
      query: query,
      parsedQuery: gmailService.parseNaturalLanguageQuery(query)
    });
  } catch (error) {
    console.error('Natural query error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to process natural language query' 
    });
  }
});

// 錯誤處理中介軟體
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error' 
  });
});

// 404 處理
app.use('*', (req, res) => {
  res.status(404).json({ 
    success: false, 
    error: 'Endpoint not found' 
  });
});

// 啟動伺服器
app.listen(PORT, () => {
  console.log(`🚀 Gmail MCP Gateway 已啟動在端口 ${PORT}`);
  console.log(`📧 健康檢查: http://localhost:${PORT}/health`);
  console.log(`🔐 OAuth 認證: http://localhost:${PORT}/auth/google`);
  console.log(`📚 API 文檔: http://localhost:${PORT}/api/`);
});

module.exports = app;
