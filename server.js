require("dotenv").config();

const express      = require("express");
const session      = require("express-session");
const SQLiteStore  = require("connect-sqlite3")(session);
const Database     = require("better-sqlite3");
const bcrypt       = require("bcryptjs");
const { Server }   = require("socket.io");
const http         = require("http");
const { v4: uuid } = require("uuid");
const path         = require("path");
const fs           = require("fs");
const multer       = require("multer");

const PORT        = process.env.PORT        || 3000;
const APP_URL     = process.env.APP_URL     || `http://localhost:${PORT}`;
const SESSION_SEC = process.env.SESSION_SECRET || "changeme";
const TURN_USER   = process.env.TURN_USERNAME   || "openrelayproject";
const TURN_CRED   = process.env.TURN_CREDENTIAL || "openrelayproject";

const UPLOAD_DIR = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    cb(null, uuid() + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Sadece resim dosyaları"));
  }
});

const db = new Database("chatapp.db");
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id           TEXT PRIMARY KEY,
    email        TEXT UNIQUE NOT NULL,
    password     TEXT NOT NULL,
    display_name TEXT NOT NULL,
    phone_number TEXT UNIQUE,
    bio          TEXT DEFAULT '',
    avatar_color TEXT DEFAULT '#6d28d9',
    avatar_emoji TEXT DEFAULT '😊',
    avatar_url   TEXT DEFAULT NULL,
    created_at   INTEGER
  );
  CREATE TABLE IF NOT EXISTS friendships (
    id           TEXT PRIMARY KEY,
    requester_id TEXT NOT NULL,
    addressee_id TEXT NOT NULL,
    status       TEXT DEFAULT 'pending',
    created_at   INTEGER,
    UNIQUE(requester_id, addressee_id)
  );
  CREATE TABLE IF NOT EXISTS messages (
    id        TEXT PRIMARY KEY,
    from_id   TEXT NOT NULL,
    to_id     TEXT NOT NULL,
    group_id  TEXT DEFAULT NULL,
    text      TEXT NOT NULL,
    type      TEXT DEFAULT 'text',
    time      INTEGER NOT NULL,
    read      INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS groups (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    description  TEXT DEFAULT '',
    avatar_color TEXT DEFAULT '#6d28d9',
    avatar_emoji TEXT DEFAULT '👥',
    avatar_url   TEXT DEFAULT NULL,
    owner_id     TEXT NOT NULL,
    created_at   INTEGER
  );
  CREATE TABLE IF NOT EXISTS group_members (
    group_id   TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    role       TEXT DEFAULT 'member',
    joined_at  INTEGER,
    PRIMARY KEY(group_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_msg    ON messages(from_id, to_id);
  CREATE INDEX IF NOT EXISTS idx_gmsg   ON messages(group_id);
  CREATE INDEX IF NOT EXISTS idx_fs1    ON friendships(requester_id);
  CREATE INDEX IF NOT EXISTS idx_fs2    ON friendships(addressee_id);
  CREATE INDEX IF NOT EXISTS idx_gm     ON group_members(user_id);
`);

try { db.exec("ALTER TABLE users ADD COLUMN avatar_url TEXT DEFAULT NULL"); } catch(e){}
try { db.exec("ALTER TABLE messages ADD COLUMN group_id TEXT DEFAULT NULL"); } catch(e){}
try { db.exec("ALTER TABLE messages ADD COLUMN type TEXT DEFAULT 'text'"); } catch(e){}

function genPhone() {
  while (true) {
    const n = "5" + Math.floor(Math.random() * 1_000_000_000).toString().padStart(9, "0");
    if (!db.prepare("SELECT id FROM users WHERE phone_number=?").get(n)) return n;
  }
}
function randomColor() {
  const c = ["#6d28d9","#0891b2","#059669","#d97706","#dc2626","#7c3aed","#0284c7","#16a34a","#9333ea","#e11d48"];
  return c[Math.floor(Math.random() * c.length)];
}
function safeUser(u) {
  if (!u) return null;
  const { password, ...rest } = u;
  return rest;
}
function getFriends(userId) {
  return db.prepare(`
    SELECT u.id, u.display_name, u.phone_number, u.avatar_color, u.avatar_emoji, u.avatar_url, u.bio,
           f.status, f.requester_id
    FROM friendships f
    JOIN users u ON (
      CASE WHEN f.requester_id=? THEN f.addressee_id ELSE f.requester_id END = u.id
    )
    WHERE (f.requester_id=? OR f.addressee_id=?) AND f.status IN ('accepted','pending')
  `).all(userId, userId, userId);
}
function getUserGroups(userId) {
  return db.prepare(`
    SELECT g.*, gm.role
    FROM groups g
    JOIN group_members gm ON g.id=gm.group_id
    WHERE gm.user_id=?
    ORDER BY g.created_at DESC
  `).all(userId);
}

const app    = express();
const server = http.createServer(app);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

const sessionMW = session({
  store:             new SQLiteStore({ db: "sessions.db", table: "sessions" }),
  secret:            SESSION_SEC,
  resave:            false,
  saveUninitialized: false,
  cookie:            { maxAge: 30 * 24 * 3600 * 1000 },
});
app.use(sessionMW);

function requireAuth(req, res, next) {
  if (req.session.userId) return next();
  res.status(401).json({ error: "Giriş gerekli" });
}

app.post("/api/register", async (req, res) => {
  const { email, password, display_name } = req.body;
  if (!email || !password || !display_name)
    return res.status(400).json({ error: "Tüm alanlar zorunlu." });
  if (password.length < 6)
    return res.status(400).json({ error: "Şifre en az 6 karakter olmalı." });
  if (db.prepare("SELECT id FROM users WHERE email=?").get(email.trim().toLowerCase()))
    return res.status(409).json({ error: "Bu e-posta zaten kayıtlı." });

  const hash = await bcrypt.hash(password, 10);
  const user = {
    id: uuid(), email: email.trim().toLowerCase(),
    password: hash, display_name: display_name.trim().slice(0,32),
    phone_number: genPhone(), bio: "",
    avatar_color: randomColor(), avatar_emoji: "😊", avatar_url: null,
    created_at: Date.now(),
  };
  db.prepare(`INSERT INTO users VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    user.id, user.email, user.password, user.display_name,
    user.phone_number, user.bio, user.avatar_color, user.avatar_emoji, user.avatar_url, user.created_at
  );
  req.session.userId = user.id;
  res.json({ ok: true, user: safeUser(user) });
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "E-posta ve şifre gerekli." });
  const user = db.prepare("SELECT * FROM users WHERE email=?").get(email.trim().toLowerCase());
  if (!user) return res.status(401).json({ error: "E-posta veya şifre hatalı." });
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: "E-posta veya şifre hatalı." });
  req.session.userId = user.id;
  res.json({ ok: true, user: safeUser(user) });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/me", requireAuth, (req, res) => {
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(req.session.userId);
  res.json(safeUser(u));
});

