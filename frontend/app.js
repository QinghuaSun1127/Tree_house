/**
 * @file app.js
 * @description 核心交互逻辑、AES-GCM 零信任加密引擎、PixiJS 3D/粒子系统与 RAG 时序记忆引擎。
 * @author 你的名字 / 树洞开发团队
 */
console.log('[Treehouse] app.js loaded: 20260429-1447');

// ==========================================
// 📦 1. 全局状态与配置区
// ==========================================
let fullChatHistory = "";         // 记录本次会话的完整历史（用于加密与情绪报告）
/** 与后端 /chat 对齐的多轮结构：{role, content}[]，仅会话内、仅存 sessionStorage */
let structuredChatHistory = [];
const SS_KEY_TREEHOUSE_SESSION = 'treehouse_session_id';
const SS_KEY_TREEHOUSE_TURNS = 'treehouse_chat_turns';
let longTermMemory = [];          // 长期记忆库（存放过去的情绪总结）
let currentImageDataUrl = null;   // 当前待发送的 Base64 图片数据
let recognition;                  // Web Speech API 实例
let isRecording = false;          // 录音状态标记
let isVoiceOn = true;             // 语音播报开关状态
let isAudioUnlocked = false;      // 移动端音频引擎是否已解锁
let userSecretKey = null;         // 用户的专属 AES 密码（明文，仅内存中存留）
let cryptoKeyObj = null;          // Web Crypto API 派生出的底层加密对象
let ttsBuffer = '';               // 流式 TTS 文本缓冲区
let ttsQueue = [];                // 待播报句子队列
let ttsSpeaking = false;          // 当前是否在播报
let requireTTSInteraction = false; // Safari 自动播放被拦截标记
let currentTTSUtterance = null;   // 当前正在播报的 utterance
const active3DEffects = new Map();
let dynamicImageObserver = null;

const COMMA_MIN_CHARS = 5;
const HARD_MAX_SEGMENT_CHARS = 40;

const IS_LOCAL_DEV = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const API_BASE_URL = 'http://127.0.0.1:8000';
const TEXT_REQUEST_TIMEOUT_MS = 60000;
const IMAGE_REQUEST_TIMEOUT_MS = 180000;
const DEPTH_REQUEST_TIMEOUT_MS = 120000;
const IMAGE_MAX_EDGE = 768;
const IMAGE_JPEG_QUALITY = 0.72;

function buildApiUrl(endpoint) {
    if (IS_LOCAL_DEV) return `${API_BASE_URL}${endpoint}`;
    return `/api/proxy?endpoint=${encodeURIComponent(endpoint)}`;
}

/**
 * 容错 Markdown 解析
 * @param {string} text - 原始文本 
 * @returns {string} 渲染后的 HTML 或原文本（若解析器未加载）
 */
function safeParseMD(text, options = {}) {
    const source = options.streaming ? normalizeStreamingMarkdown(text) : text;
    try { return typeof marked !== 'undefined' ? marked.parse(source) : escapeHTML(source).replace(/\n/g, '<br>'); }
    catch (e) { return escapeHTML(source).replace(/\n/g, '<br>'); }
}

