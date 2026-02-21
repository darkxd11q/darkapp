require("dotenv").config();

const express      = require("express");
const session      = require("express-session");
const passport     = require("passport");
const GoogleStrat  = require("passport-google-oauth20").Strategy;
const SQLiteStore  = require("connect-sqlite3")(session);
const Database     = require("better-sqlite3");
const { Server }   = require("socket.io");
const http         = require("http");
const { v4: uuid } = require("uuid");
const path         = require("path");

// ── Ortam değişkenleri ──────────────────────────────────────────────────────
const PORT        = process.env.PORT        || 3000;
const APP_URL     = process.env.APP_URL     || `http://localhost:${PORT}`;
const SESSION_SEC = process.env.SESSION_SECRET || "changeme_in_production";
const G_ID        = process.env.GOOGLE_CLIENT_ID;
const G_SECRET    = process.env.GOOGLE_CLIENT_SECRET;
const TURN_USER   = process.env.TURN_USERNAME   || "openrelayproject";
const TURN_CRED   = process.env.TURN_CREDENTIAL || "openrelayproject";

// ── Veritabanı ──────────────────────────────────────────────────────────────
const db = new Database("chatapp.db");
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id           TEXT PRIMARY KEY,
    google_id    TEXT UNIQUE,
    display_name TEXT NOT NULL,
    email        TEXT,
    phone_number TEXT UNIQUE,
    bio          TEXT    DEFAULT '',
    avatar_color TEXT    DEFAULT '#6d28d9',
    avatar_emoji TEXT    DEFAULT '😊',
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
    id      TEXT PRIMARY KEY,
    from_id TEXT NOT NULL,
    to_id   TEXT NOT NULL,
    text    TEXT NOT NULL,
    time    INTEGER NOT NULL,
    read    INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_msg_pair ON messages(from_id, to_id);
  CREATE INDEX IF NOT EXISTS idx_fs_req   ON friendships(requester_id);
  CREATE INDEX IF NOT EXISTS idx_fs_addr  ON friendships(addressee_id);