app.put("/api/me", requireAuth, (req, res) => {
  const { display_name, bio, avatar_color, avatar_emoji } = req.body;
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(req.session.userId);
  db.prepare(`UPDATE users SET display_name=?,bio=?,avatar_color=?,avatar_emoji=? WHERE id=?`).run(
    (display_name||u.display_name).trim().slice(0,32),
    (bio||"").slice(0,120),
    avatar_color || u.avatar_color,
    avatar_emoji || u.avatar_emoji,
    u.id
  );
  res.json(safeUser(db.prepare("SELECT * FROM users WHERE id=?").get(u.id)));
});

app.post("/api/me/avatar", requireAuth, upload.single("avatar"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Dosya yüklenemedi." });
  const avatarUrl = "/uploads/" + req.file.filename;
  const u = db.prepare("SELECT avatar_url FROM users WHERE id=?").get(req.session.userId);
  if (u.avatar_url) {
    const oldPath = path.join(__dirname, "public", u.avatar_url);
    if (fs.existsSync(oldPath)) fs.unlink(oldPath, ()=>{});
  }
  db.prepare("UPDATE users SET avatar_url=? WHERE id=?").run(avatarUrl, req.session.userId);
  res.json({ ok: true, avatar_url: avatarUrl });
});

app.get("/api/ice-servers", requireAuth, (req, res) => {
  res.json([
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    {
      urls: ["turn:openrelay.metered.ca:80","turn:openrelay.metered.ca:443","turn:openrelay.metered.ca:443?transport=tcp"],
      username: TURN_USER, credential: TURN_CRED,
    },
  ]);
});

app.get("/api/users/search", requireAuth, (req, res) => {
  const phone = (req.query.phone || "").replace(/\D/g,"");
  if (phone.length < 4) return res.json({ user: null });
  const u = db.prepare(
    "SELECT id,display_name,phone_number,avatar_color,avatar_emoji,avatar_url,bio FROM users WHERE phone_number=? AND id!=?"
  ).get(phone, req.session.userId);
  res.json({ user: u || null });
});

app.post("/api/friends/request", requireAuth, (req, res) => {
  const { addressee_id } = req.body;
  if (!addressee_id || addressee_id === req.session.userId)
    return res.status(400).json({ error: "Geçersiz kullanıcı." });
  const ex = db.prepare(`SELECT * FROM friendships WHERE
    (requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)
  `).get(req.session.userId, addressee_id, addressee_id, req.session.userId);
  if (ex) return res.status(409).json({ error: "Zaten arkadaşsınız veya istek gönderildi." });
  db.prepare("INSERT INTO friendships VALUES (?,?,?,?,?)").run(
    uuid(), req.session.userId, addressee_id, "pending", Date.now()
  );
  res.json({ ok: true });
});

