const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3005;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'codes.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Load or seed code database
function loadCodes() {
    if (fs.existsSync(DATA_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        } catch (e) {
            console.error("Error reading codes.json, reinitializing:", e);
        }
    }
    
    // Seed initial codes from danh_sach_1000_ma.txt if present
    let initialCodes = [];
    const textPath = path.join(__dirname, 'danh_sach_1000_ma.txt');
    if (fs.existsSync(textPath)) {
        const content = fs.readFileSync(textPath, 'utf8');
        const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        initialCodes = lines.map(c => ({
            id: c,
            assignedAccount: null,
            status: 'available', // 'available' | 'assigned' | 'used'
            createdAt: new Date().toISOString(),
            assignedAt: null,
            usedAt: null
        }));
    } else {
        // Fallback default sample codes
        for (let i = 1; i <= 50; i++) {
            const code = 'VIP' + Math.random().toString(36).substring(2, 7).toUpperCase();
            initialCodes.push({
                id: code,
                assignedAccount: null,
                status: 'available',
                createdAt: new Date().toISOString(),
                assignedAt: null,
                usedAt: null
            });
        }
    }
    
    saveCodes(initialCodes);
    return initialCodes;
}

function saveCodes(codes) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(codes, null, 2), 'utf8');
}

let codesDB = loadCodes();

// --- ADMIN AUTH ---
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === 'admin123') {
        return res.json({ success: true, token: 'admin-auth-token-xoamaan-2026', message: 'Đăng nhập thành công' });
    }
    return res.status(401).json({ success: false, message: 'Tên đăng nhập hoặc mật khẩu không chính xác' });
});

// --- ADMIN STATS ---
app.get('/api/admin/stats', (req, res) => {
    const total = codesDB.length;
    const available = codesDB.filter(c => c.status === 'available').length;
    const assigned = codesDB.filter(c => c.status === 'assigned').length;
    const used = codesDB.filter(c => c.status === 'used').length;
    res.json({ success: true, stats: { total, available, assigned, used } });
});

// --- ADMIN GET CODES ---
app.get('/api/admin/codes', (req, res) => {
    const { status, query, page = 1, limit = 100 } = req.query;
    let list = [...codesDB];
    
    if (status && status !== 'all') {
        list = list.filter(c => c.status === status);
    }
    
    if (query) {
        const q = query.toLowerCase().trim();
        list = list.filter(c => 
            c.id.toLowerCase().includes(q) || 
            (c.assignedAccount && c.assignedAccount.toLowerCase().includes(q))
        );
    }
    
    // Sort so assigned/used accounts appear FIRST at top of table, ordered by newest assignedAt/usedAt DESC
    list.sort((a, b) => {
        const hasAccA = a.assignedAccount ? 1 : 0;
        const hasAccB = b.assignedAccount ? 1 : 0;
        if (hasAccA !== hasAccB) return hasAccB - hasAccA; // Assigned accounts at top!
        
        const timeA = new Date(a.usedAt || a.assignedAt || a.createdAt || 0).getTime();
        const timeB = new Date(b.usedAt || b.assignedAt || b.createdAt || 0).getTime();
        return timeB - timeA;
    });
    
    const total = list.length;
    const p = parseInt(page);
    const l = parseInt(limit);
    const paginated = list.slice((p - 1) * l, p * l);
    
    res.json({ success: true, total, page: p, limit: l, codes: paginated });
});

// --- ADMIN BULK GENERATE CODES ---
app.post('/api/admin/generate', (req, res) => {
    const { count = 100, prefix = '' } = req.body;
    const num = Math.min(Math.max(parseInt(count) || 10, 1), 2000);
    
    const existing = new Set(codesDB.map(c => c.id));
    const newCodes = [];
    let added = 0;
    
    while (added < num) {
        const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
        const fullCode = (prefix ? prefix.toUpperCase() : '') + randomPart;
        if (!existing.has(fullCode)) {
            existing.add(fullCode);
            const obj = {
                id: fullCode,
                assignedAccount: null,
                status: 'available',
                createdAt: new Date().toISOString(),
                assignedAt: null,
                usedAt: null
            };
            newCodes.push(obj);
            codesDB.push(obj);
            added++;
        }
    }
    
    saveCodes(codesDB);
    res.json({ success: true, count: added, message: `Đã khởi tạo thành công ${added} mã mới!` });
});

