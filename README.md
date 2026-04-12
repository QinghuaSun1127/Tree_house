# 🌳 小树 (Tree Hole) - 你的专属 AI 情绪伴侣

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-1.0.0-green.svg)
![Architecture](https://img.shields.io/badge/architecture-Local_First_PWA-orange.svg)

“小树”是一个基于零信任安全架构（Zero-Trust）与端侧 RAG 记忆引擎开发的多模态 AI 陪伴应用。它不仅仅是一个聊天机器人，更是一个结合了前沿密码学原理与物理级感官交互的“数字情绪容器”。

## ✨ 核心硬核特性 (Core Features)

### 🛡️ 零信任端到端加密 (Zero-Trust Cryptography)
用户的隐私高于一切。所有聊天记录和情绪总结，在存入本地磁盘前，均在前端通过 Web Crypto API 使用 **AES-GCM 256位** 算法进行高强度加密。密钥由用户 PBKDF2 动态加盐派生，且生命周期仅存在于内存中。**除了你，即使是系统本身也无法窥探你的过去。**
- **一键物理擦除 (Crypto-shredding)：** 支持不可逆的本地密文销毁，确保数据生命周期的绝对安全。

### 🧠 端侧 RAG 时序记忆引擎 (Local-First Memory)
摒弃了沉重的云端向量数据库，采用本地存储的轻量级时序图谱。每次对话开启时，引擎会自动提取过去几天的情绪特征（Summary），通过**隐式 Prompt 注入 (Prompt Injection)** 的方式传递给 LLM。让 AI 拥有连贯的长期记忆，像老朋友一样懂你。

### 🌌 沉浸式物理渲染 (Immersive Ambient UX)
结合计算机视觉与前端图形学，打破传统的 2D 聊天界面：
- **裸眼 3D 视差照片：** 上传 2D 照片后，后端通过深度估计模型生成 Depth Map，前端依靠 **Pixi.js (WebGL)** 和手机 **陀螺仪 (Gyroscope)** 实时渲染随重力偏移的 3D 景深效果。
- **流体环境与粒子天气系统：** 实时嗅探 LLM 输出文本的情感倾向，动态改变 CSS 背景流体，并在 3D 照片层叠加受重力影响的天气粒子（如悲伤时的斜雨、开心时的光斑）。

### 📱 渐进式应用与离线容错 (PWA & Graceful Degradation)
- 支持作为独立 App 安装到桌面/手机主屏，享受无浏览器的沉浸式全屏体验。
- 内置 **网络雷达与 Timeout 熔断器**，在弱网环境下提供优雅的断网提示与状态恢复，保证交互的鲁棒性。

---

## 🛠️ 技术栈 (Tech Stack)

### 前端 (Frontend / Vercel 部署)
- **核心：** Vanilla HTML5, CSS3, JavaScript (ES6+)
- **图形与渲染：** Pixi.js v7 (WebGL 粒子与深度渲染)
- **工具库：** marked.js (Markdown 实时解析)
- **原生 API：** Web Crypto API (AES 加密), Web Speech API (STT/TTS), DeviceOrientation API (陀螺仪)

### 后端 (Backend / Hugging Face Spaces 部署)
- **核心框架：** Python, FastAPI
- **AI 引擎：** 集成前沿的大语言模型 (LLM) 进行多模态对话与文本情感摘要。
- **视觉处理：** 基于深度学习的单目深度估计模型 (Monocular Depth Estimation)，生成物理级 Depth Map。

---

## 🚀 本地运行与部署 (Getting Started)

### 前端部署
本项目前端已完全实现静态化与 PWA 支持，推荐使用 **Vercel** 一键部署：
1. Fork 本仓库。
2. 在 Vercel 中导入项目。
3. 将 **Root Directory** 设置为 `frontend`。
4. 部署即可获得极致的边缘节点加速体验。

### 后端部署
后端逻辑位于 `backend` 目录，推荐部署至 **Hugging Face Spaces** (Docker 模式)：
1. 将 `backend/main.py` 及 `requirements.txt` 上传至 HF Space。
2. 配置好对应的环境变量与 API Keys。

---

## 📝 声明
本项目为个人全栈开发实践，探索了机器学习在物理视听层面的应用以及端侧信息安全的落地。愿这个赛博树洞，能给你带来一丝温暖与宁静。