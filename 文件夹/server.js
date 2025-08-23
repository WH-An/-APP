// server.js — 方案A（读取时覆盖作者信息）+ /api/users/by-email + 邮箱规范化 + ✅ 私信三接口 + ✅ 评论三接口 + ✅ 单帖读取
// 依赖：npm i express cors multer cookie-parser
// 启动：node server.js  （默认端口 3001）

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');

const app = express();

// ====== 配置 ======
const PORT = 3001;
const FRONTEND_ALLOWED = [
  'http://127.0.0.1:5500',
  'http://localhost:5500',
  'http://127.0.0.1:3000',
  'http://localhost:3000',
];
const DATA_FILE     = path.join(__dirname, 'users.json');
const UPLOADS_DIR   = path.join(__dirname, 'uploads');
const POSTS_FILE    = path.join(__dirname, 'posts.json');
const MESSAGES_FILE = path.join(__dirname, 'messages.json'); // ✅ 消息持久化文件
const COMMENTS_FILE = path.join(__dirname, 'comments.json'); // ✅ 评论持久化文件

// ====== 工具：邮箱规范化（小写 + 去空格 + 尝试解码 %40） ======
function normalizeEmail(v) {
  if (!v) return '';
  let s = String(v).trim();
  try { s = decodeURIComponent(s); } catch {}
  return s.toLowerCase();
}

// ====== CORS / 中间件 ======
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (FRONTEND_ALLOWED.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS: ' + origin));
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
}));
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    if (req.headers.origin) res.header('Access-Control-Allow-Origin', req.headers.origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    if (req.headers['access-control-request-headers']) {
      res.header('Access-Control-Allow-Headers', req.headers['access-control-request-headers']);
    }
    return res.sendStatus(204);
  }
  next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// 静态资源
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR));

// ====== JSON “数据库”工具 ======
function readUsers() {
  if (!fs.existsSync(DATA_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')); }
  catch { return []; }
}
function writeUsers(users) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2), 'utf-8');
}
function publicUser(u) {
  if (!u) return null;
  const { password, ...rest } = u;
  return rest;
}
function readPosts() {
  try { return JSON.parse(fs.readFileSync(POSTS_FILE, 'utf8')); }
  catch { return []; }
}
function writePosts(list) {
  fs.writeFileSync(POSTS_FILE, JSON.stringify(list, null, 2));
}
// ✅ 消息读写
function readMsgs() {
  try { return JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8') || '[]'); }
  catch { return []; }
}
function writeMsgs(arr) {
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify(arr, null, 2));
}
// ✅ 评论读写
function readComments(){
  try { return JSON.parse(fs.readFileSync(COMMENTS_FILE, 'utf8') || '[]'); }
  catch { return []; }
}
function writeComments(arr){
  fs.writeFileSync(COMMENTS_FILE, JSON.stringify(arr, null, 2));
}

// ====== 上传（头像/图片） ======
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOADS_DIR),
  filename:   (_, file, cb) => {
    const ext = (path.extname(file.originalname || '') || '.jpg').toLowerCase();
    cb(null, Date.now() + '-' + Math.random().toString(16).slice(2) + ext);
  }
});
const upload = multer({ storage });

// 健康检查
app.get('/__ping', (req, res) => res.json({ ok: true, ts: Date.now() }));

// ====== 用户：注册/登录/退出/我的资料/按邮箱查/上传头像 ======
app.post('/api/register', (req, res) => {
  let { nickname, email, password, area = '', degree = '' } = req.body || {};
  email = normalizeEmail(email);
  if (!email || !password) return res.status(400).json({ msg: '邮箱与密码必填' });

  const users = readUsers();
  if (users.some(u => normalizeEmail(u.email) === email)) {
    return res.status(409).json({ msg: '该邮箱已注册' });
  }
  const user = {
    id: Date.now(),
    nickname: nickname || (email.split('@')[0]),
    email,
    password,         // 示例环境明文；生产请用哈希
    area,
    degree,
    avatarPath: ''
  };
  users.push(user);
  writeUsers(users);
  res.json({ msg: '注册成功', user: publicUser(user) });
});

