const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  transports: ["websocket", "polling"],
});

app.use(express.static(path.join(__dirname, "public")));

// ── Bellek ──────────────────────────────────────────────────────────────────
// { socketId: { id, username, avatar, online } }
const users = new Map();

// { [chatKey]: [ {id, from, to, text, time, type} ] }
const messages = new Map();

// { callId: { from, to, status } }
const activeCalls = new Map();

function getChatKey(a, b) {
  return [a, b].sort().join("__");
}

function getOnlineUsers() {
  return [...users.values()].map((u) => ({
    id: u.id,
    username: u.username,
    avatar: u.avatar,
    online: true,
  }));
}

function avatarColor(name) {
  const colors = [
    "#6d28d9","#0891b2","#059669","#d97706",
    "#dc2626","#7c3aed","#0284c7","#16a34a",
  ];
  let hash = 0;
  for (let c of name) hash = c.charCodeAt(0) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

// ── Socket.IO ───────────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log("Bağlantı:", socket.id);

  // 1. KAYIT
  socket.on("register", ({ username }) => {
    if (!username || username.trim() === "") return;

    const user = {
      id: socket.id,
      username: username.trim(),
      avatar: avatarColor(username.trim()),
      online: true,
    };
    users.set(socket.id, user);

    // Kendisine kullanıcı listesi ve geçmiş mesajları gönder
    socket.emit("registered", { user });
    socket.emit("user_list", getOnlineUsers().filter((u) => u.id !== socket.id));

    // Diğerlerine bildir
    socket.broadcast.emit("user_joined", user);
    console.log("Kayıt:", username);
  });

  // 2. MESAJ GÖNDER
  socket.on("send_message", ({ to, text }) => {
    const from = users.get(socket.id);
    if (!from || !text.trim()) return;

    const msg = {
      id: uuidv4(),
      from: from.id,
      fromName: from.username,
      to,
      text: text.trim(),
      time: Date.now(),
      type: "text",
    };

    const key = getChatKey(from.id, to);
    if (!messages.has(key)) messages.set(key, []);
    messages.get(key).push(msg);

    // Alıcıya gönder
    io.to(to).emit("new_message", msg);
    // Göndericiye de dön (onay için)
    socket.emit("message_sent", msg);
  });

  // 3. SOHBET GEÇMİŞİ İSTE
  socket.on("get_history", ({ with: otherId }) => {
    const key = getChatKey(socket.id, otherId);
    const history = messages.get(key) || [];
    socket.emit("history", { with: otherId, messages: history });
  });

  // 4. YAZIYOR...
  socket.on("typing", ({ to, isTyping }) => {
    const from = users.get(socket.id);
    if (!from) return;
    io.to(to).emit("typing", { from: socket.id, isTyping });
  });

  // ── WebRTC SİNYALLEŞME (sesli arama) ─────────────────────────────────────

  // 4a. Arama başlat
  socket.on("call_user", ({ to }) => {
    const caller = users.get(socket.id);
    if (!caller) return;
    const callId = uuidv4();
    activeCalls.set(callId, { from: socket.id, to, status: "ringing" });
    io.to(to).emit("incoming_call", {
      callId,
      from: socket.id,
      fromName: caller.username,
    });
    socket.emit("call_ringing", { callId, to });
  });

  // 4b. Aramayı kabul et
  socket.on("accept_call", ({ callId }) => {
    const call = activeCalls.get(callId);
    if (!call) return;
    call.status = "active";
    io.to(call.from).emit("call_accepted", { callId, by: socket.id });
  });

  // 4c. Aramayı reddet / kapat
  socket.on("reject_call", ({ callId }) => {
    const call = activeCalls.get(callId);
    if (!call) return;
    const other = call.from === socket.id ? call.to : call.from;
    io.to(other).emit("call_ended", { callId, reason: "rejected" });
    activeCalls.delete(callId);
  });

  socket.on("end_call", ({ callId }) => {
    const call = activeCalls.get(callId);
    if (!call) return;
    const other = call.from === socket.id ? call.to : call.from;
    io.to(other).emit("call_ended", { callId, reason: "ended" });
    activeCalls.delete(callId);
  });

  // 4d. WebRTC offer / answer / ice
  socket.on("webrtc_offer", ({ to, offer, callId }) => {
    io.to(to).emit("webrtc_offer", { from: socket.id, offer, callId });
  });

  socket.on("webrtc_answer", ({ to, answer, callId }) => {
    io.to(to).emit("webrtc_answer", { from: socket.id, answer, callId });
  });

  socket.on("webrtc_ice", ({ to, candidate }) => {
    io.to(to).emit("webrtc_ice", { from: socket.id, candidate });
  });

  // 5. BAĞLANTI KESİLDİ
  socket.on("disconnect", () => {
    const user = users.get(socket.id);
    if (user) {
      users.delete(socket.id);
      socket.broadcast.emit("user_left", { id: socket.id });
      console.log("Ayrıldı:", user.username);
    }
  });
});

// ── Sunucu Başlat ────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n✅ ChatApp çalışıyor → http://localhost:${PORT}`);
  console.log("📱 Aynı ağdaki telefon: http://<IP_ADRESIN>:${PORT}\n");
});