function normalizeStreamingMarkdown(text) {
    const fenceCount = (text.match(/```/g) || []).length;
    return fenceCount % 2 === 1 ? `${text}\n\`\`\`` : text;
}

function escapeHTML(text) {
    return text.replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function scrollChatToBottom(smooth = true) {
    const chatBox = document.getElementById('chatBox');
    if (!chatBox) return;
    requestAnimationFrame(() => {
        chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    });
}

function appendAnimatedChunk(targetBubble, chunk) {
    if (!targetBubble || !chunk) return;
    const span = document.createElement('span');
    span.className = 'chunk-animate';
    // 用 textContent 直接注入文本，保留空格/换行并避免 XSS
    span.textContent = chunk;
    targetBubble.appendChild(span);
}

function getTreehouseSessionId() {
    let id = sessionStorage.getItem(SS_KEY_TREEHOUSE_SESSION);
    if (!id) {
        id = crypto.randomUUID();
        sessionStorage.setItem(SS_KEY_TREEHOUSE_SESSION, id);
    }
    return id;
}

function hydrateStructuredChatHistory() {
    try {
        const raw = sessionStorage.getItem(SS_KEY_TREEHOUSE_TURNS);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) structuredChatHistory = parsed.slice(-30);
    } catch (_) { /* ignore */ }
}

function persistStructuredChatHistory() {
    try {
        sessionStorage.setItem(SS_KEY_TREEHOUSE_TURNS, JSON.stringify(structuredChatHistory.slice(-30)));
    } catch (_) { /* ignore */ }
}

function appendDiaryLog(text) {
    const diaryList = document.getElementById('diaryLogList');
    if (!diaryList || !text) return;
    const item = document.createElement('div');
    item.className = 'diary-item';
    item.textContent = text.length > 44 ? `${text.slice(0, 44)}...` : text;
    diaryList.prepend(item);
    while (diaryList.children.length > 12) {
        diaryList.removeChild(diaryList.lastElementChild);
    }
}

function updateDesktopSceneCard(originalBase64) {
    const card = document.getElementById('desktopSceneCard');
    if (!card || !originalBase64) return;
    card.innerHTML = `<img src="${originalBase64}" alt="最新场景图" class="desktop-scene-image"><div class="scene-caption">最新上传的情景卡</div>`;
}

function destroy3DEffect(containerId) {
    const effect = active3DEffects.get(containerId);
    if (!effect) return;
    if (effect.cleanup) effect.cleanup();
    active3DEffects.delete(containerId);
}

function ensureTTSResumeUI() {
    if (document.getElementById('ttsResumeHint')) return;
    const container = document.querySelector('.chat-container');
    if (!container) return;
    const hint = document.createElement('div');
    hint.id = 'ttsResumeHint';
    hint.className = 'tts-resume-hint';
    hint.innerHTML = '<button type="button" class="tts-resume-btn" id="ttsResumeBtn">点击继续播放</button>';
    container.appendChild(hint);
    const btn = document.getElementById('ttsResumeBtn');
    if (btn) btn.addEventListener('click', resumeTTSAfterInteraction);
}

function setTTSInteractionHint(visible) {
    ensureTTSResumeUI();
    const hint = document.getElementById('ttsResumeHint');
    if (!hint) return;
    hint.classList.toggle('visible', !!visible);
}

function setTTSSpeakingIndicator(active) {
    const speakerBtn = document.getElementById('speakerBtn');
    if (!speakerBtn) return;
    speakerBtn.classList.toggle('tts-speaking', !!active);
}

function extractTTSSegments(input) {
    const segments = [];
    let buffer = (input || '').trimStart();
    const isStrongPunc = ch => /[。！？!?\.]/.test(ch);
    const isCommaPunc = ch => /[，,；;：:]/.test(ch);

    while (buffer.length > 0) {
        let cutIndex = -1;
        for (let i = 0; i < buffer.length; i++) {
            const ch = buffer[i];
            if (isStrongPunc(ch)) {
                cutIndex = i + 1;
                break;
            }
            if (isCommaPunc(ch) && (i + 1) >= COMMA_MIN_CHARS) {
                cutIndex = i + 1;
                break;
            }
            if ((i + 1) >= HARD_MAX_SEGMENT_CHARS) {
                let fallback = -1;
                for (let j = i; j >= Math.max(0, i - 8); j--) {
                    if (isStrongPunc(buffer[j]) || isCommaPunc(buffer[j]) || /\s/.test(buffer[j])) {
                        fallback = j + 1;
                        break;
                    }
                }
                cutIndex = fallback > 0 ? fallback : HARD_MAX_SEGMENT_CHARS;
                break;
            }
        }
        if (cutIndex <= 0 || cutIndex > buffer.length) break;
        const segment = buffer.slice(0, cutIndex).trim();
        if (segment) segments.push(segment);
        buffer = buffer.slice(cutIndex).trimStart();
    }
    return { segments, rest: buffer };
}

function handleTTSError(err, sentence) {
    const errName = (err && (err.name || err.error)) || '';
    if (errName === 'NotAllowedError' || errName === 'not-allowed') {
        if (sentence) ttsQueue.unshift(sentence);
        requireTTSInteraction = true;
        setTTSInteractionHint(true);
        ttsSpeaking = false;
        setTTSSpeakingIndicator(false);
        return;
    }
    ttsSpeaking = false;
    setTTSSpeakingIndicator(false);
    playNextTTS();
}

function playNextTTS() {
    if (!isVoiceOn || ttsSpeaking || requireTTSInteraction) return;
    if (!('speechSynthesis' in window)) return;
    const sentence = ttsQueue.shift();
    if (!sentence) {
        setTTSSpeakingIndicator(false);
        return;
    }

    const utterance = new SpeechSynthesisUtterance(sentence);
    utterance.lang = 'zh-CN';
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;

    ttsSpeaking = true;
    currentTTSUtterance = utterance;
    setTTSSpeakingIndicator(true);

    utterance.onend = function () {
        ttsSpeaking = false;
        currentTTSUtterance = null;
        setTTSSpeakingIndicator(false);
        playNextTTS();
    };
    utterance.onerror = function (event) {
        currentTTSUtterance = null;
        handleTTSError(event, sentence);
    };

    try {
        window.speechSynthesis.speak(utterance);
    } catch (err) {
        currentTTSUtterance = null;
        handleTTSError(err, sentence);
    }
}

function pushChunkToTTS(chunk) {
    if (!isVoiceOn || !chunk) return;
    ttsBuffer += chunk;
    const parsed = extractTTSSegments(ttsBuffer);
    if (parsed.segments.length > 0) {
        ttsQueue.push(...parsed.segments);
        ttsBuffer = parsed.rest;
        playNextTTS();
    }
}

function flushTTSBuffer() {
    if (!isVoiceOn) return;
    const rest = ttsBuffer.trim();
    ttsBuffer = '';
    if (!rest) return;
    const parsed = extractTTSSegments(rest);
    if (parsed.segments.length > 0) ttsQueue.push(...parsed.segments);
    if (parsed.rest) ttsQueue.push(parsed.rest);
    playNextTTS();
}

function stopTTS() {
    ttsBuffer = '';
    ttsQueue = [];
    ttsSpeaking = false;
    currentTTSUtterance = null;
    requireTTSInteraction = false;
    setTTSInteractionHint(false);
    setTTSSpeakingIndicator(false);
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

function resumeTTSAfterInteraction() {
    requireTTSInteraction = false;
    setTTSInteractionHint(false);
    playNextTTS();
}

// ==========================================
// 🔐 2. 安全与零信任加密引擎 (AES-GCM)
// ==========================================

/**
 * 使用 PBKDF2 算法对用户口令进行哈希加盐迭代，派生高强度 AES 主密钥
 * @param {string} password - 用户输入的口令
 * @returns {Promise<CryptoKey>} 返回底层的 CryptoKey 对象
 */
async function deriveKey(password) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: enc.encode("TreeHole_Salt_2026"), iterations: 100000, hash: "SHA-256" },
        keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
    );
}

