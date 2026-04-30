export const config = {
    runtime: 'edge', // 保持极速边缘计算
};

export default async function handler(req) {
    const { searchParams } = new URL(req.url);
    const endpointRaw = searchParams.get('endpoint') || '/';
    const endpoint = endpointRaw.startsWith('/') ? endpointRaw : `/${endpointRaw}`;
    const backendOrigins = [
        process.env.HF_BACKEND_URL,
        'https://likeyouylr-tree-house-likeyouylr.hf.space',
        'https://likeyouylr-tree-houselikeyouylr.hf.space',
    ].filter(Boolean);

    // 1. 克隆所有原始请求头，完美兼容图片的 multipart/form-data 或 image/jpeg
    const newHeaders = new Headers(req.headers);
    newHeaders.delete('host'); // 剥离 Host，防止 Hugging Face 识别代理报错
    newHeaders.delete('origin');
    newHeaders.delete('referer');

    let lastError = null;
    for (const origin of backendOrigins) {
        const targetUrl = `${origin}${endpoint}`;
        try {
            // 2. 将数据流 (req.body) 原封不动地透传给后端，不再使用 req.text() 破坏二进制结构
            const response = await fetch(targetUrl, {
                method: req.method,
                headers: newHeaders,
                body: (req.method !== 'GET' && req.method !== 'HEAD') ? req.body : undefined,
                redirect: 'manual',
                duplex: 'half' // 允许流式传输
            });

            // 3. 404/5xx 允许尝试下一条后端地址（容灾）
            if (response.status >= 500 || response.status === 404) {
                lastError = new Error(`${origin} => HTTP ${response.status}`);
                continue;
            }

            return new Response(response.body, {
                status: response.status,
                headers: response.headers
            });
        } catch (error) {
            lastError = error;
            continue;
        }
    }

    return new Response(JSON.stringify({
        error: "代理层透传失败",
        detail: lastError ? String(lastError.message || lastError) : "no backend available",
        tried: backendOrigins
    }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
    });
}