`);

// ── Yardımcılar ─────────────────────────────────────────────────────────────
function genPhoneNumber() {
  while (true) {
    const n = "5" + Math.floor(Math.random() * 1000000000).toString().padStart(9, "0");
    const exists = db.prepare("SELECT id FROM users WHERE phone_number=?").get(n);
    if (!exists) return n;
  }
}

function formatPhone(p) {
  return `+90 ${p.slice(0,3)} ${p.slice(3,6)} ${p.slice(6,8)} ${p.slice(8)}`;
}

function getOrCreateUser(profile) {
  const gid   = profile.id;
  const email = profile.emails?.[0]?.value || "";
  const name  = profile.displayName || email.split("@")[0] || "Kullanıcı";

  let user = db.prepare("SELECT * FROM users WHERE google_id=?").get(gid);
  if (!user) {
    user = {
      id:           uuid(),
      google_id:    gid,
      display_name: name,
      email,
      phone_number: genPhoneNumber(),
      bio:          "",
      avatar_color: randomColor(),
      avatar_emoji: "😊",
      created_at:   Date.now(),
    };
    db.prepare(`INSERT INTO users VALUES (?,?,?,?,?,?,?,?,?)`).run(
      user.id, user.google_id, user.display_name, user.email,
      user.phone_number, user.bio, user.avatar_color, user.avatar_emoji,
      user.created_at
    );
  }
  return user;
}

function randomColor() {
  const c = ["#6d28d9","#0891b2","#059669","#d97706","#dc2626","#7c3aed","#0284c7","#16a34a","#9333ea","#e11d48"];
  return c[Math.floor(Math.random() * c.length)];
}

function getFriends(userId) {
  return db.prepare(`
    SELECT u.id, u.display_name, u.phone_number, u.avatar_color, u.avatar_emoji, u.bio,
           f.status, f.requester_id
    FROM friendships f
    JOIN users u ON (
      CASE WHEN f.requester_id=? THEN f.addressee_id ELSE f.requester_id END = u.id
    )
    WHERE (f.requester_id=? OR f.addressee_id=?) AND f.status IN ('accepted','pending')
  `).all(userId, userId, userId);
}

function getChatKey(a, b) { return [a,b].sort().join("__"); }

// ── Express & Session ───────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

const sessionMiddleware = session({
  store:             new SQLiteStore({ db: "sessions.db", table: "sessions" }),
  secret:            SESSION_SEC,
  resave:            false,
  saveUninitialized: false,
  cookie:            { maxAge: 30 * 24 * 60 * 60 * 1000 }, // 30 gün
});
app.use(sessionMiddleware);

// ── Passport / Google OAuth ─────────────────────────────────────────────────
app.use(passport.initialize());
app.use(passport.session());

if (G_ID && G_SECRET) {
  passport.use(new GoogleStrat({
    clientID:     G_ID,
    clientSecret: G_SECRET,
    callbackURL:  `${APP_URL}/auth/google/callback`,
  }, (accessToken, refreshToken, profile, done) => {
    try {
      const user = getOrCreateUser(profile);
      done(null, user);
    } catch(e) {
      done(e);
    }
  }));
} else {
  console.warn("⚠️  GOOGLE_CLIENT_ID / SECRET tanımlı değil. Demo giriş aktif.");
}

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(id);
  done(null, user || false);
});

// ── Auth middleware ─────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect("/login");
}

// ── Rotalar ─────────────────────────────────────────────────────────────────
app.get("/login", (req, res) => {
  if (req.isAuthenticated()) return res.redirect("/");
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "app.html"));
});

// Google OAuth rotaları
app.get("/auth/google", passport.authenticate("google", { scope: ["profile","email"] }));
app.get("/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login?error=1" }),
  (req, res) => res.redirect("/")
);

// Demo giriş (Google OAuth yokken)
app.post("/auth/demo", (req, res) => {
  const name = (req.body.name || "").trim().slice(0,24);
  if (!name) return res.status(400).json({ error: "İsim gerekli" });

  const demoId  = "demo_" + uuid();
  const demoGid = "demo_" + Date.now();
  const user = getOrCreateUser({
    id: demoGid,
    displayName: name,
    emails: [{ value: `${demoId}@demo.local` }],
  });
  req.login(user, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true });
  });
});

app.get("/auth/logout", (req, res, next) => {
  req.logout((err) => { if (err) return next(err); res.redirect("/login"); });
});

// ── API ─────────────────────────────────────────────────────────────────────
// Mevcut kullanıcı bilgisi
app.get("/api/me", requireAuth, (req, res) => {
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id);
  res.json({ ...u, google_id: undefined });
});

// Profil güncelle
app.put("/api/me", requireAuth, (req, res) => {
  const { display_name, bio, avatar_color, avatar_emoji } = req.body;
  const u = req.user;
  db.prepare(`
    UPDATE users SET display_name=?, bio=?, avatar_color=?, avatar_emoji=? WHERE id=?
  `).run(
    (display_name||u.display_name).trim().slice(0,32),
    (bio||"").slice(0,120),
    avatar_color || u.avatar_color,
    avatar_emoji || u.avatar_emoji,
    u.id
  );
  const updated = db.prepare("SELECT * FROM users WHERE id=?").get(u.id);
  res.json(updated);
});

// TURN sunucu bilgisi (istemciye gönder)
app.get("/api/ice-servers", requireAuth, (req, res) => {
  res.json([
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    {
      urls: [
        "turn:openrelay.metered.ca:80",
        "turn:openrelay.metered.ca:443",
        "turn:openrelay.metered.ca:443?transport=tcp",
      ],
      username:   TURN_USER,
      credential: TURN_CRED,
    },
  ]);
});

// Telefon numarasıyla kullanıcı ara
app.get("/api/users/search", requireAuth, (req, res) => {
  const phone = (req.query.phone || "").replace(/\D/g,"");
  if (phone.length < 4) return res.json({ user: null });
  const user = db.prepare(
    "SELECT id, display_name, phone_number, avatar_color, avatar_emoji, bio FROM users WHERE phone_number=? AND id!=?"
  ).get(phone, req.user.id);
  res.json({ user: user || null });
});

// Arkadaş isteği gönder
app.post("/api/friends/request", requireAuth, (req, res) => {
  const { addressee_id } = req.body;
  if (!addressee_id || addressee_id === req.user.id)
    return res.status(400).json({ error: "Geçersiz kullanıcı" });

  const existing = db.prepare(`
    SELECT * FROM friendships WHERE
    (requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)
  `).get(req.user.id, addressee_id, addressee_id, req.user.id);

  if (existing) return res.status(409).json({ error: "Zaten istek gönderilmiş veya arkadaşsınız." });

  db.prepare("INSERT INTO friendships VALUES (?,?,?,?,?)").run(
    uuid(), req.user.id, addressee_id, "pending", Date.now()
  );
  res.json({ ok: true });
});

// Arkadaş isteğini kabul et
app.post("/api/friends/accept", requireAuth, (req, res) => {
  const { requester_id } = req.body;
  const result = db.prepare(`
    UPDATE friendships SET status='accepted'
    WHERE requester_id=? AND addressee_id=? AND status='pending'
  `).run(requester_id, req.user.id);

  if (result.changes === 0) return res.status(404).json({ error: "İstek bulunamadı" });
  res.json({ ok: true });
});

// Arkadaşı sil / isteği reddet
app.delete("/api/friends/:friendId", requireAuth, (req, res) => {
  db.prepare(`
    DELETE FROM friendships WHERE
    (requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)
  `).run(req.user.id, req.params.friendId, req.params.friendId, req.user.id);
  res.json({ ok: true });
});

// Arkadaş listesi
app.get("/api/friends", requireAuth, (req, res) => {
  res.json(getFriends(req.user.id));
});

// Mesaj geçmişi
app.get("/api/messages/:otherId", requireAuth, (req, res) => {
  const { otherId } = req.params;
  const msgs = db.prepare(`
    SELECT * FROM messages
    WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?)
    ORDER BY time ASC LIMIT 200
  `).all(req.user.id, otherId, otherId, req.user.id);

  // Okundu işaretle
  db.prepare(`UPDATE messages SET read=1 WHERE from_id=? AND to_id=?`).run(otherId, req.user.id);
  res.json(msgs);
});

// ── Socket.IO ───────────────────────────────────────────────────────────────
const io = new Server(server, { transports: ["websocket","polling"] });

// Session erişimi Socket.IO içinde
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

// Çevrimiçi kullanıcılar: userId → socketId
const online = new Map();
// Aktif aramalar: callId → { from, to }
const calls  = new Map();

io.on("connection", (socket) => {
  const req    = socket.request;
  const userId = req.session?.passport?.user;
  if (!userId) { socket.disconnect(true); return; }

  const user = db.prepare("SELECT * FROM users WHERE id=?").get(userId);
  if (!user) { socket.disconnect(true); return; }

  online.set(userId, socket.id);

  // Arkadaşları bilgilendir
  emitToFriends(userId, "friend_online", { id: userId });

  socket.on("disconnect", () => {
    online.delete(userId);
    emitToFriends(userId, "friend_offline", { id: userId });
    // Açık aramayı kapat
    for (const [cid, c] of calls) {
      if (c.from === userId || c.to === userId) {
        const other = c.from === userId ? c.to : c.from;
        emitTo(other, "call_ended", { callId: cid, reason: "disconnected" });
        calls.delete(cid);
      }
    }
  });

  // Mesaj gönder
  socket.on("send_message", ({ to, text }) => {
    // Arkadaş kontrolü
    const areFriends = db.prepare(`
      SELECT id FROM friendships WHERE
      ((requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?))
      AND status='accepted'
    `).get(userId, to, to, userId);
    if (!areFriends) return;

    const msg = {
      id:      uuid(),
      from_id: userId,
      to_id:   to,
      text:    text.trim().slice(0, 2000),
      time:    Date.now(),
      read:    0,
    };
    db.prepare("INSERT INTO messages VALUES (?,?,?,?,?,?)").run(
      msg.id, msg.from_id, msg.to_id, msg.text, msg.time, msg.read
    );
    emitTo(to, "new_message", msg);
    socket.emit("message_sent", msg);
  });

  // Yazıyor
  socket.on("typing", ({ to, isTyping }) => {
    emitTo(to, "typing", { from: userId, isTyping });
  });

  // ── WebRTC sinyalleme ─────────────────────────────────────
  socket.on("call_user", ({ to }) => {
    const callId = uuid();
    calls.set(callId, { from: userId, to });
    const caller = db.prepare("SELECT display_name, avatar_color, avatar_emoji FROM users WHERE id=?").get(userId);
    emitTo(to, "incoming_call", { callId, from: userId, ...caller });
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

  socket.on("webrtc_offer",  ({ to, offer,  callId }) => emitTo(to, "webrtc_offer",  { from: userId, offer,  callId }));
  socket.on("webrtc_answer", ({ to, answer, callId }) => emitTo(to, "webrtc_answer", { from: userId, answer, callId }));
  socket.on("webrtc_ice",    ({ to, candidate })      => emitTo(to, "webrtc_ice",    { from: userId, candidate }));
});

function emitTo(userId, event, data) {
  const sid = online.get(userId);
  if (sid) io.to(sid).emit(event, data);
}

function emitToFriends(userId, event, data) {
  const friends = getFriends(userId).filter(f => f.status === "accepted");
  friends.forEach(f => emitTo(f.id, event, data));
}

// ── Başlat ──────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n✅  ChatApp → ${APP_URL}`);
  if (!G_ID) console.log("ℹ️   Google OAuth yok — demo giriş aktif\n");
});