/**
 * 端到端加密机制：将文本转为 AES-GCM 密文并打包 IV 向量
 * @param {string} text - 需要加密的明文
 * @returns {Promise<string|null>} 返回 Base64 编码的密文包
 */
async function encryptData(text) {
    if (!cryptoKeyObj) return null;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, cryptoKeyObj, new TextEncoder().encode(text));
    const exported = new Uint8Array(iv.length + ciphertext.byteLength);
    exported.set(iv, 0); exported.set(new Uint8Array(ciphertext), iv.length);
    return btoa(String.fromCharCode(...exported));
}

/**
 * 解密机制：拆解 Base64，提取 IV 并还原明文
 * @param {string} base64String - 本地读取的密文包
 * @returns {Promise<string|null>} 还原出的明文，失败返回 null
 */
async function decryptData(base64String) {
    if (!cryptoKeyObj) return null;
    try {
        const rawData = Uint8Array.from(atob(base64String), c => c.charCodeAt(0));
        const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: rawData.slice(0, 12) }, cryptoKeyObj, rawData.slice(12));
        return new TextDecoder().decode(decrypted);
    } catch (e) { return null; }
}

/**
 * 触发用户密码输入，处理解密及 UI 状态流转
 */
async function toggleSecurity() {
    const pwd = prompt("请输入隐私密码（用于解密历史记录，或加密保护接下来的对话）：");
    if (!pwd) return;

    cryptoKeyObj = await deriveKey(pwd); userSecretKey = pwd;

    const savedHistory = localStorage.getItem('treeHole_encrypted_history');
    if (savedHistory) {
        const decrypted = await decryptData(savedHistory);
        if (decrypted !== null) {
            fullChatHistory = decrypted + "\n" + fullChatHistory;
            renderHistoryToScreen(fullChatHistory);
            alert("✅ 历史记忆解密成功！后续聊天将自动加密保存。");
        } else {
            alert("❌ 密码错误！"); cryptoKeyObj = null; userSecretKey = null; return;
        }
    } else { alert("✅ 密码设置成功！本次对话的后续内容将自动加密保存。"); }

    const savedMemory = localStorage.getItem('treeHole_long_term_memory');
    if (savedMemory) {
        const decryptedMem = await decryptData(savedMemory);
        if (decryptedMem) longTermMemory = JSON.parse(decryptedMem);
    }

    // 状态流转：隐藏解锁按钮，暴露进阶操作按钮
    document.getElementById('lockBtn').style.display = 'none';
    document.getElementById('newChatBtn').style.display = 'inline-block';
    document.getElementById('exportBtn').style.display = 'inline-block';
    document.getElementById('destroyBtn').style.display = 'inline-block';
}

/**
 * 清除内存状态，一键开启新会话（安全隔离机制）
 */
function startNewChat() {
    if (confirm("开启新对话将清空当前屏幕（历史记录依然安全保存在底层）。确定吗？")) {
        fullChatHistory = ""; structuredChatHistory = [];
        sessionStorage.removeItem(SS_KEY_TREEHOUSE_SESSION);
        sessionStorage.removeItem(SS_KEY_TREEHOUSE_TURNS);
        cryptoKeyObj = null; userSecretKey = null;
        document.getElementById('chatBox').innerHTML = `<div class="message-wrapper ai-wrapper"><div class="avatar ai-avatar">🌳</div><div class="message ai-message">你好呀！我是你的专属树洞精灵『小树』✨<br><strong>今天想聊点什么呢？随时可以告诉我哦。</strong></div></div>`;
        const diary = document.getElementById('diaryLogList');
        if (diary) diary.innerHTML = '<div class="diary-item">新对话开始，记录新的心情轨迹。</div>';
        document.getElementById('lockBtn').style.display = 'inline-block';
        document.getElementById('newChatBtn').style.display = 'none';
        document.getElementById('exportBtn').style.display = 'none';
        document.getElementById('destroyBtn').style.display = 'none';
    }
}

/**
 * 导出纯本地数据，不经过服务器
 */
