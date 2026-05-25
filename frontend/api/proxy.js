export const config = {
    runtime: 'edge',
    maxDuration: 300,
};

const DEFAULT_BACKEND_ORIGINS = [
    'https://likeyouylr-tree-houselikeyouylr.hf.space',
];

export default async function handler(req) {
    const { searchParams } = new URL(req.url);
    const endpointRaw = searchParams.get('endpoint') || '/';
    const endpoint = endpointRaw.startsWith('/') ? endpointRaw : `/${endpointRaw}`;

    const envOrigin = process.env.HF_BACKEND_URL;
    const backendOrigins = [
        ...(envOrigin ? [envOrigin] : []),
        ...DEFAULT_BACKEND_ORIGINS,
    ].filter((url, index, arr) => url && arr.indexOf(url) === index);

    const newHeaders = new Headers(req.headers);
    newHeaders.delete('host');
    newHeaders.delete('origin');
    newHeaders.delete('referer');

    let lastError = null;
    for (const origin of backendOrigins) {
        const targetUrl = `${origin}${endpoint}`;
        try {
            const response = await fetch(targetUrl, {
                method: req.method,
                headers: newHeaders,
                body: (req.method !== 'GET' && req.method !== 'HEAD') ? req.body : undefined,
                redirect: 'manual',
                duplex: 'half',
            });

            if (response.status >= 500 || response.status === 404) {
                lastError = new Error(`${origin} => HTTP ${response.status}`);
                continue;
            }

            const outHeaders = new Headers(response.headers);
            outHeaders.set('Access-Control-Allow-Origin', '*');
            return new Response(response.body, {
                status: response.status,
                headers: outHeaders,
            });
        } catch (error) {
            lastError = error;
            continue;
        }
    }

    return new Response(JSON.stringify({
        error: '代理层透传失败',
        detail: lastError ? String(lastError.message || lastError) : 'no backend available',
        tried: backendOrigins,
    }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
    });
}
