# 💬 ChatApp v3

WhatsApp alternatifi — e-posta/şifre girişi, görüntülü & sesli arama, anlık mesajlaşma.

## Özellikler
- ✅ E-posta + şifre ile kayıt / giriş (doğrulama yok)
- ✅ Her kullanıcıya otomatik +90 telefon numarası
- ✅ Telefon numarasıyla arkadaş ekleme
- ✅ Anlık mesajlaşma (Socket.IO)
- ✅ Sesli arama (WebRTC P2P)
- ✅ Görüntülü arama (WebRTC video)
- ✅ Zil sesi + mesaj sesi (Web Audio API)
- ✅ Profil özelleştirme (isim, bio, emoji, renk)
- ✅ Yazıyor... bildirimi, okunmamış sayacı
- ✅ Mobil uyumlu koyu tema

## Hızlı Başlangıç

```bash
npm install
cp .env.example .env     # SESSION_SECRET'i değiştir
node server.js
# → http://localhost:3000
```

## İnternetten Erişim (Railway - Ücretsiz)

```bash
npm install -g @railway/cli
railway login && railway init && railway up
```

Railway dashboard → Environment Variables:
- SESSION_SECRET=guclu_bir_sifre
- APP_URL=https://senin-url.up.railway.app

## Sesli/Görüntülü Arama
WebRTC P2P kullanır. Farklı ağlardan bağlantı için OpenRelay TURN sunucuları dahil.