app.post("/api/friends/accept", requireAuth, (req, res) => {
  const r = db.prepare(`UPDATE friendships SET status='accepted'
    WHERE requester_id=? AND addressee_id=? AND status='pending'`
  ).run(req.body.requester_id, req.session.userId);
  if (r.changes === 0) return res.status(404).json({ error: "İstek bulunamadı." });
  res.json({ ok: true });
});

app.delete("/api/friends/:fid", requireAuth, (req, res) => {
  db.prepare(`DELETE FROM friendships WHERE
    (requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)`
  ).run(req.session.userId, req.params.fid, req.params.fid, req.session.userId);
  res.json({ ok: true });
});

app.get("/api/friends", requireAuth, (req, res) => {
  res.json(getFriends(req.session.userId));
});

app.get("/api/messages/:otherId", requireAuth, (req, res) => {
  const uid = req.session.userId, oid = req.params.otherId;
  const msgs = db.prepare(`SELECT * FROM messages
    WHERE group_id IS NULL AND ((from_id=? AND to_id=?) OR (from_id=? AND to_id=?))
    ORDER BY time ASC LIMIT 300`).all(uid, oid, oid, uid);
  db.prepare("UPDATE messages SET read=1 WHERE from_id=? AND to_id=? AND group_id IS NULL").run(oid, uid);
  res.json(msgs);
});

app.get("/api/groups", requireAuth, (req, res) => {
  res.json(getUserGroups(req.session.userId));
});

app.post("/api/groups", requireAuth, (req, res) => {
  const { name, description, member_ids } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "Grup adı gerekli." });
  const gid = uuid();
  db.prepare("INSERT INTO groups VALUES (?,?,?,?,?,?,?,?)").run(
    gid, name.trim().slice(0,50), (description||"").slice(0,120),
    randomColor(), "👥", null, req.session.userId, Date.now()
  );
  db.prepare("INSERT INTO group_members VALUES (?,?,?,?)").run(gid, req.session.userId, "admin", Date.now());
  if (Array.isArray(member_ids)) {
    member_ids.forEach(mid => {
      if (mid !== req.session.userId) {
        db.prepare("INSERT OR IGNORE INTO group_members VALUES (?,?,?,?)").run(gid, mid, "member", Date.now());
      }
    });
  }
  const group = db.prepare("SELECT * FROM groups WHERE id=?").get(gid);
  res.json({ ok: true, group });
});

app.get("/api/groups/:gid", requireAuth, (req, res) => {
  const mem = db.prepare("SELECT * FROM group_members WHERE group_id=? AND user_id=?").get(req.params.gid, req.session.userId);
  if (!mem) return res.status(403).json({ error: "Erişim yok." });
  const group = db.prepare("SELECT * FROM groups WHERE id=?").get(req.params.gid);
  const members = db.prepare(`
    SELECT u.id, u.display_name, u.avatar_color, u.avatar_emoji, u.avatar_url, gm.role
    FROM group_members gm JOIN users u ON gm.user_id=u.id
    WHERE gm.group_id=?
  `).all(req.params.gid);
  res.json({ group, members });
});

app.get("/api/groups/:gid/messages", requireAuth, (req, res) => {
  const mem = db.prepare("SELECT * FROM group_members WHERE group_id=? AND user_id=?").get(req.params.gid, req.session.userId);
  if (!mem) return res.status(403).json({ error: "Erişim yok." });
  const msgs = db.prepare("SELECT * FROM messages WHERE group_id=? ORDER BY time ASC LIMIT 300").all(req.params.gid);
  res.json(msgs);
});

app.delete("/api/groups/:gid", requireAuth, (req, res) => {
  const g = db.prepare("SELECT * FROM groups WHERE id=? AND owner_id=?").get(req.params.gid, req.session.userId);
  if (!g) return res.status(403).json({ error: "Yetkisiz." });
  db.prepare("DELETE FROM group_members WHERE group_id=?").run(req.params.gid);
  db.prepare("DELETE FROM messages WHERE group_id=?").run(req.params.gid);
  db.prepare("DELETE FROM groups WHERE id=?").run(req.params.gid);
  res.json({ ok: true });
});

app.get("/", (req, res) => {
  if (!req.session.userId) return res.redirect("/login");
  res.sendFile(path.join(__dirname, "public", "app.html"));
});
app.get("/login", (req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));

const io = new Server(server, { transports: ["websocket","polling"] });
io.use((socket, next) => sessionMW(socket.request, {}, next));

const online = new Map();
const calls  = new Map();