function exportData() {
    if (!fullChatHistory && longTermMemory.length === 0) return alert("当前没有可导出的数据哦。");
    let exportStr = "=== 🌳 我的树洞记忆 ===\n\n【聊天记录】\n" + (fullChatHistory || "暂无记录") + "\n\n【长期记忆（情绪卡）】\n";
    if (longTermMemory.length > 0) { longTermMemory.forEach(m => { exportStr += `[${m.date}]\n${m.summary}\n\n`; }); } else { exportStr += "暂无记忆\n"; }
    const blob = new Blob([exportStr], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `树洞记忆备份_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.txt`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

/**
 * 物理级擦除 (Crypto-shredding)：彻底摧毁密钥和密文
 */
function destroyMemory() {
    if (!confirm("⚠️ 警告：此操作将彻底删除本地所有加密的聊天记录和情绪记忆！\n\n删除后连风都找不到它们，确定要继续吗？")) return;
    if (!confirm("最后一次确认：是否彻底销毁所有记忆？（此操作不可逆）")) return;

    localStorage.removeItem('treeHole_encrypted_history');
    localStorage.removeItem('treeHole_long_term_memory');
    fullChatHistory = ""; structuredChatHistory = []; longTermMemory = [];
    sessionStorage.removeItem(SS_KEY_TREEHOUSE_SESSION);
    sessionStorage.removeItem(SS_KEY_TREEHOUSE_TURNS);
    cryptoKeyObj = null; userSecretKey = null;

    document.getElementById('exportBtn').style.display = 'none';
    document.getElementById('destroyBtn').style.display = 'none';
    document.getElementById('newChatBtn').style.display = 'none';
    document.getElementById('lockBtn').style.display = 'inline-block';
    document.getElementById('chatBox').innerHTML = `<div class="message-wrapper ai-wrapper"><div class="avatar ai-avatar">🌳</div><div class="message ai-message" style="border-left: 4px solid #ef4444;">您的所有历史记忆已被彻底安全擦除。<br><strong>过去已成往事，现在，我们重新开始吧。✨</strong></div></div>`;
    const diary = document.getElementById('diaryLogList');
    if (diary) diary.innerHTML = '<div class="diary-item">记忆已清空，从这一刻重新出发。</div>';
}

/**
 * 纯文本协议渲染器：将内存中的文本序列还原为气泡 UI
 * @param {string} historyStr - 包含了 "用户说：" 和 "小树回复：" 的历史文本
 */
function renderHistoryToScreen(historyStr) {
    const chatBox = document.getElementById('chatBox'); chatBox.innerHTML = '';
    const lines = historyStr.split('\n');
    for (let line of lines) {
        if (!line.trim()) continue;
        if (line.startsWith('用户说：')) {
            chatBox.insertAdjacentHTML('beforeend', `<div class="message-wrapper user-wrapper"><div class="avatar user-avatar">👤</div><div class="message user-message">${line.substring(4)}</div></div>`);
        } else if (line.startsWith('小树回复：')) {
            chatBox.insertAdjacentHTML('beforeend', `<div class="message-wrapper ai-wrapper"><div class="avatar ai-avatar">🌳</div><div class="message ai-message">${safeParseMD(line.substring(5))}</div></div>`);
        }
    }
    chatBox.scrollTop = chatBox.scrollHeight;
}

// ==========================================
// 📱 3. 跨端媒体交互与传感器引擎
// ==========================================

/** 破解苹果传感器权限，拉起相册 */
async function handleCameraClick() {
    unlockAudio();
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try { await DeviceOrientationEvent.requestPermission(); } catch (e) { }
    }
    document.getElementById('imageInput').click();
}

/** 破解苹果移动端静音策略 */
function unlockAudio() {
    if (!isAudioUnlocked && 'speechSynthesis' in window) {
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
        isAudioUnlocked = true;
    }
}

/** 切换播报开关 */
function toggleVoiceOutput() {
    isVoiceOn = !isVoiceOn; document.getElementById('speakerBtn').innerText = isVoiceOn ? '🔊' : '🔇';
    if (!isVoiceOn) {
        stopTTS();
    } else {
        resumeTTSAfterInteraction();
    }
}

/** Web Speech API TTS (文字转语音) 包装 */
function speakText(text) {
    if (!isVoiceOn || !('speechSynthesis' in window)) return;
    stopTTS();
    const utterance = new SpeechSynthesisUtterance(text.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27ff]/g, '').replace(/http[s]?:\/\/\S+/g, ''));
    utterance.lang = 'zh-CN'; window.speechSynthesis.speak(utterance);
}

// 初始化 STT 语音识别模块
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition(); recognition.lang = 'zh-CN';
    recognition.onstart = function () { isRecording = true; document.getElementById('userInput').placeholder = "正在倾听..."; document.getElementById('micBtn').classList.add('recording'); };
    recognition.onresult = function (event) { document.getElementById('userInput').value += event.results[0][0].transcript; };
    recognition.onend = function () { isRecording = false; document.getElementById('userInput').placeholder = "写下情绪或发张照片..."; document.getElementById('micBtn').classList.remove('recording'); };
}

function toggleVoice() {
    unlockAudio();
    if (!recognition) return alert("您的浏览器不支持语音输入。");
    isRecording ? recognition.stop() : recognition.start();
}

/** CV 图像预处理与 Base64 降维 */
function previewImage() {
    const file = document.getElementById('imageInput').files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        const img = new Image(); img.src = e.target.result;
        document.getElementById('imagePreview').src = img.src; document.getElementById('imagePreviewContainer').style.display = 'block';
        img.onload = function () {
            const canvas = document.createElement('canvas');
            const ratio = img.width / img.height;
            canvas.width = img.width > img.height ? IMAGE_MAX_EDGE : Math.round(IMAGE_MAX_EDGE * ratio);
            canvas.height = img.width > img.height ? Math.round(IMAGE_MAX_EDGE / ratio) : IMAGE_MAX_EDGE;
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height); currentImageDataUrl = canvas.toDataURL('image/jpeg', IMAGE_JPEG_QUALITY);
        };
    };
    reader.readAsDataURL(file);
}

function clearImage() { currentImageDataUrl = null; document.getElementById('imageInput').value = ''; document.getElementById('imagePreviewContainer').style.display = 'none'; }
function sendQuickReply(text) { document.getElementById('userInput').value = text; sendMessage(); }
function handleKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

