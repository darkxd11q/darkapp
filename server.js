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
let rateLimit, helmet;
try { rateLimit = require("express-rate-limit"); } catch(e) { rateLimit = null; }
try { helmet    = require("helmet");             } catch(e) { helmet    = null; }

const PORT        = process.env.PORT           || 3000;
const APP_URL     = process.env.APP_URL        || `http://localhost:${PORT}`;
const SESSION_SEC = process.env.SESSION_SECRET || "changeme-use-strong-secret-in-production";
const TURN_USER   = process.env.TURN_USERNAME  || "openrelayproject";
const TURN_CRED   = process.env.TURN_CREDENTIAL|| "openrelayproject";

// ── DIRECTORIES ───────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ── FILE MAGIC BYTE VALIDATION ────────────────────────────
const IMAGE_MAGIC = [
  [0xFF,0xD8,0xFF],            // JPEG
  [0x89,0x50,0x4E,0x47],      // PNG
  [0x47,0x49,0x46],            // GIF
  [0x52,0x49,0x46,0x46],      // WebP (RIFF header)
  [0x42,0x4D],                 // BMP
];
function isValidImageBuffer(buf) {
  return IMAGE_MAGIC.some(magic => magic.every((b,i) => buf[i]===b));
}
function validateMagicBytes(filePath, type) {
  try {
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(12);
    fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);
    if (type === "image") return isValidImageBuffer(buf);
    // Audio: webm starts with 0x1A 0x45, ogg with 0x4F 0x67
    return buf[0]===0x1A&&buf[1]===0x45 ||
           buf[0]===0x4F&&buf[1]===0x67 ||
           buf[0]===0xFF&&(buf[1]&0xE0)===0xE0 || // MP3
           buf[0]===0x52&&buf[1]===0x49&&buf[2]===0x46&&buf[3]===0x46; // WAV
  } catch { return false; }
}

// ── MULTER STORAGE ────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = { "image/jpeg":".jpg","image/png":".png","image/gif":".gif",
                  "image/webp":".webp","audio/webm":".webm","audio/ogg":".ogg",
                  "audio/mpeg":".mp3","application/octet-stream":".webm" }
                 [file.mimetype] || ".bin";
    cb(null, uuid() + ext);
  }
});
const mkUpload = (maxMB, allowedTypes) => multer({
  storage,
  limits: { fileSize: maxMB * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (allowedTypes.some(t => file.mimetype.startsWith(t) || file.mimetype === t))
      return cb(null, true);
    cb(Object.assign(new Error("Geçersiz dosya türü"), { code: "INVALID_TYPE" }));
  }
});
const uploadAvatar = mkUpload(5,  ["image/"]);
const uploadMedia  = mkUpload(15, ["image/","audio/","application/octet-stream"]);
const uploadStatus = mkUpload(5,  ["image/"]);