app.post('/api/login', (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password || '';
  const users = readUsers();
  const found = users.find(u => normalizeEmail(u.email) === email && u.password === password);
  if (!found) return res.status(401).json({ msg: '邮箱或密码错误' });

  // 保存规范化后的邮箱，避免 cookie 里出现 a%40123.com
  res.cookie('email', email, { httpOnly: false, sameSite: 'Lax' });
  res.json({ msg: '登录成功', user: publicUser(found) });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('email', { sameSite: 'Lax' });
  res.json({ msg: '已退出登录' });
});

app.get('/api/users/me', (req, res) => {
  const email = normalizeEmail(req.cookies.email);
  if (!email) return res.status(401).json({ msg: '未登录' });

  const users = readUsers();
  const found = users.find(u => normalizeEmail(u.email) === email);
  if (!found) return res.status(404).json({ msg: '用户不存在' });

  res.json(publicUser(found));
});

// ⭐ 通过邮箱查任意用户（用于他人主页）
app.get('/api/users/by-email', (req, res) => {
  const email = normalizeEmail(req.query.email);
  if (!email) return res.status(400).json({ msg: '缺少 email 参数' });

  const users = readUsers();
  const found = users.find(u => normalizeEmail(u.email) === email);
  if (!found) return res.status(404).json({ msg: '用户不存在' });

  res.json(publicUser(found));
});

// 当前用户上传头像
app.post('/api/users/me/avatar', upload.single('avatar'), (req, res) => {
  const email = normalizeEmail(req.cookies.email);
  if (!email) return res.status(401).json({ msg: '未登录' });
  if (!req.file) return res.status(400).json({ msg: '未选择文件' });

  const users = readUsers();
  const idx = users.findIndex(u => normalizeEmail(u.email) === email);
  if (idx === -1) return res.status(404).json({ msg: '用户不存在' });

  const relPath = '/uploads/' + req.file.filename;
  users[idx].avatarPath = relPath;
  writeUsers(users);
  res.json({ msg: '头像已更新', avatarPath: relPath });
});

// ====== 帖子：列表 & 发布（方案A） ======

// ✅ 关键改动：读取帖子时始终以“用户表”为准覆盖作者资料
// GET /api/posts?category=life|study|enroll|share|fun
app.get('/api/posts', (req, res) => {
  const list = readPosts();
  const cat = (req.query.category || '').trim();

  const users = readUsers();
  const userMap = Object.fromEntries(users.map(u => [normalizeEmail(u.email), u]));

  const enriched = list.map(p => {
    const e = normalizeEmail(p.authorEmail);
    if (e && userMap[e]) {
      const u = userMap[e];
      return {
        ...p,
        authorName:   u.nickname || u.email,   // 始终覆盖为最新昵称
        authorAvatar: u.avatarPath || '',      // 始终覆盖为最新头像
      };
    }
    return p; // 没有 authorEmail 的老帖保持原样
  });

  const filtered = cat ? enriched.filter(p => (p.category || '') === cat) : enriched;
  res.json(filtered);
});
console.log('[WIRE] GET /api/posts wired');

// ✅ 单帖读取（同样覆盖作者资料）
app.get('/api/posts/:id', (req, res) => {
  const id = String(req.params.id || '');
  const list = readPosts();
  const post = list.find(p => String(p.id) === id);
  if (!post) return res.status(404).json({ msg: '帖子不存在' });

  const users = readUsers();
  const userMap = Object.fromEntries(users.map(u => [normalizeEmail(u.email), u]));
  const e = normalizeEmail(post.authorEmail);
  let out = { ...post };
  if (e && userMap[e]) {
    const u = userMap[e];
    out.authorName   = u.nickname || u.email;
    out.authorAvatar = u.avatarPath || '';
  }
  res.json(out);
});
console.log('[WIRE] GET /api/posts/:id wired');

