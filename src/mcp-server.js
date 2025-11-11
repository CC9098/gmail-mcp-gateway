#!/usr/bin/env node

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

// 導入現有的服務
const AuthService = require('./auth.js');
const GmailService = require('./gmailService.js');

class GmailMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'gmail-mcp-gateway',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.authService = new AuthService();
    this.gmailService = new GmailService();

    this.setupToolHandlers();
  }

  setupToolHandlers() {
    // 列出可用工具
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'list_emails',
            description: '列出 Gmail 郵件',
            inputSchema: {
              type: 'object',
              properties: {
                email: {
                  type: 'string',
                  description: '用戶郵箱地址'
                },
                maxResults: {
                  type: 'number',
                  description: '最大結果數量',
                  default: 10
                },
                query: {
                  type: 'string',
                  description: '搜索查詢',
                  default: ''
                }
              },
              required: ['email']
            }
          },
          {
            name: 'natural_query',
            description: '使用自然語言查詢 Gmail',
            inputSchema: {
              type: 'object',
              properties: {
                email: {
                  type: 'string',
                  description: '用戶郵箱地址'
                },
                query: {
                  type: 'string',
                  description: '自然語言查詢'
                },
                maxResults: {
                  type: 'number',
                  description: '最大結果數量',
                  default: 10
                }
              },
              required: ['email', 'query']
            }
          },
          {
            name: 'read_email',
            description: '讀取特定郵件內容',
            inputSchema: {
              type: 'object',
              properties: {
                email: {
                  type: 'string',
                  description: '用戶郵箱地址'
                },
                messageId: {
                  type: 'string',
                  description: '郵件 ID'
                }
              },
              required: ['email', 'messageId']
            }
          },
          {
            name: 'send_email',
            description: '發送郵件',
            inputSchema: {
              type: 'object',
              properties: {
                email: {
                  type: 'string',
                  description: '發件人郵箱地址'
                },
                to: {
                  type: 'string',
                  description: '收件人郵箱地址'
                },
                subject: {
                  type: 'string',
                  description: '郵件主題'
                },
                body: {
                  type: 'string',
                  description: '郵件內容'
                }
              },
              required: ['email', 'to', 'subject', 'body']
            }
          }
        ]
      };
    });

    // 處理工具調用
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'list_emails':
            return await this.handleListEmails(args);
          
          case 'natural_query':
            return await this.handleNaturalQuery(args);
          
          case 'read_email':
            return await this.handleReadEmail(args);
          
          case 'send_email':
            return await this.handleSendEmail(args);
          
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`
            }
          ]
        };
      }
    });
  }

  async handleListEmails(args) {
    const { email, maxResults = 10, query = '' } = args;
    const result = await this.gmailService.listEmails(email, {
      query,
      maxResults
    });
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  }

  async handleNaturalQuery(args) {
    const { email, query, maxResults = 10 } = args;
    const result = await this.gmailService.processNaturalQuery(email, query, maxResults);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  }

  async handleReadEmail(args) {
    const { email, messageId } = args;
    const result = await this.gmailService.readEmail(email, messageId);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  }

  async handleSendEmail(args) {
    const { email, to, subject, body } = args;
    const result = await this.gmailService.sendEmail(email, to, subject, body);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Gmail MCP Gateway server running on stdio');
  }
}

// 啟動服務器
const server = new GmailMCPServer();
server.run().catch(console.error);