// ── DATABASE ──────────────────────────────────────────────
const db = new Database("chatapp.db");
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id           TEXT PRIMARY KEY,
    email        TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password     TEXT NOT NULL,
    display_name TEXT NOT NULL,
    phone_number TEXT UNIQUE,
    bio          TEXT DEFAULT '',
    avatar_color TEXT DEFAULT '#6d28d9',
    avatar_emoji TEXT DEFAULT '😊',
    avatar_url   TEXT DEFAULT NULL,
    status_text  TEXT DEFAULT '',
    status_emoji TEXT DEFAULT '',
    status_photo TEXT DEFAULT NULL,
    bio_link     TEXT DEFAULT '',
    fav_songs    TEXT DEFAULT '[]',
    location_txt TEXT DEFAULT '',
    banner_url   TEXT DEFAULT NULL,
    profile_views INTEGER DEFAULT 0,
    created_at   INTEGER,
    last_seen    INTEGER
  );
  CREATE TABLE IF NOT EXISTS friendships (
    id           TEXT PRIMARY KEY,
    requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    addressee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status       TEXT DEFAULT 'pending',
    created_at   INTEGER,
    UNIQUE(requester_id, addressee_id)
  );
  CREATE TABLE IF NOT EXISTS messages (
    id        TEXT PRIMARY KEY,
    from_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_id     TEXT NOT NULL,
    group_id  TEXT DEFAULT NULL,
    text      TEXT NOT NULL,
    type      TEXT DEFAULT 'text',
    time      INTEGER NOT NULL,
    read      INTEGER DEFAULT 0,
    read_at   INTEGER DEFAULT NULL
  );
  CREATE TABLE IF NOT EXISTS call_history (
    id          TEXT PRIMARY KEY,
    from_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    call_type   TEXT DEFAULT 'audio',
    status      TEXT DEFAULT 'ended',
    started_at  INTEGER,
    ended_at    INTEGER,
    duration    INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS groups (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    description  TEXT DEFAULT '',
    avatar_color TEXT DEFAULT '#6d28d9',
    avatar_emoji TEXT DEFAULT '👥',
    avatar_url   TEXT DEFAULT NULL,
    owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at   INTEGER
  );
  CREATE TABLE IF NOT EXISTS group_members (
    group_id   TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role       TEXT DEFAULT 'member',
    joined_at  INTEGER,
    PRIMARY KEY(group_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS login_attempts (
    ip         TEXT NOT NULL,
    email      TEXT NOT NULL,
    time       INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_msg    ON messages(from_id, to_id);
  CREATE INDEX IF NOT EXISTS idx_gmsg   ON messages(group_id);
  CREATE INDEX IF NOT EXISTS idx_fs1    ON friendships(requester_id);
  CREATE INDEX IF NOT EXISTS idx_fs2    ON friendships(addressee_id);
  CREATE INDEX IF NOT EXISTS idx_gm     ON group_members(user_id);
  CREATE INDEX IF NOT EXISTS idx_calls  ON call_history(from_id, to_id);
  CREATE INDEX IF NOT EXISTS idx_la     ON login_attempts(ip, time);
`);

// Migrations for existing DBs
[
  "avatar_url TEXT DEFAULT NULL",
  "status_text TEXT DEFAULT ''",
  "status_emoji TEXT DEFAULT ''",
  "status_photo TEXT DEFAULT NULL",
  "last_seen INTEGER",
  "bio_link TEXT DEFAULT ''",
  "fav_songs TEXT DEFAULT '[]'",
  "location_txt TEXT DEFAULT ''",
  "banner_url TEXT DEFAULT NULL",
  "profile_views INTEGER DEFAULT 0",
].forEach(col => { try { db.exec(`ALTER TABLE users ADD COLUMN ${col}`); } catch(e){} });
["group_id TEXT DEFAULT NULL","type TEXT DEFAULT 'text'","read_at INTEGER DEFAULT NULL"]
  .forEach(col => { try { db.exec(`ALTER TABLE messages ADD COLUMN ${col}`); } catch(e){} });
try { db.exec(`CREATE TABLE IF NOT EXISTS login_attempts (ip TEXT NOT NULL, email TEXT NOT NULL, time INTEGER NOT NULL)`); } catch(e){}

// Clean old login attempts periodically
setInterval(() => {
  try { db.prepare("DELETE FROM login_attempts WHERE time < ?").run(Date.now() - 15*60*1000); } catch(e){}
}, 5 * 60 * 1000);

// ── HELPERS ───────────────────────────────────────────────
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
function sanitizeText(s, max = 5000) {
  if (typeof s !== "string") return "";
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").slice(0, max);
}
function getFriends(userId) {
  return db.prepare(`
    SELECT u.id, u.display_name, u.phone_number, u.avatar_color, u.avatar_emoji,
           u.avatar_url, u.bio, u.status_text, u.status_emoji, u.status_photo,
           u.bio_link, u.location_txt, u.fav_songs, u.banner_url, u.profile_views,
           f.status, f.requester_id
    FROM friendships f
    JOIN users u ON (CASE WHEN f.requester_id=? THEN f.addressee_id ELSE f.requester_id END = u.id)
    WHERE (f.requester_id=? OR f.addressee_id=?) AND f.status IN ('accepted','pending')
  `).all(userId, userId, userId);
}
function getUserGroups(userId) {
  return db.prepare(`
    SELECT g.*, gm.role FROM groups g
    JOIN group_members gm ON g.id=gm.group_id
    WHERE gm.user_id=? ORDER BY g.created_at DESC
  `).all(userId);
}
function deleteUpload(urlPath) {
  if (!urlPath || !urlPath.startsWith("/uploads/")) return;
  const safe = path.basename(urlPath);
  const full = path.join(UPLOAD_DIR, safe);
  if (full.startsWith(UPLOAD_DIR)) {
    try { fs.unlinkSync(full); } catch(e) {}
  }
}

// ── EXPRESS ───────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);

// ── HELMET (security headers) ─────────────────────────────
if (helmet) {
  app.use(helmet({
    contentSecurityPolicy: false, // Managed manually below
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
  }));
}
// Manual security headers - don't break inline scripts
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=self, microphone=self, display-capture=self");
  next();
});

// Remove server fingerprint
app.disable("x-powered-by");
app.set("trust proxy", 1);

// ── RATE LIMITERS ─────────────────────────────────────────
const noop = (req,res,next) => next();
const authLimiter   = rateLimit ? rateLimit({ windowMs: 15*60*1000, max: 20,  message:{error:"Çok fazla deneme. 15 dakika bekle."}, standardHeaders:true, legacyHeaders:false, keyGenerator: req=>req.ip+":"+(req.body?.email||"") }) : noop;
const apiLimiter    = rateLimit ? rateLimit({ windowMs: 60*1000,    max: 120, message:{error:"İstek limiti aşıldı."},             standardHeaders:true, legacyHeaders:false }) : noop;
const uploadLimiter = rateLimit ? rateLimit({ windowMs: 60*1000,    max: 20,  message:{error:"Yükleme limiti aşıldı."},           standardHeaders:true, legacyHeaders:false }) : noop;
const searchLimiter = rateLimit ? rateLimit({ windowMs: 60*1000,    max: 30,  message:{error:"Arama limiti aşıldı."},             standardHeaders:true, legacyHeaders:false }) : noop;

app.use(express.json({ limit: "64kb" }));
app.use(express.urlencoded({ extended: true, limit: "64kb" }));

// Block path traversal attempts
app.use((req, res, next) => {
  if (req.path.includes("..") || req.path.includes("%2e") || req.path.includes("%2E")) {
    return res.status(400).json({ error: "Geçersiz istek." });
  }
  next();
});

// Static files (no directory listing, no dot files)
app.use(express.static(path.join(__dirname, "public"), {
  dotfiles: "deny",
  index: false,
  etag: true,
  lastModified: true,
}));

const sessionMW = session({
  store: new SQLiteStore({ db: "sessions.db", table: "sessions" }),
  secret: SESSION_SEC,
  resave: false,
  saveUninitialized: false,
  name: "sid",
  cookie: {
    maxAge: 30 * 24 * 3600 * 1000,
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  },
});
app.use(sessionMW);

// Apply global API rate limit
app.use("/api", apiLimiter);

function requireAuth(req, res, next) {
  if (req.session?.userId) return next();
  res.status(401).json({ error: "Giriş gerekli." });
}

// ── AUTH ──────────────────────────────────────────────────
app.post("/api/register", authLimiter, async (req, res) => {
  const email        = sanitizeText(req.body.email || "", 254).trim().toLowerCase();
  const display_name = sanitizeText(req.body.display_name || "", 32).trim();
  const password     = req.body.password || "";
  const phone_input  = (req.body.phone_number || "").replace(/\D/g, "");

  if (!email || !display_name || !password)
    return res.status(400).json({ error: "Tüm alanlar zorunlu." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: "Geçersiz e-posta." });
  if (password.length < 6 || password.length > 128)
    return res.status(400).json({ error: "Şifre 6-128 karakter arası olmalı." });
  if (display_name.length < 2)
    return res.status(400).json({ error: "İsim en az 2 karakter olmalı." });
  if (db.prepare("SELECT id FROM users WHERE email=?").get(email))
    return res.status(409).json({ error: "Bu e-posta zaten kayıtlı." });

  // Phone number: optional — if provided validate and check uniqueness
  let phone_number = null;
  if (phone_input) {
    if (phone_input.length !== 10 || !phone_input.startsWith("5"))
      return res.status(400).json({ error: "Telefon numarası 10 haneli olmalı ve 5 ile başlamalı." });
    if (db.prepare("SELECT id FROM users WHERE phone_number=?").get(phone_input))
      return res.status(409).json({ error: "Bu telefon numarası zaten kayıtlı. Lütfen farklı bir numara girin." });
    phone_number = phone_input;
  }

  const hash = await bcrypt.hash(password, 12);
  const user = {
    id: uuid(), email, password: hash,
    display_name: display_name.slice(0, 32),
    phone_number, bio: "",
    avatar_color: randomColor(), avatar_emoji: "😊",
    avatar_url: null, status_text: "", status_emoji: "",
    status_photo: null, created_at: Date.now(), last_seen: Date.now(),
  };
  db.prepare(`INSERT INTO users VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(user.id, user.email, user.password, user.display_name, user.phone_number,
         user.bio, user.avatar_color, user.avatar_emoji, user.avatar_url,
         user.status_text, user.status_emoji, user.status_photo,
         "", "[]", "", null, 0,
         user.created_at, user.last_seen);
  req.session.userId = user.id;
  req.session.userId = user.id;
  res.json({ ok: true, user: safeUser(user) });
});

app.post("/api/login", authLimiter, async (req, res) => {
  const email    = sanitizeText(req.body.email    || "", 254).trim().toLowerCase();
  const password = req.body.password || "";
  const ip       = req.ip;

  if (!email || !password)
    return res.status(400).json({ error: "Eksik bilgi." });

  // Brute-force: max 10 failed attempts per IP per 15 min
  const recent = db.prepare("SELECT COUNT(*) as c FROM login_attempts WHERE ip=? AND time > ?")
    .get(ip, Date.now() - 15 * 60 * 1000);
  if (recent.c >= 10)
    return res.status(429).json({ error: "Çok fazla hatalı giriş. 15 dakika bekle." });

  const user = db.prepare("SELECT * FROM users WHERE email=?").get(email);
  const ok   = user && await bcrypt.compare(password, user.password);

  if (!ok) {
    db.prepare("INSERT INTO login_attempts VALUES (?,?,?)").run(ip, email, Date.now());
    // Constant-time response to prevent timing attacks
    if (!user) await bcrypt.hash("dummy", 12);
    return res.status(401).json({ error: "Hatalı e-posta veya şifre." });
  }

  // Clear failed attempts on success
  db.prepare("DELETE FROM login_attempts WHERE ip=? AND email=?").run(ip, email);
  db.prepare("UPDATE users SET last_seen=? WHERE id=?").run(Date.now(), user.id);
  req.session.userId = user.id;
  res.json({ ok: true, user: safeUser(user) });
});

app.post("/api/logout", requireAuth, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("sid");
    res.json({ ok: true });
  });
});

