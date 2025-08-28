// api 基础地址
const API_BASE = "http://localhost:3001/api";

// sha256 加密
function hashPassword(pwd) {
    return sha256(pwd);
}

// 登录
async function login(email, password) {
    const res = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: hashPassword(password) })
    });
    return res.json();
}

// 注册
async function register(email, password) {
    const res = await fetch(`${API_BASE}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: hashPassword(password) })
    });
    return res.json();
}

// 发帖
async function createPost(content) {
    const res = await fetch(`${API_BASE}/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
    });
    return res.json();
}

// 加载帖子
async function loadPosts() {
    const res = await fetch(`${API_BASE}/posts`);
    return res.json();
}