// --- ADMIN ASSIGN CODE TO ACCOUNT ---
app.post('/api/admin/assign', (req, res) => {
    const { account, codeId } = req.body;
    if (!account || !account.trim()) {
        return res.status(400).json({ success: false, message: 'Tên tài khoản không được để trống' });
    }
    
    const acc = account.trim();
    
    // Check if account already assigned
    let existingRecord = codesDB.find(c => c.assignedAccount && c.assignedAccount.toLowerCase() === acc.toLowerCase());
    if (existingRecord) {
        return res.json({ 
            success: true, 
            alreadyAssigned: true,
            code: existingRecord,
            message: `Tài khoản ${acc} đã được cấp mã [${existingRecord.id}] trước đó.`
        });
    }
    
    let targetCode = null;
    if (codeId) {
        targetCode = codesDB.find(c => c.id === codeId);
    } else {
        targetCode = codesDB.find(c => c.status === 'available' && !c.assignedAccount);
    }
    
    if (!targetCode) {
        return res.status(400).json({ success: false, message: 'Hệ thống đã hết mã khả dụng. Vui lòng tạo thêm mã mới!' });
    }
    
    targetCode.assignedAccount = acc;
    targetCode.status = 'assigned';
    targetCode.assignedAt = new Date().toISOString();
    
    saveCodes(codesDB);
    res.json({ success: true, code: targetCode, message: `Đã cấp mã [${targetCode.id}] cho tài khoản ${acc} thành công!` });
});

app.post('/api/admin/update-type', (req, res) => {
    const { codeId, accountType } = req.body;
    if (!codeId) return res.status(400).json({ success: false, message: 'Mã không hợp lệ' });
    const target = codesDB.find(c => c.id.toUpperCase() === codeId.trim().toUpperCase());
    if (target) {
        target.accountType = accountType || 'clean';
        saveCodes(codesDB);
        return res.json({ success: true, code: target });
    }
    res.status(404).json({ success: false, message: 'Mã không tồn tại' });
});

