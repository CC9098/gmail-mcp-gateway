const { google } = require('googleapis');
const AuthService = require('./auth');

class GmailService {
  constructor() {
    this.authService = new AuthService();
  }

  // 獲取 Gmail API 客戶端
  async getGmailClient(email) {
    try {
      const auth = await this.authService.getValidOAuthClient(email);
      return google.gmail({ version: 'v1', auth });
    } catch (error) {
      console.error('Get Gmail client error:', error);
      throw error;
    }
  }

  // 列出郵件
  async listEmails(email, options = {}) {
    try {
      const gmail = await this.getGmailClient(email);
      const {
        query = '',
        maxResults = 10,
        pageToken = null,
        includeSpamTrash = false
      } = options;

      const response = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults,
        pageToken,
        includeSpamTrash
      });

      const messages = response.data.messages || [];
      
      // 獲取詳細郵件資訊
      const detailedMessages = await Promise.all(
        messages.map(async (message) => {
          try {
            const detail = await gmail.users.messages.get({
              userId: 'me',
              id: message.id,
              format: 'metadata',
              metadataHeaders: ['From', 'To', 'Subject', 'Date']
            });
            return detail.data;
          } catch (error) {
            console.error(`Error fetching message ${message.id}:`, error);
            return { id: message.id, error: 'Failed to fetch details' };
          }
        })
      );