// ── USER ──────────────────────────────────────────────────
app.get("/api/me", requireAuth, (req, res) => {
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(req.session.userId);
  if (!u) return res.status(404).json({ error: "Kullanıcı bulunamadı." });
  res.json(safeUser(u));
});

app.put("/api/me", requireAuth, (req, res) => {
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(req.session.userId);
  if (!u) return res.status(404).json({ error: "Kullanıcı bulunamadı." });
  const display_name = sanitizeText(req.body.display_name || u.display_name, 32).trim() || u.display_name;
  const bio          = sanitizeText(req.body.bio || "", 200);
  const avatar_color = /^#[0-9A-Fa-f]{6}$/.test(req.body.avatar_color) ? req.body.avatar_color : u.avatar_color;
  const avatar_emoji = sanitizeText(req.body.avatar_emoji || u.avatar_emoji, 10);
  const status_text  = sanitizeText(req.body.status_text || "", 80);
  const status_emoji = sanitizeText(req.body.status_emoji || "", 10);
  const bio_link     = sanitizeText(req.body.bio_link || "", 200);
  const location_txt = sanitizeText(req.body.location_txt || "", 60);
  let fav_songs = "[]";
  try { const arr = JSON.parse(req.body.fav_songs || "[]"); fav_songs = JSON.stringify(arr.slice(0,5).map(x=>String(x).slice(0,100))); } catch(e){}

  db.prepare(`UPDATE users SET display_name=?,bio=?,avatar_color=?,avatar_emoji=?,
              status_text=?,status_emoji=?,bio_link=?,location_txt=?,fav_songs=? WHERE id=?`)
    .run(display_name, bio, avatar_color, avatar_emoji, status_text, status_emoji, bio_link, location_txt, fav_songs, u.id);
  res.json(safeUser(db.prepare("SELECT * FROM users WHERE id=?").get(u.id)));
});