// ==========================================
// 🚀 4. 核心调度与 RAG 通信引擎
// ==========================================
// 新增：专门处理 SSE 流式输出的请求函数
async function fetchStream(endpoint, payload, onChunkReceived) {
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            console.error("请求失败，状态码:", response.status);
            return;
        }

        // 1. 获取流式读取器 (这是流式接收的核心)
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');

        // 2. 开启无限循环，不断接收新的数据块
        while (true) {
            const { done, value } = await reader.read();
            if (done) break; // 如果后端说发完了，就退出循环

            // 3. 把拿到的二进制数据解码成文字
            const chunkString = decoder.decode(value, { stream: true });

            // 4. 解析 SSE 格式 (把 "data: 你好\n\n" 变成 "你好")
            const lines = chunkString.split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const text = line.replace('data: ', '');
                    
                    // 拦截后端发送的结束信号或错误信号
                    if (text === '[DONE]') return;
                    if (text.startsWith('[ERROR]')) {
                        console.error("后端流式报错:", text);
                        return;
                    }

                    // 5. 将干净的文字传给外面的回调函数，用来更新 UI
                    onChunkReceived(text);
                }
            }
        }
    } catch (error) {
        console.error("流式接收发生网络错误:", error);
    }
}
async function fetchJsonWithTimeout(endpoint, payload, timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(buildApiUrl(endpoint), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } finally {
        clearTimeout(timeoutId);
    }
}

async function fetchSSEWithTimeout(endpoint, payload, timeoutMs, { onDelta, onFirstByte, onDone }) {
    const controller = new AbortController();
    let timeoutId;
    let sawFirstByte = false;
    const resetIdleTimeout = () => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    };
    resetIdleTimeout();

    try {
        const response = await fetch(buildApiUrl(endpoint), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (!response.body) throw new Error('当前浏览器不支持流式响应');

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            resetIdleTimeout();

            if (!sawFirstByte) {
                sawFirstByte = true;
                if (onFirstByte) onFirstByte();
            }

            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split('\n\n');
            buffer = events.pop() || '';

            for (const event of events) {
                const dataLines = event
                    .split('\n')
                    .filter(line => line.startsWith('data:'))
                    .map(line => line.slice(5).trimStart());

                if (dataLines.length === 0) continue;

                const data = dataLines.join('\n');
                if (data === '[DONE]') {
                    if (onDone) onDone();
                    return;
                }

                if (data.startsWith('[ERROR]')) {
                    throw new Error(data);
                }
                if (onDelta) {
                    // 直接把拿到的纯文字传给外面的回调函数！
                    onDelta(data); 
                }
            }
        }
        if (onDone) onDone();
    } finally {
        clearTimeout(timeoutId);
    }
}

function applyThemeFromReply(replyText) {
    if (replyText.includes('抱抱') || replyText.includes('难过') || replyText.includes('累') || replyText.includes('压力') || replyText.includes('辛苦')) {
        document.body.className = 'theme-gloomy';
    } else if (replyText.includes('开心') || replyText.includes('棒') || replyText.includes('好') || replyText.includes('期待') || replyText.includes('笑')) {
        document.body.className = 'theme-sunny';
    } else {
        document.body.className = '';
    }
}

function renderStaticPhoto(containerId, originalBase64) {
    destroy3DEffect(containerId);
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = "<img src='" + originalBase64 + "' style='max-width:260px; border-radius:8px;'>";
}

/**
 * 拦截并处理用户的聊天请求，包含离线嗅探、RAG 指令拼接和熔断保护
 */