      return {
        messages: detailedMessages,
        nextPageToken: response.data.nextPageToken,
        resultSizeEstimate: response.data.resultSizeEstimate
      };
    } catch (error) {
      console.error('List emails error:', error);
      throw error;
    }
  }

  // 讀取郵件內容
  async readEmail(email, messageId) {
    try {
      const gmail = await this.getGmailClient(email);
      
      const response = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full'
      });

      const message = response.data;
      
      // 解析郵件內容
      const parsedMessage = this.parseMessage(message);
      
      return parsedMessage;
    } catch (error) {
      console.error('Read email error:', error);
      throw error;
    }
  }

  // 解析郵件內容
  parseMessage(message) {
    const headers = message.payload.headers;
    const getHeader = (name) => {
      const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
      return header ? header.value : '';
    };

    const parsed = {
      id: message.id,
      threadId: message.threadId,
      labelIds: message.labelIds,
      snippet: message.snippet,
      sizeEstimate: message.sizeEstimate,
      from: getHeader('From'),
      to: getHeader('To'),
      subject: getHeader('Subject'),
      date: getHeader('Date'),
      body: this.extractBody(message.payload)
    };

    return parsed;
  }

  // 提取郵件正文
  extractBody(payload) {
    let body = '';
    
    if (payload.body && payload.body.data) {
      body = Buffer.from(payload.body.data, 'base64').toString();
    } else if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body && part.body.data) {
          body = Buffer.from(part.body.data, 'base64').toString();
          break;
        } else if (part.mimeType === 'text/html' && part.body && part.body.data) {
          body = Buffer.from(part.body.data, 'base64').toString();
        }
      }
    }

    return body;
  }

  // 發送郵件
  async sendEmail(email, emailData) {
    try {
      const gmail = await this.getGmailClient(email);
      
      const { to, subject, body, cc = '', bcc = '' } = emailData;
      
      // 構建郵件內容
      const message = this.buildEmailMessage({
        to,
        cc,
        bcc,
        subject,
        body
      });

      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: message
        }
      });

      return response.data;
    } catch (error) {
      console.error('Send email error:', error);
      throw error;
    }
  }

  // 構建郵件訊息
  buildEmailMessage({ to, cc, bcc, subject, body }) {
    const lines = [
      `To: ${to}`,
      cc ? `Cc: ${cc}` : '',
      bcc ? `Bcc: ${bcc}` : '',
      `Subject: ${subject}`,
      'Content-Type: text/html; charset=utf-8',
      '',
      body
    ].filter(line => line !== '');

    const message = lines.join('\r\n');
    return Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  // 回覆郵件
  async replyToEmail(email, threadId, replyData) {
    try {
      const gmail = await this.getGmailClient(email);
      
      // 獲取原始郵件
      const originalMessage = await gmail.users.messages.get({
        userId: 'me',
        id: threadId,
        format: 'full'
      });

      const originalHeaders = originalMessage.data.payload.headers;
      const getHeader = (name) => {
        const header = originalHeaders.find(h => h.name.toLowerCase() === name.toLowerCase());
        return header ? header.value : '';
      };

      const originalFrom = getHeader('From');
      const originalTo = getHeader('To');
      
      // 構建回覆郵件
      const replyMessage = this.buildEmailMessage({
        to: originalFrom,
        cc: originalTo,
        subject: replyData.subject.startsWith('Re:') ? replyData.subject : `Re: ${replyData.subject}`,
        body: replyData.body
      });

      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: replyMessage,
          threadId: threadId
        }
      });

      return response.data;
    } catch (error) {
      console.error('Reply to email error:', error);
      throw error;
    }
  }

  // 標記郵件為已讀/未讀
  async markAsRead(email, messageIds, read = true) {
    try {
      const gmail = await this.getGmailClient(email);
      
      const labelIds = read ? ['INBOX'] : ['UNREAD'];
      const removeLabelIds = read ? ['UNREAD'] : [];

      const response = await gmail.users.messages.batchModify({
        userId: 'me',
        requestBody: {
          ids: messageIds,
          addLabelIds: labelIds,
          removeLabelIds: removeLabelIds
        }
      });

      return response.data;
    } catch (error) {
      console.error('Mark as read error:', error);
      throw error;
    }
  }

  // 刪除郵件
  async deleteEmails(email, messageIds) {
    try {
      const gmail = await this.getGmailClient(email);
      
      const response = await gmail.users.messages.batchDelete({
        userId: 'me',
        requestBody: {
          ids: messageIds
        }
      });

      return response.data;
    } catch (error) {
      console.error('Delete emails error:', error);
      throw error;
    }
  }

  // 搜尋郵件（自然語言查詢）
  async searchEmails(email, query, options = {}) {
    try {
      // 將自然語言查詢轉換為 Gmail 搜尋語法
      const gmailQuery = this.parseNaturalLanguageQuery(query);
      
      return await this.listEmails(email, gmailQuery, options.maxResults || 10);
    } catch (error) {
      console.error('Search emails error:', error);
      throw error;
    }
  }

  // 解析自然語言查詢
  parseNaturalLanguageQuery(query) {
    const lowerQuery = query.toLowerCase();
    
    // 常見的自然語言模式
    if (lowerQuery.includes('unread') || lowerQuery.includes('未讀')) {
      return 'is:unread';
    }
    if (lowerQuery.includes('important') || lowerQuery.includes('重要')) {
      return 'is:important';
    }
    if (lowerQuery.includes('starred') || lowerQuery.includes('星標')) {
      return 'is:starred';
    }
    if (lowerQuery.includes('from:')) {
      const match = query.match(/from:(\S+)/i);
      if (match) return `from:${match[1]}`;
    }
    if (lowerQuery.includes('to:')) {
      const match = query.match(/to:(\S+)/i);
      if (match) return `to:${match[1]}`;
    }
    if (lowerQuery.includes('subject:')) {
      const match = query.match(/subject:(\S+)/i);
      if (match) return `subject:${match[1]}`;
    }
    if (lowerQuery.includes('revolut') || lowerQuery.includes('receipt')) {
      return 'from:revolut OR subject:receipt';
    }
    if (lowerQuery.includes('today')) {
      return 'newer_than:1d';
    }
    if (lowerQuery.includes('yesterday')) {
      return 'newer_than:2d older_than:1d';
    }
    
    // 預設返回原始查詢
    return query;
  }
}

module.exports = GmailService;