app.post("/api/me/avatar", requireAuth, uploadLimiter, uploadAvatar.single("avatar"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Dosya yüklenmedi." });
  if (!validateMagicBytes(req.file.path, "image")) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: "Geçersiz resim dosyası." });
  }
  const avatarUrl = "/uploads/" + req.file.filename;
  const u = db.prepare("SELECT avatar_url FROM users WHERE id=?").get(req.session.userId);
  deleteUpload(u.avatar_url);
  db.prepare("UPDATE users SET avatar_url=? WHERE id=?").run(avatarUrl, req.session.userId);
  res.json({ ok: true, avatar_url: avatarUrl });
});

app.post("/api/me/banner", requireAuth, uploadLimiter, uploadAvatar.single("banner"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Dosya yüklenmedi." });
  if (!validateMagicBytes(req.file.path, "image")) { fs.unlinkSync(req.file.path); return res.status(400).json({ error: "Geçersiz resim." }); }
  const bannerUrl = "/uploads/" + req.file.filename;
  const u = db.prepare("SELECT banner_url FROM users WHERE id=?").get(req.session.userId);
  deleteUpload(u.banner_url);
  db.prepare("UPDATE users SET banner_url=? WHERE id=?").run(bannerUrl, req.session.userId);
  res.json({ ok: true, banner_url: bannerUrl });
});

app.delete("/api/me/banner", requireAuth, (req, res) => {
  const u = db.prepare("SELECT banner_url FROM users WHERE id=?").get(req.session.userId);
  deleteUpload(u.banner_url);
  db.prepare("UPDATE users SET banner_url=NULL WHERE id=?").run(req.session.userId);
  res.json({ ok: true });
});