async function sendMessage() {
    unlockAudio();
    const inputField = document.getElementById('userInput'); const chatBox = document.getElementById('chatBox');
    const text = inputField.value.trim();
    const imageDataUrl = currentImageDataUrl;
    if (!text && !imageDataUrl) return;
    stopTTS();

    // 弱网环境嗅探与熔断
    if (!navigator.onLine) {
        const btn = document.getElementById('sendMsgBtn');
        btn.classList.add('shake'); setTimeout(() => btn.classList.remove('shake'), 500);
        return alert("当前处于离线状态，请检查网络 📡");
    }

    const quickReplies = document.getElementById('quickReplies'); if (quickReplies) quickReplies.style.display = 'none';

    // 渲染用户输入
    const imageId = 'img-' + Date.now();
    let imageHTML = imageDataUrl ? `<div id="${imageId}"></div>` : '';
    chatBox.insertAdjacentHTML('beforeend', `<div class="message-wrapper user-wrapper"><div class="avatar user-avatar">👤</div><div class="message user-message">${text}${imageHTML}</div></div>`);
    fullChatHistory += `用户说：${text}\n`; inputField.value = ''; scrollChatToBottom(false);
    appendDiaryLog(`你：${text}`);

    if (imageDataUrl) renderStaticPhoto(imageId, imageDataUrl);
    if (imageDataUrl) updateDesktopSceneCard(imageDataUrl);

    // 生成等待动画
    const loadingId = 'loading-' + Date.now();
    chatBox.insertAdjacentHTML('beforeend', `<div class="message-wrapper ai-wrapper"><div class="avatar ai-avatar">🌳</div><div class="message ai-message" id="${loadingId}"><div class="typing-dots"><span></span><span></span><span></span></div></div></div>`);
    scrollChatToBottom();

    // RAG: 注入长期情感状态向量
    let payloadText = text;
    if (fullChatHistory.split('用户说：').length <= 3 && longTermMemory.length > 0) {
        let memoryPrompt = "\n\n【系统附加机密指令：作为树洞精灵，请记住用户过去几天的心情状态：";
        longTermMemory.forEach(m => { memoryPrompt += `[${m.date}] ${m.summary}。`; });
        memoryPrompt += "请在接下来的回复中，像老朋友一样，极其自然、不露痕迹地关心一下TA过去几天的状况。】";
        payloadText = text + memoryPrompt;
    }

    try {
        let replyText = '';
        const targetBubble = document.getElementById(loadingId);
        const chatPayload = {
            session_id: getTreehouseSessionId(),
            history: structuredChatHistory.slice(),
            text,
            ...(payloadText !== text ? { text_for_model: payloadText } : {}),
            ...(imageDataUrl ? { image_url: imageDataUrl } : {})
        };

        await fetchSSEWithTimeout('/chat', chatPayload, imageDataUrl ? IMAGE_REQUEST_TIMEOUT_MS : TEXT_REQUEST_TIMEOUT_MS, {
            onFirstByte: () => {
                targetBubble.innerHTML = '';
                targetBubble.classList.add('streaming-chunk-mode');
            },
            onDelta: (chunk) => {
                replyText += chunk;
                appendAnimatedChunk(targetBubble, chunk);
                pushChunkToTTS(chunk);
                scrollChatToBottom();
            },
            onDone: () => {
                targetBubble.classList.remove('streaming-chunk-mode');
                const recallPattern = /上次|你曾说|记得你|说起过|那次|那件事|那件|你还说|之前聊过|那天你|那时候/;
                targetBubble.classList.toggle('memory-recall-hint', recallPattern.test(replyText));
                targetBubble.innerHTML = safeParseMD(replyText, { streaming: true });
                flushTTSBuffer();
            }
        });

        applyThemeFromReply(replyText);
        structuredChatHistory.push({
            role: 'user',
            content: text + (imageDataUrl ? ' [附图]' : '')
        });
        structuredChatHistory.push({ role: 'assistant', content: replyText });
        structuredChatHistory = structuredChatHistory.slice(-30);
        persistStructuredChatHistory();

        fullChatHistory += `小树回复：${replyText}\n`;
        appendDiaryLog(`小树：${replyText}`);

        // 数据闭环：自动存盘
        if (cryptoKeyObj) {
            const encryptedStr = await encryptData(fullChatHistory);
            if (encryptedStr) localStorage.setItem('treeHole_encrypted_history', encryptedStr);
        }

        if (imageDataUrl) create3DPhoto(imageId, imageDataUrl);
    } catch (error) {
        stopTTS();
        if (error.name === 'AbortError') { document.getElementById(loadingId).innerText = "（小树的树枝被风吹断了信号，稍等再试哦 🍂）"; }
        else { document.getElementById(loadingId).innerText = error.message || "（哎呀，信号断啦，稍等再试哦）"; }
    }
    clearImage(); scrollChatToBottom();
}

/**
 * RAG 层归纳：情绪总结生成与记忆存储
 */
async function getSummary() {
    if (!userSecretKey) return alert("请先点击右上角【解锁记忆】，验证身份后再生成情绪报告！");
    if (fullChatHistory === "") return alert("先跟我说说话吧！");

    if (!navigator.onLine) {
        const btn = document.getElementById('summaryBtn');
        btn.classList.add('shake'); setTimeout(() => btn.classList.remove('shake'), 500);
        return alert("当前处于离线状态，生成报告需要网络哦 📡");
    }

    const loadingId = 'summary-' + Date.now();
    document.getElementById('chatBox').insertAdjacentHTML('beforeend', `<div class="message summary-message" id="${loadingId}"><div class="typing-dots"><span></span><span></span><span></span></div></div>`);
    document.getElementById('chatBox').scrollTop = document.getElementById('chatBox').scrollHeight;

    try {
        let rawSummary = (await fetchJsonWithTimeout('/summary', { chat_history: fullChatHistory }, TEXT_REQUEST_TIMEOUT_MS)).summary;
        const match = rawSummary.match(/\[(theme-[a-z]+)\]/);
        if (match) { document.body.className = match[1]; rawSummary = rawSummary.replace(match[0], '').trim(); }

        document.getElementById(loadingId).innerHTML = "<strong>🌟 今日心境报告 🌟</strong><br>" + safeParseMD(rawSummary);
        speakText(rawSummary);

        // 更新时序数据库
        const today = new Date().toLocaleDateString('zh-CN');
        const existingIndex = longTermMemory.findIndex(m => m.date === today);
        if (existingIndex > -1) { longTermMemory[existingIndex].summary = rawSummary; } else { longTermMemory.push({ date: today, summary: rawSummary }); }
        if (longTermMemory.length > 7) longTermMemory.shift();

        if (cryptoKeyObj) {
            const encMem = await encryptData(JSON.stringify(longTermMemory));
            localStorage.setItem('treeHole_long_term_memory', encMem);
        }
    } catch (error) {
        document.getElementById(loadingId).innerText = error.name === 'AbortError' ? "生成超时啦，稍后再试哦 🍂" : "生成失败，请重试。";
    }
}

