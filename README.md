# ChatBuddy

ChatBuddy 是一个本地运行的多模式 AI 对话 Web 工具，支持专家模式、模型抗辩、直答模式、联网搜索和多用户隔离。

## 功能

- 专家模式：自动生成多个专家角色，并汇总为结构化 Markdown 回复。
- 直答模式：可关闭多专家或模型抗辩，让模型直接回答。
- 模型抗辩：默认 3 个模型，支持 2-5 个模型参与结构化抗辩。
- 联网搜索：可选开启 Web Search，整合最新互联网搜索结果和来源摘要。
- 多轮对话：同一对话内可继续追问，并保留上下文。
- 用户隔离：支持注册、登录、退出，不同用户只能看到自己的历史对话。
- Markdown 阅读优化：支持标题、列表、代码块、链接、表格和表格内换行。
- 本地部署：使用 Node.js 标准库实现，无需安装第三方 npm 依赖。

## 安装

要求：

- Node.js 18 或更高版本
- 可用的阿里云百炼 API Key

克隆项目后进入目录：

```bash
cd chatbuddy
```

复制环境变量模板：

```bash
cp .env.example .env.local
```

编辑 `.env.local`：

```bash
ALIYUN_API_KEY=your-bailian-api-key
ALIYUN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
ALIYUN_MODEL_PRIMARY=qwen-plus
ALIYUN_MODEL_FAST=qwen-flash
DEBATE_MODEL_IDS=qwen-flash,Moonshot-Kimi-K2-Instruct,deepseek-v3
PORT=4173
HOST=127.0.0.1
```

## 使用

启动服务：

```bash
npm start
```

打开浏览器访问：

```text
http://127.0.0.1:4173
```

首次使用时先注册账号。登录后可以：

- 在“专家模式”中开启或关闭多专家回答。
- 在“模型抗辩”中选择模型数量和具体模型。
- 勾选“联网搜索”以整合互联网搜索结果。
- 使用 `Enter` 发送消息，`Shift+Enter` 换行。
- 点击每条消息旁的“复制”按钮复制内容。

## 验证

运行构建检查：

```bash
npm run build
```

运行测试：

```bash
npm test
```

## 数据与安全

- API key 不写在源码中，运行时通过 `.env.local` 或环境变量读取。
- `.env.local` 已加入 `.gitignore`，不要提交到仓库。
- 本地用户、会话和历史对话保存在 `data/store.json`。
- `data/store.json` 已加入 `.gitignore`，不会随代码提交。

## 说明

联网搜索目前使用公开搜索页面抓取标题、链接和摘要。若本机网络不可用或搜索服务不可达，ChatBuddy 会继续生成回答，并在结果中提示联网搜索失败或无可用结果。