app.post("/api/me/status-photo", requireAuth, uploadLimiter, uploadStatus.single("photo"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Dosya yüklenmedi." });
  if (!validateMagicBytes(req.file.path, "image")) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: "Geçersiz resim dosyası." });
  }
  const photoUrl = "/uploads/" + req.file.filename;
  const u = db.prepare("SELECT status_photo FROM users WHERE id=?").get(req.session.userId);
  deleteUpload(u.status_photo);
  db.prepare("UPDATE users SET status_photo=? WHERE id=?").run(photoUrl, req.session.userId);
  res.json({ ok: true, status_photo: photoUrl });
});

// ── MEDIA UPLOAD ──────────────────────────────────────────
app.post("/api/upload", requireAuth, uploadLimiter, uploadMedia.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Dosya yüklenmedi." });
  const isImg = req.file.mimetype.startsWith("image/");
  if (isImg && !validateMagicBytes(req.file.path, "image")) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: "Geçersiz resim dosyası." });
  }
  res.json({ ok: true, url: "/uploads/" + req.file.filename, type: req.file.mimetype });
});

// ── ICE SERVERS ───────────────────────────────────────────
app.post("/api/users/:id/view", requireAuth, (req, res) => {
  const id = sanitizeText(req.params.id, 36);
  if (id !== req.session.userId)
    db.prepare("UPDATE users SET profile_views=profile_views+1 WHERE id=?").run(id);
  res.json({ ok: true });
});

app.get("/api/ice-servers", requireAuth, (req, res) => {
  res.json([
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: ["turn:openrelay.metered.ca:80","turn:openrelay.metered.ca:443",
             "turn:openrelay.metered.ca:443?transport=tcp"],
      username: TURN_USER, credential: TURN_CRED },
  ]);
});

// ── FRIENDS ───────────────────────────────────────────────
app.get("/api/users/search", requireAuth, searchLimiter, (req, res) => {
  const phone = sanitizeText(req.query.phone || "", 20).replace(/\D/g, "");
  if (phone.length < 4) return res.json({ user: null });
  const u = db.prepare(`SELECT id,display_name,phone_number,avatar_color,avatar_emoji,
    avatar_url,bio,status_text,status_emoji,status_photo,bio_link,location_txt,fav_songs,profile_views
    FROM users WHERE phone_number=? AND id!=?`).get(phone, req.session.userId);
  res.json({ user: u || null });
});

app.post("/api/friends/request", requireAuth, (req, res) => {
  const addressee_id = sanitizeText(req.body.addressee_id || "", 36);
  if (!addressee_id || addressee_id === req.session.userId)
    return res.status(400).json({ error: "Geçersiz istek." });
  if (!db.prepare("SELECT id FROM users WHERE id=?").get(addressee_id))
    return res.status(404).json({ error: "Kullanıcı bulunamadı." });
  const ex = db.prepare(`SELECT * FROM friendships WHERE
    (requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)`)
    .get(req.session.userId, addressee_id, addressee_id, req.session.userId);
  if (ex) return res.status(409).json({ error: "Zaten mevcut." });
  db.prepare("INSERT INTO friendships VALUES (?,?,?,?,?)").run(
    uuid(), req.session.userId, addressee_id, "pending", Date.now());
  res.json({ ok: true });
});

app.post("/api/friends/accept", requireAuth, (req, res) => {
  const r = db.prepare(`UPDATE friendships SET status='accepted'
    WHERE requester_id=? AND addressee_id=? AND status='pending'`)
    .run(sanitizeText(req.body.requester_id || "", 36), req.session.userId);
  if (r.changes === 0) return res.status(404).json({ error: "Bulunamadı." });
  res.json({ ok: true });
});

app.delete("/api/friends/:fid", requireAuth, (req, res) => {
  const fid = sanitizeText(req.params.fid, 36);
  db.prepare(`DELETE FROM friendships WHERE
    (requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)`)
    .run(req.session.userId, fid, fid, req.session.userId);
  res.json({ ok: true });
});

app.get("/api/friends", requireAuth, (req, res) => {
  res.json(getFriends(req.session.userId));
});

