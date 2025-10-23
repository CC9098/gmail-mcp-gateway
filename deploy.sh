#!/bin/bash

# Gmail MCP Gateway 部署腳本
echo "🚀 開始部署 Gmail MCP Gateway..."

# 檢查是否有未提交的變更
if [ -n "$(git status --porcelain)" ]; then
    echo "📝 發現未提交的變更，正在提交..."
    git add .
    git commit -m "${1:-Deploy Gmail MCP Gateway}"
fi

# 推送到 Git
echo "📤 推送到 Git..."
git push origin main

# 部署到 Railway
echo "🚀 部署到 Railway..."
railway up

echo "✅ 部署完成！"
echo "🌐 你的 Gmail MCP Gateway 已上線"
