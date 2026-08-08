// Cloudflare Pages Advanced Worker Handler for XOAMAAN
// Supports 100% free serverless REST API + Static Assets on Cloudflare Pages

let memoryCodes = null;
let pendingRequests = [];

// Seed initial 1000 codes
function seedInitialCodes() {
    if (memoryCodes) return memoryCodes;
    const sampleCodes = [
        "01E2","020X","026J","0424","04OG","04V4","04V8","05H7","060Z","065T","06EG","07BW","0897","0ABQ","0BRL","0CDV","0CI2","0E09","0IWE","0JXN","0OKL","0PMS","0TUG","0U0E","0U4T","0ULU","0UQW","0V8K","0VGP","0ZTB","103J","1101","1248","15GO","16UE","1761","17PK"
    ];
    
    // Seed 1000 codes
    const codes = [];
    sampleCodes.forEach(c => {
        codes.push({
            id: c,
            assignedAccount: null,
            status: 'available',
            createdAt: new Date().toISOString(),
            assignedAt: null,
            usedAt: null
        });
    });

    // Fill to 1000 codes with random unique IDs if needed
    const set = new Set(codes.map(c => c.id));
    while(codes.length < 1000) {
        const rand = 'VIP' + Math.random().toString(36).substring(2, 6).toUpperCase();
        if (!set.has(rand)) {
            set.add(rand);
            codes.push({
                id: rand,
                assignedAccount: null,
                status: 'available',
                createdAt: new Date().toISOString(),
                assignedAt: null,
                usedAt: null
            });
        }
    }

    memoryCodes = codes;
    return memoryCodes;
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;

        // CORS headers
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Content-Type': 'application/json;charset=UTF-8'
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        // --- DOMAIN CONFIGURATION FOR CLOUDFLARE ---
        const DOMAIN_CONFIG = {
            default: {
                targetUrl: "https://mm86f.vip",
                telegramUrl: "https://t.me/ITXOAMAAN",
                telegramUsername: "@ITXOAMAAN",
                codeTelegramUrl: "https://t.me/TLITMAAN",
                codeTelegramUsername: "@TLITMAAN"
            },
            domains: {
                "xoaipmaan.com": {
                    targetUrl: "https://mm86f.vip",
                    telegramUrl: "https://t.me/ITXOAMAAN",
                    telegramUsername: "@ITXOAMAAN",
                    codeTelegramUrl: "https://t.me/TLITMAAN",
                    codeTelegramUsername: "@TLITMAAN"
                },
                "xoaipmaan.net": {
                    targetUrl: "https://m88qt.uk",
                    telegramUrl: "https://t.me/it_wed",
                    telegramUsername: "@it_wed",
                    codeTelegramUrl: "https://t.me/KhanhLinh_8M",
                    codeTelegramUsername: "@KhanhLinh_8M"
                }
            }
        };

        if (path === '/api/domain-config') {
            const host = (url.hostname || '').toLowerCase().trim();
            const cleanHost = host.replace(/^www\./, '');
            const match = DOMAIN_CONFIG.domains[host] || DOMAIN_CONFIG.domains[cleanHost] || {};
            const resultConfig = {
                domain: host,
                targetUrl: match.targetUrl || DOMAIN_CONFIG.default.targetUrl,
                telegramUrl: match.telegramUrl || DOMAIN_CONFIG.default.telegramUrl,
                telegramUsername: match.telegramUsername || DOMAIN_CONFIG.default.telegramUsername
            };
            return new Response(JSON.stringify({ success: true, config: resultConfig, allDomains: DOMAIN_CONFIG }), { headers: corsHeaders });
        }

        // --- API ROUTES ---
        if (path.startsWith('/api/')) {
            let codes = seedInitialCodes();
            const GLOBAL_BLOB_URL = 'https://jsonblob.com/api/jsonBlob/019fbacd-a33b-79bd-895a-44053b741804';

            // Load from KV if available
            if (env.CODES_KV) {
                try {
                    const kvData = await env.CODES_KV.get('codes_data', 'json');
                    if (kvData && Array.isArray(kvData)) codes = kvData;
                    const kvPending = await env.CODES_KV.get('pending_data', 'json');
                    if (kvPending && Array.isArray(kvPending)) pendingRequests = kvPending;
                } catch(e){}
            }

            // Sync with JSONBlob global store
            try {
                const blobRes = await fetch(GLOBAL_BLOB_URL, { headers: { 'Accept': 'application/json' } });
                const blobData = await blobRes.json().catch(() => null);
                if (blobData) {
                    if (Array.isArray(blobData.pending)) {
                        pendingRequests = blobData.pending;
                    }
                    if (blobData.codesMap && typeof blobData.codesMap === 'object') {
                        for (const codeId in blobData.codesMap) {
                            const info = blobData.codesMap[codeId];
                            const target = codes.find(c => c.id.toUpperCase() === codeId.toUpperCase());
                            if (target && info) {
                                target.assignedAccount = info.assignedAccount || null;
                                target.status = info.status || 'available';
                                if (info.assignedAt) target.assignedAt = info.assignedAt;
                                if (info.usedAt) target.usedAt = info.usedAt;
                            }
                        }
                    }
                }
            } catch(e){}

            async function saveState() {
                if (env.CODES_KV) {
                    try {
                        await env.CODES_KV.put('codes_data', JSON.stringify(codes));
                        await env.CODES_KV.put('pending_data', JSON.stringify(pendingRequests));
                    } catch(e){}
                }

                // Sync back to JSONBlob
                try {
                    const codesMap = {};
                    codes.forEach(c => {
                        if (c.status !== 'available' || c.assignedAccount) {
                            codesMap[c.id] = {
                                id: c.id,
                                status: c.status,
                                assignedAccount: c.assignedAccount,
                                assignedAt: c.assignedAt,
                                usedAt: c.usedAt
                            };
                        }
                    });
                    await fetch(GLOBAL_BLOB_URL, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                        body: JSON.stringify({ pending: pendingRequests, codesMap })
                    }).catch(() => {});
                } catch(e){}
            }

            // 1. POST /api/admin/login
            if (path === '/api/admin/login' && request.method === 'POST') {
                const body = await request.json().catch(() => ({}));
                if (body.username === 'admin' && body.password === 'admin123') {
                    return new Response(JSON.stringify({ success: true, token: 'admin-token-cf-2026', message: 'Đăng nhập thành công' }), { headers: corsHeaders });
                }
                return new Response(JSON.stringify({ success: false, message: 'Sai tên đăng nhập hoặc mật khẩu' }), { status: 401, headers: corsHeaders });
            }

            // 2. GET /api/admin/stats
            if (path === '/api/admin/stats') {
                const total = codes.length;
                const available = codes.filter(c => c.status === 'available').length;
                const assigned = codes.filter(c => c.status === 'assigned').length;
                const used = codes.filter(c => c.status === 'used').length;
                return new Response(JSON.stringify({ success: true, stats: { total, available, assigned, used } }), { headers: corsHeaders });
            }

            // 3. GET /api/admin/codes
            if (path === '/api/admin/codes') {
                const status = url.searchParams.get('status');
                const query = url.searchParams.get('query');
                let list = [...codes];

                if (status && status !== 'all') {
                    list = list.filter(c => c.status === status);
                }
                if (query) {
                    const q = query.toLowerCase().trim();
                    list = list.filter(c => c.id.toLowerCase().includes(q) || (c.assignedAccount && c.assignedAccount.toLowerCase().includes(q)));
                }

                // Sort assigned accounts to top
                list.sort((a, b) => {
                    const hasAccA = a.assignedAccount ? 1 : 0;
                    const hasAccB = b.assignedAccount ? 1 : 0;
                    if (hasAccA !== hasAccB) return hasAccB - hasAccA;
                    const timeA = new Date(a.usedAt || a.assignedAt || a.createdAt || 0).getTime();
                    const timeB = new Date(b.usedAt || b.assignedAt || b.createdAt || 0).getTime();
                    return timeB - timeA;
                });

                return new Response(JSON.stringify({ success: true, total: list.length, codes: list }), { headers: corsHeaders });
            }

            // API CONFIG & IP DETECTION
            if (path === '/api/config') {
                const prefixes = ['113.161', '14.225', '27.72', '116.108', '42.113', '171.244'];
                const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
                const clientIp = `${prefix}.${Math.floor(Math.random() * 240 + 10)}.${Math.floor(Math.random() * 240 + 10)}`;
                return new Response(JSON.stringify({ success: true, removeCode: 'ok', ip: clientIp }), { headers: corsHeaders });
            }
            if (path === '/api/banners') {
                return new Response(JSON.stringify([]), { headers: corsHeaders });
            }

            // 4. POST /api/request-code (User enters account, waiting for Admin)
            if (path === '/api/request-code' && request.method === 'POST') {
                const body = await request.json().catch(() => ({}));
                const acc = (body.account || '').trim();
                if (!acc || acc.length < 4) {
                    return new Response(JSON.stringify({ success: false, message: 'Tài khoản phải từ 4 ký tự trở lên' }), { status: 400, headers: corsHeaders });
                }

                let existing = codes.find(c => c.assignedAccount && c.assignedAccount.toLowerCase() === acc.toLowerCase());
                if (existing) {
                    return new Response(JSON.stringify({ success: true, status: 'assigned', code: existing }), { headers: corsHeaders });
                }

                if (!pendingRequests.find(p => p.account.toLowerCase() === acc.toLowerCase())) {
                    pendingRequests.unshift({ account: acc, requestedAt: new Date().toISOString() });
                    if (pendingRequests.length > 100) pendingRequests.pop();
                }

                await saveState();
                return new Response(JSON.stringify({ success: true, status: 'pending', message: 'Đã gửi tài khoản tới Admin' }), { headers: corsHeaders });
            }

            // 4.5. GET /api/check-status
            if (path === '/api/check-status' || path.startsWith('/api/check-status')) {
                const acc = (url.searchParams.get('account') || '').trim();
                let existing = codes.find(c => c.assignedAccount && c.assignedAccount.toLowerCase() === acc.toLowerCase());
                if (existing) {
                    return new Response(JSON.stringify({ success: true, status: 'assigned', code: existing }), { headers: corsHeaders });
                }
                return new Response(JSON.stringify({ success: true, status: 'pending' }), { headers: corsHeaders });
            }

            // 5. GET /api/admin/pending
            if (path === '/api/admin/pending') {
                return new Response(JSON.stringify({ success: true, pending: pendingRequests }), { headers: corsHeaders });
            }

            // 6. POST /api/admin/dismiss-pending (Deletes account AND sets assigned giftcode to deleted)
            if (path === '/api/admin/dismiss-pending' && request.method === 'POST') {
                const body = await request.json().catch(() => ({}));
                if (body.account) {
                    const accLower = body.account.trim().toLowerCase();
                    pendingRequests = pendingRequests.filter(p => p.account.toLowerCase() !== accLower);
                    codes.forEach(c => {
                        if (c.assignedAccount && c.assignedAccount.toLowerCase() === accLower) {
                            c.status = 'deleted';
                            c.assignedAccount = null;
                        }
                    });
                    await saveState();
                }
                return new Response(JSON.stringify({ success: true, message: 'Đã xóa tài khoản và giftcode liên quan' }), { headers: corsHeaders });
            }

            // 7. POST /api/admin/assign
            if (path === '/api/admin/assign' && request.method === 'POST') {
                const body = await request.json().catch(() => ({}));
                const acc = (body.account || '').trim();
                const accountType = body.accountType || 'clean';
                if (!acc) return new Response(JSON.stringify({ success: false, message: 'Tên tài khoản trống' }), { status: 400, headers: corsHeaders });

                let existing = codes.find(c => c.assignedAccount && c.assignedAccount.toLowerCase() === acc.toLowerCase());
                if (existing) {
                    if (accountType) existing.accountType = accountType;
                    await saveState();
                    return new Response(JSON.stringify({ success: true, alreadyAssigned: true, code: existing }), { headers: corsHeaders });
                }

                let avail = codes.find(c => c.status === 'available' && !c.assignedAccount);
                if (!avail) return new Response(JSON.stringify({ success: false, message: 'Hết mã' }), { status: 400, headers: corsHeaders });

                avail.assignedAccount = acc;
                avail.status = 'assigned';
                avail.assignedAt = new Date().toISOString();
                avail.accountType = accountType;
                await saveState();

                return new Response(JSON.stringify({ success: true, code: avail }), { headers: corsHeaders });
            }

            // 7.5. POST /api/admin/update-type
            if (path === '/api/admin/update-type' && request.method === 'POST') {
                const body = await request.json().catch(() => ({}));
                const codeId = (body.codeId || '').trim().toUpperCase();
                const accountType = (body.accountType || 'clean').trim();
                const target = codes.find(c => c.id.toUpperCase() === codeId);
                if (target) {
                    target.accountType = accountType;
                    await saveState();
                    return new Response(JSON.stringify({ success: true, code: target }), { headers: corsHeaders });
                }
                return new Response(JSON.stringify({ success: false, message: 'Mã không tồn tại' }), { status: 404, headers: corsHeaders });
            }

            // 8. POST /api/use-code
            if (path === '/api/use-code' && request.method === 'POST') {
                const body = await request.json().catch(() => ({}));
                const target = codes.find(c => c.id === body.codeId);
                if (target) {
                    target.status = 'used';
                    target.usedAt = new Date().toISOString();
                    await saveState();
                    return new Response(JSON.stringify({ success: true, code: target }), { headers: corsHeaders });
                }
                return new Response(JSON.stringify({ success: false, message: 'Mã không tồn tại' }), { status: 404, headers: corsHeaders });
            }

            // 8.5. POST /api/verify-code (Verify code ownership & status)
            if ((path === '/api/verify-code' || path.startsWith('/api/verify-code')) && (request.method === 'POST' || request.method === 'GET')) {
                let body = await request.json().catch(() => ({}));
                let acc = (body.account || url.searchParams.get('account') || '').trim().toLowerCase();
                let codeId = (body.codeId || url.searchParams.get('codeId') || '').trim().toUpperCase();

                const target = codes.find(c => c.id.toUpperCase() === codeId);
                if (!target) {
                    return new Response(JSON.stringify({ success: false, message: `Mã ${codeId} không tồn tại!` }), { status: 404, headers: corsHeaders });
                }

                if (target.status === 'used') {
                    return new Response(JSON.stringify({ success: false, message: `Mã ${codeId} đã được sử dụng trước đó!` }), { status: 400, headers: corsHeaders });
                }

                if (target.status === 'deleted') {
                    return new Response(JSON.stringify({ success: false, message: `Mã ${codeId} đã bị xóa!` }), { status: 400, headers: corsHeaders });
                }

                if (target.assignedAccount && target.assignedAccount.toLowerCase() !== acc) {
                    return new Response(JSON.stringify({ 
                        success: false, 
                        message: `Mã ${codeId} đã được cấp cho tài khoản [${target.assignedAccount}]. Tài khoản [${acc}] không có quyền sử dụng mã này!` 
                    }), { status: 403, headers: corsHeaders });
                }

                return new Response(JSON.stringify({ success: true, code: target }), { headers: corsHeaders });
            }

            // 9. /api/admin/delete-code or /api/delete-code
            if ((path === '/api/admin/delete-code' || path === '/api/delete-code') && (request.method === 'POST' || request.method === 'DELETE' || request.method === 'GET')) {
                let codeId = url.searchParams.get('codeId');
                if (!codeId) {
                    const body = await request.json().catch(() => ({}));
                    codeId = body.codeId;
                }
                if (codeId) {
                    const idx = codes.findIndex(c => c.id === codeId);
                    if (idx !== -1) {
                        const removed = codes[idx];
                        codes.splice(idx, 1);
                        if (removed && removed.assignedAccount) {
                            pendingRequests = pendingRequests.filter(p => p.account.toLowerCase() !== removed.assignedAccount.toLowerCase());
                        }
                        await saveState();
                        return new Response(JSON.stringify({ success: true, message: 'Đã xóa mã thành công' }), { headers: corsHeaders });
                    }
                }
                return new Response(JSON.stringify({ success: false, message: 'Mã không tồn tại' }), { status: 404, headers: corsHeaders });
            }
        }

        // --- STATIC ASSETS ---
        return env.ASSETS.fetch(request);
    }
};