// ── MESSAGES ──────────────────────────────────────────────
app.get("/api/messages/:otherId", requireAuth, (req, res) => {
  const uid = req.session.userId;
  const oid = sanitizeText(req.params.otherId, 36);
  // Verify friendship
  const fs_ = db.prepare(`SELECT id FROM friendships WHERE
    ((requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?))
    AND status='accepted'`).get(uid, oid, oid, uid);
  if (!fs_) return res.status(403).json({ error: "Erişim yok." });
  const msgs = db.prepare(`SELECT * FROM messages WHERE group_id IS NULL AND
    ((from_id=? AND to_id=?) OR (from_id=? AND to_id=?))
    ORDER BY time ASC LIMIT 300`).all(uid, oid, oid, uid);
  const now = Date.now();
  db.prepare("UPDATE messages SET read=1, read_at=? WHERE from_id=? AND to_id=? AND group_id IS NULL AND read=0")
    .run(now, oid, uid);
  res.json(msgs);
});

// ── CALLS ─────────────────────────────────────────────────
app.get("/api/calls/:otherId", requireAuth, (req, res) => {
  const uid = req.session.userId;
  const oid = sanitizeText(req.params.otherId, 36);
  const calls = db.prepare(`SELECT * FROM call_history WHERE
    (from_id=? AND to_id=?) OR (from_id=? AND to_id=?)
    ORDER BY started_at DESC LIMIT 50`).all(uid, oid, oid, uid);
  res.json(calls);
});

// ── GROUPS ────────────────────────────────────────────────
app.get("/api/groups", requireAuth, (req, res) => {
  res.json(getUserGroups(req.session.userId));
});

app.post("/api/groups", requireAuth, (req, res) => {
  const name        = sanitizeText(req.body.name || "", 50).trim();
  const description = sanitizeText(req.body.description || "", 120);
  const member_ids  = Array.isArray(req.body.member_ids)
    ? req.body.member_ids.map(id => sanitizeText(id, 36)).slice(0, 50)
    : [];
  if (!name) return res.status(400).json({ error: "Grup adı gerekli." });
  const gid = uuid();
  db.prepare("INSERT INTO groups VALUES (?,?,?,?,?,?,?,?)")
    .run(gid, name, description, randomColor(), "👥", null, req.session.userId, Date.now());
  db.prepare("INSERT INTO group_members VALUES (?,?,?,?)").run(gid, req.session.userId, "admin", Date.now());
  member_ids.forEach(mid => {
    if (mid !== req.session.userId && db.prepare("SELECT id FROM users WHERE id=?").get(mid))
      db.prepare("INSERT OR IGNORE INTO group_members VALUES (?,?,?,?)").run(gid, mid, "member", Date.now());
  });
  res.json({ ok: true, group: db.prepare("SELECT * FROM groups WHERE id=?").get(gid) });
});

app.get("/api/groups/:gid", requireAuth, (req, res) => {
  const gid = sanitizeText(req.params.gid, 36);
  const mem = db.prepare("SELECT * FROM group_members WHERE group_id=? AND user_id=?").get(gid, req.session.userId);
  if (!mem) return res.status(403).json({ error: "Erişim yok." });
  const group = db.prepare("SELECT * FROM groups WHERE id=?").get(gid);
  if (!group) return res.status(404).json({ error: "Grup bulunamadı." });
  const members = db.prepare(`SELECT u.id,u.display_name,u.avatar_color,u.avatar_emoji,u.avatar_url,gm.role
    FROM group_members gm JOIN users u ON gm.user_id=u.id WHERE gm.group_id=?`).all(gid);
  res.json({ group, members });
});

app.get("/api/groups/:gid/messages", requireAuth, (req, res) => {
  const gid = sanitizeText(req.params.gid, 36);
  const mem = db.prepare("SELECT * FROM group_members WHERE group_id=? AND user_id=?").get(gid, req.session.userId);
  if (!mem) return res.status(403).json({ error: "Erişim yok." });
  res.json(db.prepare("SELECT * FROM messages WHERE group_id=? ORDER BY time ASC LIMIT 300").all(gid));
});

app.delete("/api/groups/:gid", requireAuth, (req, res) => {
  const gid = sanitizeText(req.params.gid, 36);
  const g = db.prepare("SELECT * FROM groups WHERE id=? AND owner_id=?").get(gid, req.session.userId);
  if (!g) return res.status(403).json({ error: "Yetkisiz." });
  db.prepare("DELETE FROM group_members WHERE group_id=?").run(gid);
  db.prepare("DELETE FROM messages WHERE group_id=?").run(gid);
  db.prepare("DELETE FROM groups WHERE id=?").run(gid);
  res.json({ ok: true });
});

// ── PAGES ─────────────────────────────────────────────────
app.get("/", (req, res) => {
  if (!req.session.userId) return res.redirect("/login");
  res.sendFile(path.join(__dirname, "public", "app.html"));
});
app.get("/login", (req, res) => {
  if (req.session.userId) return res.redirect("/");
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// 404 handler (no stack traces)
app.use((req, res) => res.status(404).json({ error: "Bulunamadı." }));

// Global error handler (no leak of internals)
app.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE")
    return res.status(413).json({ error: "Dosya çok büyük." });
  if (err.code === "INVALID_TYPE")
    return res.status(400).json({ error: "Geçersiz dosya türü." });
  console.error("[ERROR]", err.message);
  res.status(500).json({ error: "Sunucu hatası." });
});