app.get('/api/config', (req, res) => {
    const prefixes = ['113.161', '14.225', '27.72', '116.108', '42.113', '171.244'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const clientIp = `${prefix}.${Math.floor(Math.random() * 240 + 10)}.${Math.floor(Math.random() * 240 + 10)}`;
    res.json({ success: true, removeCode: 'ok', ip: clientIp });
});

app.get('/api/banners', (req, res) => {
    res.json([]);
});

// --- USER REQUEST CODE (TRANSMIT ACCOUNT TO ADMIN PENDING LIST) ---
app.post('/api/request-code', (req, res) => {
    const { account } = req.body;
    if (!account || typeof account !== 'string' || account.trim().length < 4) {
        return res.status(400).json({ success: false, message: 'Tài khoản phải chứa ít nhất 4 ký tự' });
    }
    
    const acc = account.trim();
    
    // If account already has a code assigned by Admin
    let existingCode = codesDB.find(c => c.assignedAccount && c.assignedAccount.toLowerCase() === acc.toLowerCase());
    if (existingCode) {
        return res.json({ success: true, status: 'assigned', code: existingCode, message: 'Tài khoản đã được Admin cấp mã.' });
    }

    // Put in pending list waiting for Admin approval
    let existingPending = pendingRequestsDB.find(p => p.account.toLowerCase() === acc.toLowerCase());
    if (!existingPending) {
        pendingRequestsDB.unshift({ account: acc, requestedAt: new Date().toISOString() });
        if (pendingRequestsDB.length > 100) pendingRequestsDB.pop();
    }
    
    res.json({ success: true, status: 'pending', message: 'Đã gửi tài khoản tới Admin. Đang chờ Admin cấp mã!' });
});

// --- CHECK CLIENT APPROVAL STATUS ---
app.get('/api/check-status', (req, res) => {
    const acc = (req.query.account || '').trim();
    if (!acc) return res.status(400).json({ success: false, message: 'Thiếu tài khoản' });

    let existingCode = codesDB.find(c => c.assignedAccount && c.assignedAccount.toLowerCase() === acc.toLowerCase());
    if (existingCode) {
        return res.json({ success: true, status: 'assigned', code: existingCode });
    }
    return res.json({ success: true, status: 'pending' });
});

// --- ADMIN GET PENDING REQUESTS ---
app.get('/api/admin/pending', (req, res) => {
    res.json({ success: true, pending: pendingRequestsDB });
});

// --- ADMIN DISMISS PENDING REQUEST AND DELETE ASSIGNED CODE ---
app.post('/api/admin/dismiss-pending', (req, res) => {
    const { account } = req.body;
    if (account) {
        const accLower = account.trim().toLowerCase();
        pendingRequestsDB = pendingRequestsDB.filter(p => p.account.toLowerCase() !== accLower);
        codesDB = codesDB.filter(c => !c.assignedAccount || c.assignedAccount.toLowerCase() !== accLower);
        saveCodes(codesDB);
    }
    res.json({ success: true, message: 'Đã xóa tài khoản và mã giftcode liên quan' });
});

// --- USER CLAIM CODE BY ACCOUNT ---
app.post('/api/claim-code', (req, res) => {
    const { account } = req.body;
    if (!account || typeof account !== 'string' || account.trim().length < 4) {
        return res.status(400).json({ success: false, message: 'Vui lòng nhập tên tài khoản từ 4 ký tự trở lên' });
    }
    
    const acc = account.trim();
    
    // If account already has a code
    let existing = codesDB.find(c => c.assignedAccount && c.assignedAccount.toLowerCase() === acc.toLowerCase());
    if (existing) {
        return res.json({ success: true, code: existing, message: 'Tài khoản của bạn đã được nhận mã độc quyền.' });
    }
    
    // Assign available code
    let available = codesDB.find(c => c.status === 'available');
    if (!available) {
        return res.status(400).json({ success: false, message: 'Kho mã tạm thời hết. Vui lòng liên hệ Admin để nhận mã!' });
    }
    
    available.assignedAccount = acc;
    available.status = 'assigned';
    available.assignedAt = new Date().toISOString();
    
    saveCodes(codesDB);
    res.json({ success: true, code: available, message: 'Cấp mã thành công cho tài khoản.' });
});

app.post('/api/use-code', (req, res) => {
    const { codeId } = req.body;
    const target = codesDB.find(c => c.id === codeId);
    if (!target) {
        return res.status(404).json({ success: false, message: 'Mã không tồn tại' });
    }
    
    target.status = 'used';
    target.usedAt = new Date().toISOString();
    saveCodes(codesDB);
    res.json({ success: true, code: target, message: 'Đã kích hoạt và sử dụng mã thành công.' });
});

// --- VERIFY CODE OWNERSHIP AND USAGE STATUS ---
app.post('/api/verify-code', (req, res) => {
    const { account, codeId } = req.body;
    if (!codeId) return res.status(400).json({ success: false, message: 'Thiếu mã giftcode' });
    
    const acc = (account || '').trim().toLowerCase();
    const target = codesDB.find(c => c.id.toUpperCase() === codeId.trim().toUpperCase());

    if (!target) {
        return res.status(404).json({ success: false, message: `Mã ${codeId} không tồn tại!` });
    }

    if (target.status === 'used') {
        return res.status(400).json({ success: false, message: `Mã ${codeId} đã được sử dụng trước đó!` });
    }

    if (target.status === 'deleted') {
        return res.status(400).json({ success: false, message: `Mã ${codeId} đã bị xóa khỏi hệ thống!` });
    }

    if (target.assignedAccount && target.assignedAccount.toLowerCase() !== acc) {
        return res.status(403).json({ 
            success: false, 
            message: `Mã ${codeId} đã được cấp cho tài khoản [${target.assignedAccount}]. Tài khoản [${acc}] không có quyền sử dụng mã này!` 
        });
    }

    res.json({ success: true, code: target, message: 'Mã hợp lệ' });
});

// --- ADMIN DELETE CODE ---
app.post('/api/admin/delete-code', (req, res) => {
    const { codeId } = req.body;
    const idx = codesDB.findIndex(c => c.id === codeId);
    if (idx !== -1) {
        codesDB.splice(idx, 1);
        saveCodes(codesDB);
        return res.json({ success: true, message: `Đã xóa mã ${codeId}` });
    }
    res.status(404).json({ success: false, message: 'Mã không tồn tại' });
});

app.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(`   XOAMAAN CODE MANAGEMENT SYSTEM IS RUNNING        `);
    console.log(`   URL: http://localhost:${PORT}                    `);
    console.log(`   Admin Login: http://localhost:${PORT}/admin.html `);
    console.log(`===================================================`);
});
