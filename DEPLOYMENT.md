# Treehouse 部署手册（GitHub + Hugging Face + Vercel）

这份文档按「先推代码 -> 部署后端 -> 部署前端 -> 联调验证」编排，直接照做即可。

---

## 0. 部署前检查

- 本地项目根目录：`Tree_house`
- 后端目录：`backend`
- 前端目录：`frontend`
- 必备账号：
  - GitHub
  - Hugging Face（用于 Spaces）
  - Vercel
- 必备密钥：
  - `SILICONFLOW_API_KEY`

---

## 1. 推送更新到 GitHub

在项目根目录执行（PowerShell）：

```powershell
git status
git add .
git commit -m "docs: add full deployment guide for GitHub HF and Vercel"
git push origin <你的分支名>
```

如果你在主分支直接发版，分支名通常是 `main`：

```powershell
git push origin main
```

如果你要走 PR 流程：

1. 先 `git push origin <feature-branch>`
2. 在 GitHub 发起 PR
3. 合并到 `main`
4. 再让 Vercel / HF 跟随 `main` 自动部署

---

## 2. 部署后端到 Hugging Face Spaces（Docker）

> 推荐新建一个 Space 专门放后端 API，比如：`<username>/treehouse-backend`

### 2.1 创建 Space

1. 进入 Hugging Face -> `New Space`
2. `SDK` 选择 `Docker`
3. Space 名称建议：`treehouse-backend`
4. 可见性按需选择（Public/Private）

### 2.2 上传后端文件

将 `backend` 目录内容上传到 Space 根目录，至少包含：

- `main.py`
- `requirements.txt`
- `Dockerfile`

当前 `Dockerfile` 已使用：

- `uvicorn main:app --host 0.0.0.0 --port 7860`
- `EXPOSE 7860`

与 Hugging Face Spaces 兼容。

你可以用两种方式上传：

- 网页直接上传文件（简单）
- Git 推送到 Space（推荐，可追踪版本）

Git 推送示例：

```powershell
# 先安装并登录 huggingface-cli（仅首次）
pip install -U huggingface_hub
huggingface-cli login

# 单独克隆 Space 仓库
git clone https://huggingface.co/spaces/<你的用户名>/<你的-space> hf-backend
cd hf-backend

# 将 backend 目录文件复制到当前目录后提交
git add .
git commit -m "deploy: update treehouse backend"
git push
```

### 2.3 配置环境变量（非常关键）

在 Space 的 `Settings -> Variables and secrets` 中添加：

- `SILICONFLOW_API_KEY` = 你的真实密钥

若不配置，后端会在启动时抛出：

- `Missing required environment variable: SILICONFLOW_API_KEY`

### 2.4 验证后端

部署完成后访问：

- `https://<你的-space>.hf.space/health`

期望返回 JSON，且：

- `"status": "ok"`
- `"has_siliconflow_api_key": true`

---

## 3. 部署前端到 Vercel

> 前端是纯静态站点，Root Directory 用 `frontend`

### 3.1 导入项目

1. Vercel -> `Add New Project`
2. 选择你的 GitHub 仓库
3. `Root Directory` 设为 `frontend`
4. Framework Preset 可选 `Other`

### 3.2 修改前端后端地址

前端当前在 `frontend/app.js` 中通过 `API_BASE_URL` 指向后端：

- 本地开发：`http://127.0.0.1:8000`
- 线上：HF Space 地址

发布前请确认线上地址是你的 Space 地址，例如：

```js
const API_BASE_URL = IS_LOCAL_DEV
  ? 'http://127.0.0.1:8000'
  : 'https://<你的-space>.hf.space';
```

改完后重新推送 GitHub，Vercel 会自动重建。

### 3.3 验证前端

访问 Vercel 域名，发送一条消息，打开浏览器 Network：

- `/chat` 请求状态为 `200`
- `Response Headers` 含 `text/event-stream`
- 页面可收到流式回复，不再无限转圈

---

## 4. 三端联调与验收清单

### 4.1 基础功能

- [ ] 文本消息可正常流式返回
- [ ] 带图消息可返回
- [ ] `/summary` 可用
- [ ] `/health` 返回 `ok`

### 4.2 新增记忆与情绪能力

- [ ] 同一会话下，多轮后 AI 能引用之前故事细节
- [ ] 负面情绪输入（如“我今天好累”）语气更柔和
- [ ] 正向输入（如“今天好开心”）有共鸣式回应

### 4.3 刷新与会话连续性

- [ ] 前端刷新后（同标签页）仍能延续会话（`sessionStorage`）
- [ ] 开启“新局”后记忆被清空，进入新会话

---

## 5. 常见问题排查

### 5.1 前端一直转圈

优先检查：

1. 浏览器 Console 是否有 JS 报错
2. `/chat` 是否真正发出（Network 面板）
3. 后端日志是否有异常

### 5.2 后端启动失败

重点看 Space Logs，常见原因：

- 未配置 `SILICONFLOW_API_KEY`
- `requirements.txt` 依赖安装超时/失败
- 代码语法错误导致容器启动失败

### 5.3 Vercel 能打开但请求失败

通常是 `API_BASE_URL` 仍指向旧地址或错误域名。

---

## 6. 推荐发布流程（稳定版）

1. 在本地完成开发并自测
2. 提交到 GitHub 分支并创建 PR
3. PR 合并到 `main`
4. Hugging Face Space 同步后端发布
5. 更新前端 `API_BASE_URL` 指向新后端
6. Vercel 自动发布
7. 做一次完整回归测试

---

## 7. 一套可直接复制的发布命令

在项目根目录执行：

```powershell
git status
git add .
git commit -m "chore: prepare deployment docs and release notes"
git push origin main
```

如果你使用分支：

```powershell
git checkout -b release/deploy-2026-04-29
git add .
git commit -m "chore: deployment readiness for vercel and hf"
git push -u origin release/deploy-2026-04-29
```

然后在 GitHub 发 PR 并合并到 `main`。