// ==========================================
// 🌌 5. PixiJS 物理渲染层 (3D 景深 + 粒子系统)
// ==========================================

/**
 * 基于 WebGL 构建 3D 照片和受陀螺仪影响的重力粒子系统
 * @param {string} containerId - 需要渲染的 DOM 容器
 * @param {string} originalBase64 - 原图数据
 */
async function create3DPhoto(containerId, originalBase64) {
    const container = document.getElementById(containerId);
    if (!container) return;
    destroy3DEffect(containerId);
    container.innerHTML = "<div style='font-size:0.9em; color:#888; padding:20px; text-align:center;'>正在解析 3D 深度...</div>";

    if (!navigator.onLine) { container.innerHTML = "<img src='" + originalBase64 + "' style='max-width:100%; border-radius:12px;'>"; return; }

    try {
        const waitLoad = (src) => new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = src; });
        let depthMapUrl = null;
        try {
            const data = await fetchJsonWithTimeout('/generate_depth', { image_url: originalBase64 }, DEPTH_REQUEST_TIMEOUT_MS);
            if (data && data.depth_map) depthMapUrl = data.depth_map;
        } catch (err) {
            depthMapUrl = null;
        }
        if (!depthMapUrl) {
            depthMapUrl = await buildFallbackDepthMapDataUrl(originalBase64);
        }
        const [imgObj] = await Promise.all([waitLoad(originalBase64), waitLoad(depthMapUrl)]);

        container.innerHTML = "";
        container.classList.add('threefx-container');
        const stage = document.createElement('div');
        stage.className = 'threefx-stage';
        container.appendChild(stage);

        const containerWidth = Math.max(220, Math.min(container.clientWidth || 260, 420));
        const appWidth = containerWidth;
        const appHeight = Math.round(appWidth / (imgObj.width / imgObj.height));

        const app = new PIXI.Application({
            width: appWidth,
            height: appHeight,
            backgroundAlpha: 0,
            antialias: true,
            powerPreference: 'high-performance',
            resolution: Math.min(window.devicePixelRatio || 1, 2)
        });
        app.ticker.maxFPS = 60;
        app.view.classList.add('threefx-canvas');
        stage.appendChild(app.view);

        const imgSprite = new PIXI.Sprite(PIXI.Texture.from(originalBase64));
        const depthSprite = new PIXI.Sprite(PIXI.Texture.from(depthMapUrl));
        imgSprite.width = depthSprite.width = appWidth;
        imgSprite.height = depthSprite.height = appHeight;
        app.stage.addChild(imgSprite);
        app.stage.addChild(depthSprite);

        const filter = new PIXI.DisplacementFilter(depthSprite);
        filter.scale.x = 0;
        filter.scale.y = 0;
        app.stage.filters = [filter];

        const particleContainer = new PIXI.Container();
        particleContainer.zIndex = 5;
        app.stage.sortableChildren = true;
        app.stage.addChild(particleContainer);

        const particles = [];
        const currentTheme = document.body.className;
        const particleCount = window.matchMedia('(min-width: 1024px)').matches ? 36 : 24;
        for (let i = 0; i < particleCount; i++) {
            const p = new PIXI.Graphics();
            if (currentTheme === 'theme-gloomy') {
                p.beginFill(0xffffff, 0.45 + Math.random() * 0.2);
                p.drawRect(0, 0, 1.5, 9 + Math.random() * 6);
                p.endFill();
                p.type = 'rain';
                p.vy = 5 + Math.random() * 3;
            } else {
                const color = currentTheme === 'theme-sunny' ? 0xfff1b8 : 0xe2f6ec;
                p.beginFill(color, 0.35 + Math.random() * 0.35);
                p.drawCircle(0, 0, 1.2 + Math.random() * 1.4);
                p.endFill();
                p.type = 'orb';
                p.vy = -0.3 - Math.random() * 0.7;
            }
            p.x = Math.random() * appWidth;
            p.y = Math.random() * appHeight;
            p.randomOffset = Math.random() * 100;
            particleContainer.addChild(p);
            particles.push(p);
        }

        const tilt = { x: 0, y: 0 };
        const applyTilt = (x, y) => {
            tilt.x = Math.max(-1, Math.min(1, x));
            tilt.y = Math.max(-1, Math.min(1, y));
            filter.scale.x = -tilt.x * 14;
            filter.scale.y = -tilt.y * 14;
        };

        app.ticker.add(() => {
            particles.forEach(p => {
                p.y += p.vy;
                if (p.type === 'rain') {
                    p.x += tilt.x * 4.8;
                    p.rotation = -tilt.x * 0.16;
                    if (p.y > appHeight + 12) { p.y = -18; p.x = Math.random() * appWidth; }
                    if (p.x < -18) p.x = appWidth + 18;
                    if (p.x > appWidth + 18) p.x = -18;
                } else {
                    p.x += Math.sin(Date.now() / 1200 + p.randomOffset) * 0.24 + (tilt.x * 1.4);
                    if (p.y < -10) { p.y = appHeight + 8; p.x = Math.random() * appWidth; }
                }
            });
        });

        const onMouseMove = (e) => {
            const rect = stage.getBoundingClientRect();
            applyTilt(((e.clientX - rect.left) / rect.width - 0.5) * 2, ((e.clientY - rect.top) / rect.height - 0.5) * 2);
        };
        const onMouseLeave = () => applyTilt(0, 0);
        const onTouchMove = (e) => {
            if (!e.touches || e.touches.length === 0) return;
            const rect = stage.getBoundingClientRect();
            const touch = e.touches[0];
            applyTilt(((touch.clientX - rect.left) / rect.width - 0.5) * 2, ((touch.clientY - rect.top) / rect.height - 0.5) * 2);
        };
        const onTouchEnd = () => applyTilt(0, 0);
        const onOrientation = (e) => {
            if (typeof e.gamma !== 'number' || typeof e.beta !== 'number') return;
            applyTilt(e.gamma / 30, (e.beta - 45) / 30);
        };
        const requestGyroPermission = async () => {
            if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
                try { await DeviceOrientationEvent.requestPermission(); } catch (e) { }
            }
        };

        stage.addEventListener('mousemove', onMouseMove);
        stage.addEventListener('mouseleave', onMouseLeave);
        stage.addEventListener('click', requestGyroPermission, { once: true });
        stage.addEventListener('touchmove', onTouchMove, { passive: true });
        stage.addEventListener('touchend', onTouchEnd, { passive: true });
        window.addEventListener('deviceorientation', onOrientation, { passive: true });

        const resizeObserver = new ResizeObserver(() => {
            const nextWidth = Math.max(220, Math.min(container.clientWidth || appWidth, 420));
            const nextHeight = Math.round(nextWidth / (imgObj.width / imgObj.height));
            app.renderer.resize(nextWidth, nextHeight);
            imgSprite.width = depthSprite.width = nextWidth;
            imgSprite.height = depthSprite.height = nextHeight;
        });
        resizeObserver.observe(container);

        active3DEffects.set(containerId, {
            cleanup: () => {
                resizeObserver.disconnect();
                stage.removeEventListener('mousemove', onMouseMove);
                stage.removeEventListener('mouseleave', onMouseLeave);
                stage.removeEventListener('click', requestGyroPermission);
                stage.removeEventListener('touchmove', onTouchMove);
                stage.removeEventListener('touchend', onTouchEnd);
                window.removeEventListener('deviceorientation', onOrientation);
                app.destroy(true, { children: true, texture: false, baseTexture: false });
                container.classList.remove('threefx-container');
            }
        });
    } catch (err) {
        renderStaticPhoto(containerId, originalBase64);
    }
}

