# 🌳 小树 (Tree Hole) - 你的专属 AI 情绪伴侣

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-1.0.0-green.svg)
![Architecture](https://img.shields.io/badge/architecture-Local_First_PWA-orange.svg)

“小树”是一个本地优先（Local-First）、端侧加密存储记忆的多模态 AI 陪伴应用。它不仅仅是一个聊天机器人，更是一个结合了前沿密码学原理与物理级感官交互的“数字情绪容器”。

## ✨ 核心硬核特性 (Core Features)

### 🛡️ 零信任端到端加密 (Zero-Trust Cryptography)
所有保存在本地的聊天记录和情绪总结，在写入 `localStorage` 前都会在前端通过 Web Crypto API 用 **AES-GCM 256 位**加密（每条密文使用随机 12 字节 IV）。密钥由用户口令经 **PBKDF2-SHA256（10 万次迭代）**派生，盐为每台设备随机生成的 16 字节；密钥只保存在内存中。旧版本用固定盐加密的数据，会在输入正确口令后自动迁移到随机盐。
- **说明：** 本地记录只有输入口令才能解密；但对话内容仍需发送到后端的 LLM 才能生成回复。
- **一键物理擦除 (Crypto-shredding)：** 支持不可逆的本地密文销毁，确保数据生命周期的绝对安全。

### 🧠 端侧长期记忆 (Local-First Memory)
不依赖云端向量数据库：用户点击总结按钮时，后端让 LLM 为当前对话生成 2–3 个情绪标签和一条情绪主题，前端按日期加密保存为“情绪卡”（同一天的会覆盖更新）。新对话的前几轮，会把这些带日期的摘要作为隐藏的上下文注入给 LLM，让 AI 记得你最近的状态。

### 🌌 沉浸式物理渲染 (Immersive Ambient UX)
结合计算机视觉与前端图形学，打破传统的 2D 聊天界面：
- **裸眼 3D 视差照片：** 上传 2D 照片后，后端用 **Intel DPT-Hybrid（MiDaS）**单目深度估计模型生成 Depth Map（模型不可用时退化为灰度 + 边缘的伪深度图），前端依靠 **Pixi.js (WebGL)** 和手机 **陀螺仪 (Gyroscope)** 实时渲染随重力偏移的 3D 景深效果。
- **流体环境与粒子天气系统：** 实时嗅探 LLM 输出文本的情感倾向，动态改变 CSS 背景流体，并在 3D 照片层叠加受重力影响的天气粒子（如悲伤时的斜雨、开心时的光斑）。

### 📱 可安装与弱网处理 (Installable & Graceful Degradation)
- 提供 Web App Manifest 和安装提示，可添加到桌面/手机主屏（目前不支持离线使用）。
- 发送前检测网络状态；请求使用 `AbortController` 超时控制（流式回复在空闲时重置计时），超时或断网时给出提示。

---

## 🛠️ 技术栈 (Tech Stack)

### 前端 (Frontend / Vercel 部署)
- **核心：** Vanilla HTML5, CSS3, JavaScript (ES6+)
- **图形与渲染：** Pixi.js v7 (WebGL 粒子与深度渲染)
- **工具库：** marked.js (Markdown 实时解析)
- **原生 API：** Web Crypto API (AES 加密), Web Speech API (STT/TTS), DeviceOrientation API (陀螺仪)

### 后端 (Backend / Hugging Face Spaces 部署)
- **核心框架：** Python, FastAPI
- **AI 引擎：** 通过 SiliconFlow 的 OpenAI 兼容接口调用 DeepSeek-V3，SSE 流式输出对话与情绪摘要。
- **视觉处理：** Intel DPT-Hybrid（MiDaS）单目深度估计，生成 Depth Map。

---

## 🚀 快速部署入口

你可以按这条链路完成完整上线：

1. **GitHub**：先把本地更新推到仓库。
2. **Hugging Face Spaces (Backend)**：使用 `backend/` 目录中的 Docker 部署后端。
3. **Vercel (Frontend)**：使用 `frontend/` 目录部署静态前端并指向你的 HF 后端地址。

详细的逐步教程（含命令、环境变量、常见报错排查）在：

- [`DEPLOYMENT.md`](./DEPLOYMENT.md)

---

## 📝 声明
本项目为个人全栈开发实践，探索了机器学习在物理视听层面的应用以及端侧信息安全的落地。愿这个赛博树洞，能给你带来一丝温暖与宁静。