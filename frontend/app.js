/**
 * @file app.js
 * @description 核心交互逻辑、AES-GCM 零信任加密引擎、PixiJS 3D/粒子系统与 RAG 时序记忆引擎。
 * @author 你的名字 / 树洞开发团队
 */

// ==========================================
// 📦 1. 全局状态与配置区
// ==========================================
let fullChatHistory = "";         // 记录本次会话的完整历史
let longTermMemory = [];          // 长期记忆库（存放过去的情绪总结）
let currentImageDataUrl = null;   // 当前待发送的 Base64 图片数据
let recognition;                  // Web Speech API 实例
let isRecording = false;          // 录音状态标记
let isVoiceOn = true;             // 语音播报开关状态
let isAudioUnlocked = false;      // 移动端音频引擎是否已解锁
let userSecretKey = null;         // 用户的专属 AES 密码（明文，仅内存中存留）
let cryptoKeyObj = null;          // Web Crypto API 派生出的底层加密对象

/**
 * 容错 Markdown 解析
 * @param {string} text - 原始文本 
 * @returns {string} 渲染后的 HTML 或原文本（若解析器未加载）
 */
function safeParseMD(text) {
    try { return typeof marked !== 'undefined' ? marked.parse(text) : text; }
    catch (e) { return text; }
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
        fullChatHistory = ""; cryptoKeyObj = null; userSecretKey = null;
        document.getElementById('chatBox').innerHTML = `<div class="message-wrapper ai-wrapper"><div class="avatar ai-avatar">🌳</div><div class="message ai-message">你好呀！我是你的专属树洞精灵『小树』✨<br><strong>今天想聊点什么呢？随时可以告诉我哦。</strong></div></div>`;
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
    fullChatHistory = ""; longTermMemory = []; cryptoKeyObj = null; userSecretKey = null;

    document.getElementById('exportBtn').style.display = 'none';
    document.getElementById('destroyBtn').style.display = 'none';
    document.getElementById('newChatBtn').style.display = 'none';
    document.getElementById('lockBtn').style.display = 'inline-block';
    document.getElementById('chatBox').innerHTML = `<div class="message-wrapper ai-wrapper"><div class="avatar ai-avatar">🌳</div><div class="message ai-message" style="border-left: 4px solid #ef4444;">您的所有历史记忆已被彻底安全擦除。<br><strong>过去已成往事，现在，我们重新开始吧。✨</strong></div></div>`;
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
    if (!isVoiceOn && 'speechSynthesis' in window) window.speechSynthesis.cancel();
}

/** Web Speech API TTS (文字转语音) 包装 */
function speakText(text) {
    if (!isVoiceOn || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
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
            canvas.width = img.width > img.height ? 1024 : Math.round(1024 * (img.width / img.height));
            canvas.height = img.width > img.height ? Math.round(1024 / (img.width / img.height)) : 1024;
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height); currentImageDataUrl = canvas.toDataURL('image/jpeg', 0.8);
        };
    };
    reader.readAsDataURL(file);
}

function clearImage() { currentImageDataUrl = null; document.getElementById('imageInput').value = ''; document.getElementById('imagePreviewContainer').style.display = 'none'; }
function sendQuickReply(text) { document.getElementById('userInput').value = text; sendMessage(); }
function handleKeyPress(event) { if (event.key === 'Enter') sendMessage(); }

// ==========================================
// 🚀 4. 核心调度与 RAG 通信引擎
// ==========================================

/**
 * 拦截并处理用户的聊天请求，包含离线嗅探、RAG 指令拼接和熔断保护
 */