// ── SOCKET.IO ─────────────────────────────────────────────
const io = new Server(server, {
  transports: ["websocket", "polling"],
  maxHttpBufferSize: 2e6, // 2MB for stickers
  pingTimeout: 60000,
  pingInterval: 25000,
  cors: false,
});

// Socket rate limiting (per user)
const socketMsgCount = new Map(); // userId → { count, reset }
function socketRateLimit(userId, max = 30) {
  const now = Date.now();
  let entry = socketMsgCount.get(userId);
  if (!entry || now > entry.reset) {
    entry = { count: 0, reset: now + 10000 };
    socketMsgCount.set(userId, entry);
  }
  entry.count++;
  return entry.count <= max;
}

io.use((socket, next) => sessionMW(socket.request, {}, next));

const online = new Map();
const calls  = new Map();

io.on("connection", (socket) => {
  const userId = socket.request.session?.userId;
  if (!userId) { socket.disconnect(true); return; }
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(userId);
  if (!user) { socket.disconnect(true); return; }

  online.set(userId, socket.id);
  getUserGroups(userId).forEach(g => socket.join("group:" + g.id));
  emitToFriends(userId, "friend_online", { id: userId });
  db.prepare("UPDATE users SET last_seen=? WHERE id=?").run(Date.now(), userId);

  socket.on("disconnect", () => {
    online.delete(userId);
    db.prepare("UPDATE users SET last_seen=? WHERE id=?").run(Date.now(), userId);
    emitToFriends(userId, "friend_offline", { id: userId });
    for (const [cid, c] of calls) {
      if (c.from === userId || c.to === userId) {
        const other = c.from === userId ? c.to : c.from;
        const dur   = Math.round((Date.now() - c.startedAt) / 1000);
        try { db.prepare("INSERT OR IGNORE INTO call_history VALUES (?,?,?,?,?,?,?,?)")
          .run(cid, c.from, c.to, c.type, "ended", c.startedAt, Date.now(), dur); } catch(e){}
        emitTo(other, "call_ended", { callId: cid, reason: "disconnected", duration: dur });
        calls.delete(cid);
      }
    }
  });

  socket.on("send_message", ({ to, text, type }) => {
    if (!socketRateLimit(userId)) return;
    const cleanText = sanitizeText(text || "", type === "image" || type === "audio" ? 512 : 5000);
    if (!cleanText) return;
    const msgType = ["text","image","audio","sticker","call"].includes(type) ? type : "text";
    const fs_ = db.prepare(`SELECT id FROM friendships WHERE
      ((requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?))
      AND status='accepted'`).get(userId, to, to, userId);
    if (!fs_) return;
    const msg = { id: uuid(), from_id: userId, to_id: to, group_id: null,
      text: cleanText, type: msgType, time: Date.now(), read: 0, read_at: null };
    db.prepare("INSERT INTO messages VALUES (?,?,?,?,?,?,?,?,?)")
      .run(msg.id, msg.from_id, msg.to_id, msg.group_id, msg.text, msg.type, msg.time, msg.read, msg.read_at);
    emitTo(to, "new_message", msg);
    socket.emit("message_sent", msg);
  });

  socket.on("send_group_message", ({ groupId, text, type }) => {
    if (!socketRateLimit(userId)) return;
    const cleanText = sanitizeText(text || "", 5000);
    if (!cleanText) return;
    const mem = db.prepare("SELECT * FROM group_members WHERE group_id=? AND user_id=?").get(groupId, userId);
    if (!mem) return;
    const msg = { id: uuid(), from_id: userId, to_id: groupId, group_id: groupId,
      text: cleanText, type: ["text","image","audio","sticker"].includes(type)?type:"text", time: Date.now(), read: 0, read_at: null };
    db.prepare("INSERT INTO messages VALUES (?,?,?,?,?,?,?,?,?)")
      .run(msg.id, msg.from_id, msg.to_id, msg.group_id, msg.text, msg.type, msg.time, msg.read, msg.read_at);
    io.to("group:" + groupId).emit("new_group_message", {
      ...msg,
      sender_name: user.display_name,
      sender_avatar_color: user.avatar_color,
      sender_avatar_emoji: user.avatar_emoji,
      sender_avatar_url: user.avatar_url,
    });
  });

  socket.on("mark_read", ({ from }) => {
    if (typeof from !== "string") return;
    const now = Date.now();
    const updated = db.prepare(`UPDATE messages SET read=1, read_at=?
      WHERE from_id=? AND to_id=? AND read=0 AND group_id IS NULL`)
      .run(now, from, userId);
    if (updated.changes > 0) emitTo(from, "messages_read", { by: userId, at: now });
  });

  socket.on("typing", ({ to, isTyping }) => {
    if (typeof to !== "string" || typeof isTyping !== "boolean") return;
    emitTo(to, "typing", { from: userId, isTyping });
  });

  socket.on("group_typing", ({ groupId, isTyping }) => {
    if (typeof groupId !== "string" || typeof isTyping !== "boolean") return;
    socket.to("group:" + groupId).emit("group_typing", { from: userId, name: user.display_name, isTyping });
  });

  socket.on("join_group", ({ groupId }) => {
    if (typeof groupId !== "string") return;
    const mem = db.prepare("SELECT * FROM group_members WHERE group_id=? AND user_id=?").get(groupId, userId);
    if (mem) socket.join("group:" + groupId);
  });

  socket.on("update_status", ({ status_text, status_emoji, status_photo }) => {
    const st = sanitizeText(status_text || "", 80);
    const se = sanitizeText(status_emoji || "", 10);
    const sp = typeof status_photo === "string" && status_photo.startsWith("/uploads/")
      ? status_photo : null;
    db.prepare("UPDATE users SET status_text=?,status_emoji=?,status_photo=? WHERE id=?")
      .run(st, se, sp, userId);
    emitToFriends(userId, "friend_status", { id: userId, status_text: st, status_emoji: se, status_photo: sp });
  });

  // Calls
  socket.on("call_user", ({ to, callType }) => {
    if (typeof to !== "string") return;
    const callId   = uuid();
    const startedAt= Date.now();
    const ct       = callType === "video" ? "video" : "audio";
    calls.set(callId, { from: userId, to, type: ct, startedAt });
    const caller = db.prepare("SELECT display_name,avatar_color,avatar_emoji,avatar_url FROM users WHERE id=?").get(userId);
    emitTo(to, "incoming_call", { callId, from: userId, callType: ct, ...caller });
    socket.emit("call_ringing", { callId });
  });
  socket.on("accept_call", ({ callId }) => {
    const c = calls.get(callId);
    if (!c || c.to !== userId) return;
    c.startedAt = Date.now();
    emitTo(c.from, "call_accepted", { callId, by: userId });
  });
  socket.on("reject_call", ({ callId }) => {
    const c = calls.get(callId);
    if (!c) return;
    try { db.prepare("INSERT OR IGNORE INTO call_history VALUES (?,?,?,?,?,?,?,?)")
      .run(callId, c.from, c.to, c.type, "rejected", c.startedAt, Date.now(), 0); } catch(e){}
    const other = c.from === userId ? c.to : c.from;
    emitTo(other, "call_ended", { callId, reason: "rejected" });
    calls.delete(callId);
  });
  socket.on("end_call", ({ callId }) => {
    const c = calls.get(callId);
    if (!c) return;
    const dur = Math.round((Date.now() - c.startedAt) / 1000);
    try { db.prepare("INSERT OR IGNORE INTO call_history VALUES (?,?,?,?,?,?,?,?)")
      .run(callId, c.from, c.to, c.type, "ended", c.startedAt, Date.now(), dur); } catch(e){}
    const other = c.from === userId ? c.to : c.from;
    emitTo(other, "call_ended", { callId, reason: "ended", duration: dur });
    socket.emit("call_ended", { callId, reason: "ended", duration: dur });
    calls.delete(callId);
  });
  socket.on("webrtc_offer",  ({ to, offer,  callId }) => { if (typeof to === "string") emitTo(to, "webrtc_offer",  { from: userId, offer,  callId }); });
  socket.on("webrtc_answer", ({ to, answer, callId }) => { if (typeof to === "string") emitTo(to, "webrtc_answer", { from: userId, answer, callId }); });
  socket.on("webrtc_ice",    ({ to, candidate })       => { if (typeof to === "string") emitTo(to, "webrtc_ice",   { from: userId, candidate }); });
});

function emitTo(userId, event, data) {
  const sid = online.get(userId);
  if (sid) io.to(sid).emit(event, data);
}
function emitToFriends(userId, event, data) {
  getFriends(userId).filter(f => f.status === "accepted").forEach(f => emitTo(f.id, event, data));
}

// Clean up socket rate limit map periodically
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of socketMsgCount) if (now > v.reset) socketMsgCount.delete(k);
}, 30000);

server.listen(PORT, () => console.log(`\n✅ ChatApp v8 → ${APP_URL}\n`));