function init3DEffect(imgElement) {
    if (!imgElement) return;
    const wrapper = imgElement.closest('[id^="img-"]');
    if (!wrapper || wrapper.dataset.threefxReady === '1') return;
    wrapper.dataset.threefxReady = '1';
    create3DPhoto(wrapper.id, imgElement.src);
}

function initDynamic3DEffectObserver() {
    if (dynamicImageObserver) return;
    const chatBox = document.getElementById('chatBox');
    if (!chatBox) return;
    dynamicImageObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (!(node instanceof HTMLElement)) return;
                if (node.matches && node.matches('[id^="img-"] img')) init3DEffect(node);
                const images = node.querySelectorAll ? node.querySelectorAll('[id^="img-"] img') : [];
                images.forEach(img => init3DEffect(img));
            });
        });
    });
    dynamicImageObserver.observe(chatBox, { childList: true, subtree: true });
}

async function buildFallbackDepthMapDataUrl(originalBase64) {
    const waitLoad = (src) => new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
    const img = await waitLoad(originalBase64);
    const maxW = 220;
    const w = Math.max(96, Math.min(maxW, img.width));
    const h = Math.max(96, Math.round(w / (img.width / img.height)));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        const depth = Math.min(255, Math.max(0, 235 - lum * 0.75));
        data[i] = depth;
        data[i + 1] = depth;
        data[i + 2] = depth;
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
}

// ==========================================
// 🔔 6. PWA 沉浸式引擎初始化
// ==========================================

/**
 * 跨平台 PWA 安装引导机制
 */
function initPWA() {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone || document.referrer.includes('android-app://');
    const hasDismissed = localStorage.getItem('treeHole_pwa_dismissed');

    if (isStandalone) { console.log("📱 已在沉浸式原生模式下运行。"); return; }

    const pwaBanner = document.getElementById('pwaBanner');
    const installBtn = document.getElementById('pwaInstallBtn');
    const closeBtn = document.getElementById('pwaCloseBtn');
    let deferredPrompt = null;

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault(); deferredPrompt = e;
        if (!hasDismissed) setTimeout(() => pwaBanner.classList.add('show'), 2000);
    });

    if (!hasDismissed && !deferredPrompt) setTimeout(() => pwaBanner.classList.add('show'), 2500);

    installBtn.onclick = async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') pwaBanner.classList.remove('show');
            deferredPrompt = null;
        } else {
            const isIos = () => /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
            if (isIos()) { alert("🍎 苹果手机：\n请点击浏览器底部的『分享框 ↗』图标\n然后向上滑动选择『添加到主屏幕』\n即可拥有和原生 App 一样的全屏体验！"); }
            else { alert("💻 电脑浏览器：\n请点击地址栏最右侧的『安装』图标，\n或在菜单栏选择『作为应用安装』！"); }
        }
    };

    closeBtn.onclick = () => { pwaBanner.classList.remove('show'); localStorage.setItem('treeHole_pwa_dismissed', 'true'); };
}

window.addEventListener('load', () => {
    hydrateStructuredChatHistory();
    initPWA();
    ensureTTSResumeUI();
    initDynamic3DEffectObserver();
});