app.post('/api/posts', upload.array('images', 9), (req, res) => {
  const title = (req.body?.title || '');
  const desc = (req.body?.desc || '');
  const category = (req.body?.category || 'life');
  const files = (req.files || []).map(f => '/uploads/' + path.basename(f.path));

  // 作者：以 cookie 登录用户为权威
  let authorEmail  = normalizeEmail(req.cookies.email);
  let authorName   = '';
  let authorAvatar = '';

  if (authorEmail) {
    const users = readUsers();
    const found = users.find(u => normalizeEmail(u.email) === authorEmail);
    if (found) {
      authorName   = found.nickname || found.email;
      authorAvatar = found.avatarPath || '';
    }
  }

  // 兜底：未登录但前端传了字段
  if (!authorEmail && req.body.authorEmail)   authorEmail  = normalizeEmail(req.body.authorEmail);
  if (!authorName && req.body.authorName)     authorName   = String(req.body.authorName).trim();
  if (!authorAvatar && req.body.authorAvatar) authorAvatar = String(req.body.authorAvatar).trim();

  const post = {
    id: Date.now().toString(36),
    createdAt: new Date().toISOString(),
    title, desc, category,
    images: files,
    authorEmail, authorName, authorAvatar,
  };

  const list = readPosts();
  list.unshift(post); // 最新在前
  writePosts(list);
  res.json(post);
});
console.log('[WIRE] POST /api/posts wired');

// ====== ✅ 评论：列表 / 发布 / 删除 ======

// Utils: 便捷获取帖子与用户
function findPostById(id){
  const list = readPosts();
  return list.find(p => String(p.id) === String(id)) || null;
}
function findUserByEmail(email){
  const e = normalizeEmail(email);
  const users = readUsers();
  return users.find(u => normalizeEmail(u.email) === e) || null;
}

// GET /api/posts/:id/comments?offset=0&limit=10
app.get('/api/posts/:id/comments', (req, res) => {
  const postId = String(req.params.id || '');
  const offset = parseInt(req.query.offset) || 0;
  const limit  = parseInt(req.query.limit)  || 10;

  const all = readComments().filter(c => String(c.postId) === postId);
  const total = all.length;

  const items = all
    .sort((a,b)=> new Date(b.createdAt) - new Date(a.createdAt)) // 新的在前
    .slice(offset, offset + limit)
    .map(c => {
      const u = findUserByEmail(c.userEmail) || {};
      return {
        ...c,
        user: {
          name:   u.nickname || u.username || u.email || c.userName || '用户',
          avatar: u.avatarPath || c.userAvatar || '',
          email:  u.email || c.userEmail || ''
        }
      };
    });

  res.json({ items, total });
});
console.log('[WIRE] GET /api/posts/:id/comments wired');

// POST /api/posts/:id/comments  body: { content }
app.post('/api/posts/:id/comments', (req, res) => {
  const me = normalizeEmail(req.cookies.email);
  if (!me) return res.status(401).json({ msg: '未登录' });

  const postId  = String(req.params.id || '');
  const post    = findPostById(postId);
  if (!post) return res.status(404).json({ msg: '帖子不存在' });

  const content = String(req.body?.content || '').trim();
  if (!content) return res.status(400).json({ msg: '内容不能为空' });

  const u = findUserByEmail(me) || {};
  const now = new Date().toISOString();
  const cmt = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2),
    postId,
    userEmail: me, // 用邮箱标识评论作者
    content,
    createdAt: now
  };

  const all = readComments();
  all.unshift(cmt); // 新的在前
  writeComments(all);

  res.json({
    ...cmt,
    user: {
      name:   u.nickname || u.username || u.email || '我',
      avatar: u.avatarPath || '',
      email:  u.email || me
    }
  });
});
console.log('[WIRE] POST /api/posts/:id/comments wired');

// DELETE /api/posts/:id/comments/:cid
// 允许：① 评论作者本人；② 帖子作者（post.authorEmail）
app.delete('/api/posts/:id/comments/:cid', (req, res) => {
  const me = normalizeEmail(req.cookies.email);
  if (!me) return res.status(401).json({ msg: '未登录' });

  const postId = String(req.params.id || '');
  const cid    = String(req.params.cid || '');
  const post   = findPostById(postId);
  if (!post) return res.status(404).json({ msg: '帖子不存在' });

  const all = readComments();
  const idx = all.findIndex(x => String(x.id) === cid && String(x.postId) === postId);
  if (idx === -1) return res.status(404).json({ msg: '评论不存在' });

  const c = all[idx];
  const isCommentOwner = normalizeEmail(c.userEmail) === me;
  const isPostAuthor   = normalizeEmail(post.authorEmail) === me;

  if (!isCommentOwner && !isPostAuthor) {
    return res.status(403).json({ msg: '无权删除' });
  }

  all.splice(idx, 1);
  writeComments(all);
  res.json({ msg: '已删除' });
});
console.log('[WIRE] DELETE /api/posts/:id/comments/:cid wired');