async function sendMessage() {
    unlockAudio();
    const inputField = document.getElementById('userInput'); const chatBox = document.getElementById('chatBox');
    const text = inputField.value.trim(); if (!text && !currentImageDataUrl) return;

    // 弱网环境嗅探与熔断
    if (!navigator.onLine) {
        const btn = document.getElementById('sendMsgBtn');
        btn.classList.add('shake'); setTimeout(() => btn.classList.remove('shake'), 500);
        return alert("当前处于离线状态，请检查网络 📡");
    }

    const quickReplies = document.getElementById('quickReplies'); if (quickReplies) quickReplies.style.display = 'none';

    // 渲染用户输入
    const imageId = 'img-' + Date.now();
    let imageHTML = currentImageDataUrl ? `<div id="${imageId}"></div>` : '';
    chatBox.insertAdjacentHTML('beforeend', `<div class="message-wrapper user-wrapper"><div class="avatar user-avatar">👤</div><div class="message user-message">${text}${imageHTML}</div></div>`);
    fullChatHistory += `用户说：${text}\n`; inputField.value = ''; chatBox.scrollTop = chatBox.scrollHeight;

    if (currentImageDataUrl) create3DPhoto(imageId, currentImageDataUrl);

    // 生成等待动画
    const loadingId = 'loading-' + Date.now();
    chatBox.insertAdjacentHTML('beforeend', `<div class="message-wrapper ai-wrapper"><div class="avatar ai-avatar">🌳</div><div class="message ai-message" id="${loadingId}"><div class="typing-dots"><span></span><span></span><span></span></div></div></div>`);
    chatBox.scrollTop = chatBox.scrollHeight;

    // RAG: 注入长期情感状态向量
    let payloadText = text;
    if (fullChatHistory.split('用户说：').length <= 3 && longTermMemory.length > 0) {
        let memoryPrompt = "\n\n【系统附加机密指令：作为树洞精灵，请记住用户过去几天的心情状态：";
        longTermMemory.forEach(m => { memoryPrompt += `[${m.date}] ${m.summary}。`; });
        memoryPrompt += "请在接下来的回复中，像老朋友一样，极其自然、不露痕迹地关心一下TA过去几天的状况。】";
        payloadText = text + memoryPrompt;
    }

    // 设置 AbortController，图片需 60 秒视觉处理时间
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
        const response = await fetch('https://likeyouylr-tree-houselikeyouylr.hf.space/chat', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: payloadText, image_url: currentImageDataUrl }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        const data = await response.json();

        // 动态场景嗅探：基于回复文字自动切换 CSS 流体背景
        const replyText = data.reply;
        if (replyText.includes('抱抱') || replyText.includes('难过') || replyText.includes('累') || replyText.includes('压力') || replyText.includes('辛苦')) {
            document.body.className = 'theme-gloomy';
        } else if (replyText.includes('开心') || replyText.includes('棒') || replyText.includes('好') || replyText.includes('期待') || replyText.includes('笑')) {
            document.body.className = 'theme-sunny';
        } else { document.body.className = ''; }

        document.getElementById(loadingId).innerHTML = safeParseMD(replyText);
        fullChatHistory += `小树回复：${replyText}\n`; speakText(replyText);

        // 数据闭环：自动存盘
        if (cryptoKeyObj) {
            const encryptedStr = await encryptData(fullChatHistory);
            if (encryptedStr) localStorage.setItem('treeHole_encrypted_history', encryptedStr);
        }
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') { document.getElementById(loadingId).innerText = "（小树的树枝被风吹断了信号，稍等再试哦 🍂）"; }
        else { document.getElementById(loadingId).innerText = "（哎呀，信号断啦，稍等再试哦）"; }
    }
    clearImage(); chatBox.scrollTop = chatBox.scrollHeight;
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
        const response = await fetch('https://likeyouylr-tree-houselikeyouylr.hf.space/summary', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_history: fullChatHistory }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        let rawSummary = (await response.json()).summary;
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
        clearTimeout(timeoutId);
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
    container.innerHTML = "<div style='font-size:0.9em; color:#888; padding:20px; text-align:center;'>正在解析 3D 深度...</div>";

    if (!navigator.onLine) { container.innerHTML = "<img src='" + originalBase64 + "' style='max-width:260px; border-radius:8px;'>"; return; }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
        const response = await fetch('https://likeyouylr-tree-houselikeyouylr.hf.space/generate_depth', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_url: originalBase64 }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        const data = await response.json();
        const waitLoad = (src) => new Promise(res => { const img = new Image(); img.onload = () => res(img); img.src = src; });
        const [imgObj, depthObj] = await Promise.all([waitLoad(originalBase64), waitLoad(data.depth_map)]);

        const appWidth = 260; const appHeight = Math.round(appWidth / (imgObj.width / imgObj.height));
        container.innerHTML = "";
        const app = new PIXI.Application({ width: appWidth, height: appHeight, backgroundAlpha: 0 }); container.appendChild(app.view);

        const imgSprite = new PIXI.Sprite(PIXI.Texture.from(originalBase64)); const depthSprite = new PIXI.Sprite(PIXI.Texture.from(data.depth_map));
        imgSprite.width = depthSprite.width = appWidth; imgSprite.height = depthSprite.height = appHeight;
        app.stage.addChild(imgSprite); app.stage.addChild(depthSprite);

        const filter = new PIXI.DisplacementFilter(depthSprite); app.stage.filters = [filter]; filter.scale.x = 0; filter.scale.y = 0;

        // --- 引入基于主题的环境天气引擎 ---
        const particleContainer = new PIXI.Container();
        app.stage.addChild(particleContainer);
        const particles = [];
        const currentTheme = document.body.className;

        for (let i = 0; i < 50; i++) {
            const p = new PIXI.Graphics();
            if (currentTheme === 'theme-gloomy') {
                p.beginFill(0xffffff, 0.5 + Math.random() * 0.3); p.drawRect(0, 0, 1.5, 12 + Math.random() * 8); p.endFill();
                p.type = 'rain'; p.vy = 8 + Math.random() * 5;
            } else {
                const color = currentTheme === 'theme-sunny' ? 0xffeaa7 : 0xd1fae5;
                p.beginFill(color, 0.4 + Math.random() * 0.4); p.drawCircle(0, 0, 1.5 + Math.random() * 2); p.endFill();
                p.type = 'orb'; p.vy = -0.5 - Math.random() * 1;
            }
            p.x = Math.random() * appWidth; p.y = Math.random() * appHeight;
            p.vx = 0; p.baseX = p.x; p.randomOffset = Math.random() * 100;
            particleContainer.addChild(p); particles.push(p);
        }

        window.lastTiltX = 0;
        app.ticker.add(() => {
            particles.forEach(p => {
                p.y += p.vy;
                if (p.type === 'rain') {
                    p.x += window.lastTiltX * 8; p.rotation = -window.lastTiltX * 0.2;
                    if (p.y > appHeight) { p.y = -20; p.x = Math.random() * appWidth; }
                    if (p.x < -20) p.x = appWidth + 20; if (p.x > appWidth + 20) p.x = -20;
                } else {
                    p.x += Math.sin(Date.now() / 1000 + p.randomOffset) * 0.3 + (window.lastTiltX * 2);
                    if (p.y < -10) { p.y = appHeight + 10; p.x = Math.random() * appWidth; }
                }
            });
        });

        const applyTilt = (x, y) => { filter.scale.x = -x * 15; filter.scale.y = -y * 15; window.lastTiltX = x; };

        // --- 多端控制监听绑定 ---
        container.addEventListener('mousemove', (e) => { const rect = container.getBoundingClientRect(); applyTilt(((e.clientX - rect.left) / rect.width - 0.5) * 2, ((e.clientY - rect.top) / rect.height - 0.5) * 2); });
        container.addEventListener('mouseleave', () => applyTilt(0, 0));
        container.addEventListener('touchmove', (e) => { e.preventDefault(); const rect = container.getBoundingClientRect(); const touch = e.touches[0]; applyTilt(((touch.clientX - rect.left) / rect.width - 0.5) * 2, ((touch.clientY - rect.top) / rect.height - 0.5) * 2); });
        container.addEventListener('touchend', () => applyTilt(0, 0));
        if (window.DeviceOrientationEvent) { window.addEventListener('deviceorientation', (e) => { if (e.gamma !== null && e.beta !== null) { applyTilt(Math.min(Math.max(e.gamma / 30, -1), 1), Math.min(Math.max((e.beta - 45) / 30, -1), 1)); } }); }
    } catch (err) {
        clearTimeout(timeoutId); container.innerHTML = "<img src='" + originalBase64 + "' style='max-width:260px; border-radius:8px;'>";
    }
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

window.addEventListener('load', initPWA);