io.on("connection", (socket) => {
  const userId = socket.request.session?.userId;
  if (!userId) { socket.disconnect(true); return; }

  const user = db.prepare("SELECT * FROM users WHERE id=?").get(userId);
  if (!user) { socket.disconnect(true); return; }

  online.set(userId, socket.id);
  const userGroups = getUserGroups(userId);
  userGroups.forEach(g => socket.join("group:" + g.id));
  emitToFriends(userId, "friend_online", { id: userId });

  socket.on("disconnect", () => {
    online.delete(userId);
    emitToFriends(userId, "friend_offline", { id: userId });
    for (const [cid, c] of calls) {
      if (c.from === userId || c.to === userId) {
        const other = c.from === userId ? c.to : c.from;
        emitTo(other, "call_ended", { callId: cid, reason: "disconnected" });
        calls.delete(cid);
      }
    }
  });

  socket.on("send_message", ({ to, text, type }) => {
    const fs = db.prepare(`SELECT id FROM friendships WHERE
      ((requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)) AND status='accepted'`
    ).get(userId, to, to, userId);
    if (!fs || !text?.trim()) return;
    const msgType = type || "text";
    const msg = { id: uuid(), from_id: userId, to_id: to, group_id: null, text: text.trim().slice(0,2000), type: msgType, time: Date.now(), read: 0 };
    db.prepare("INSERT INTO messages VALUES (?,?,?,?,?,?,?,?)").run(msg.id, msg.from_id, msg.to_id, msg.group_id, msg.text, msg.type, msg.time, msg.read);
    emitTo(to, "new_message", msg);
    socket.emit("message_sent", msg);
  });

  socket.on("send_group_message", ({ groupId, text, type }) => {
    const mem = db.prepare("SELECT * FROM group_members WHERE group_id=? AND user_id=?").get(groupId, userId);
    if (!mem || !text?.trim()) return;
    const msgType = type || "text";
    const msg = { id: uuid(), from_id: userId, to_id: groupId, group_id: groupId, text: text.trim().slice(0,2000), type: msgType, time: Date.now(), read: 0 };
    db.prepare("INSERT INTO messages VALUES (?,?,?,?,?,?,?,?)").run(msg.id, msg.from_id, msg.to_id, msg.group_id, msg.text, msg.type, msg.time, msg.read);
    io.to("group:" + groupId).emit("new_group_message", { ...msg, sender_name: user.display_name, sender_avatar_color: user.avatar_color, sender_avatar_emoji: user.avatar_emoji, sender_avatar_url: user.avatar_url });
  });

  socket.on("typing", ({ to, isTyping }) => emitTo(to, "typing", { from: userId, isTyping }));
  socket.on("group_typing", ({ groupId, isTyping }) => {
    socket.to("group:" + groupId).emit("group_typing", { from: userId, name: user.display_name, isTyping });
  });

  socket.on("join_group", ({ groupId }) => socket.join("group:" + groupId));

  socket.on("call_user", ({ to, callType }) => {
    const callId = uuid();
    calls.set(callId, { from: userId, to, type: callType || "audio" });
    const caller = db.prepare("SELECT display_name,avatar_color,avatar_emoji,avatar_url FROM users WHERE id=?").get(userId);
    emitTo(to, "incoming_call", { callId, from: userId, callType: callType || "audio", ...caller });
    socket.emit("call_ringing", { callId });
  });

  socket.on("accept_call", ({ callId }) => {
    const c = calls.get(callId);
    if (!c) return;
    emitTo(c.from, "call_accepted", { callId, by: userId });
  });

  socket.on("reject_call", ({ callId }) => {
    const c = calls.get(callId);
    if (!c) return;
    const other = c.from === userId ? c.to : c.from;
    emitTo(other, "call_ended", { callId, reason: "rejected" });
    calls.delete(callId);
  });

  socket.on("end_call", ({ callId }) => {
    const c = calls.get(callId);
    if (!c) return;
    const other = c.from === userId ? c.to : c.from;
    emitTo(other, "call_ended", { callId, reason: "ended" });
    calls.delete(callId);
  });

  socket.on("webrtc_offer",  ({ to, offer,     callId }) => emitTo(to, "webrtc_offer",  { from: userId, offer,     callId }));
  socket.on("webrtc_answer", ({ to, answer,    callId }) => emitTo(to, "webrtc_answer", { from: userId, answer,    callId }));
  socket.on("webrtc_ice",    ({ to, candidate })         => emitTo(to, "webrtc_ice",    { from: userId, candidate }));
});

function emitTo(userId, event, data) {
  const sid = online.get(userId);
  if (sid) io.to(sid).emit(event, data);
}
function emitToFriends(userId, event, data) {
  getFriends(userId).filter(f => f.status==="accepted").forEach(f => emitTo(f.id, event, data));
}

server.listen(PORT, () => console.log(`\n✅ ChatApp → ${APP_URL}\n`));