// ====== ✅ 私信：会话、消息列表、发送 ======

// 拉取与某人的消息（按时间升序）
// GET /api/messages?peer=<email>
app.get('/api/messages', (req, res) => {
  const me = normalizeEmail(req.cookies.email);
  const peer = normalizeEmail(req.query.peer);
  if (!me)   return res.status(401).json({ error: 'NOT_LOGIN' });
  if (!peer) return res.status(400).json({ error: 'PEER_REQUIRED' });

  const list = readMsgs()
    .filter(m => (normalizeEmail(m.from) === me && normalizeEmail(m.to) === peer)
              || (normalizeEmail(m.from) === peer && normalizeEmail(m.to) === me))
    .sort((a,b)=> new Date(a.time) - new Date(b.time));

  res.json(list);
});
console.log('[WIRE] GET /api/messages wired');

// 发送一条消息（支持文字 + 多图）
app.post('/api/messages', upload.array('images', 9), (req, res) => {
  const me = normalizeEmail(req.cookies.email);
  if (!me) return res.status(401).json({ error: 'NOT_LOGIN' });

  const toEmail = normalizeEmail(req.body?.toEmail);
  const textRaw = String(req.body?.text ?? '');
  const text    = textRaw.trim();
  const images  = (req.files || []).map(f => '/uploads/' + path.basename(f.path));

  console.log('[POST /api/messages] from=%s to=%s textLen=%d files=%d',
    me, toEmail, text.length, images.length);

  if (!toEmail || (!text && images.length === 0)) {
    return res.status(400).json({
      error: 'BAD_REQUEST',
      reason: !toEmail ? 'toEmail missing' : 'empty text & no images',
      got: { toEmail, textLen: text.length, images: images.length }
    });
  }

  const msg = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2),
    from: me,
    to: toEmail,
    text,
    images,                      // 可能为空数组
    time: new Date().toISOString()
  };

  const all = readMsgs();
  all.push(msg);
  writeMsgs(all);

  res.json(msg);
});
console.log('[WIRE] POST /api/messages wired');

// 会话列表（每个对端一条，取最后一条，按时间倒序）
// GET /api/messages/threads  -> [{ peer, last, time }]
app.get('/api/messages/threads', (req, res) => {
  const me = normalizeEmail(req.cookies.email);
  if (!me) return res.status(401).json({ error: 'NOT_LOGIN' });

  const mine = readMsgs().filter(m => normalizeEmail(m.from) === me || normalizeEmail(m.to) === me);
  const map = new Map();

  for (const m of mine) {
    const peer = (normalizeEmail(m.from) === me) ? normalizeEmail(m.to) : normalizeEmail(m.from);
    const keep = map.get(peer);
    if (!keep || new Date(keep.time) < new Date(m.time)) {
      map.set(peer, { peer, last: m.text, time: m.time });
    }
  }
  const out = Array.from(map.values()).sort((a,b) => new Date(b.time) - new Date(a.time));
  res.json(out);
});
console.log('[WIRE] GET /api/messages/threads wired');

// 临时调试：列出所有已注册的路由
app.get('/__routes', (req, res) => {
  const out = [];
  const stack = app._router?.stack || [];
  for (const layer of stack) {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).map(m => m.toUpperCase()).join(',');
      out.push(`${methods.padEnd(6)} ${layer.route.path}`);
    } else if (layer.name === 'router' && layer.handle?.stack) {
      for (const s of layer.handle.stack) {
        if (s.route) {
          const methods = Object.keys(s.route.methods).map(m => m.toUpperCase()).join(',');
          out.push(`${methods.padEnd(6)} ${s.route.path}`);
        }
      }
    }
  }
  res.type('text/plain').send(out.sort().join('\n'));
});

// ====== 启动 ======
app.listen(PORT, () => {
  console.log(`✅ API running at:`);
  console.log(` - http://127.0.0.1:${PORT}`);
  console.log(` - http://localhost:${PORT}`);
  console.log(`CORS allowed origins:\n - ${FRONTEND_ALLOWED.join('\n - ')}`);
});
