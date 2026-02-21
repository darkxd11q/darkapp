# 💬 ChatApp v2 — WhatsApp Alternatifi

Anlık mesajlaşma + WebRTC sesli arama uygulaması.
Google OAuth, telefon numaralı arkadaş sistemi, profil özelleştirme.

---

## ✨ Özellikler

- ✅ Google ile giriş (Google OAuth 2.0)
- ✅ Demo girişi (Google OAuth kurmadan test için)
- ✅ Her kullanıcıya benzersiz +90 telefon numarası
- ✅ Telefon numarasıyla arkadaş arama ve ekleme
- ✅ Arkadaşlık isteği sistemi (kabul / reddet)
- ✅ Anlık mesajlaşma (Socket.IO)
- ✅ Yazıyor... bildirimi
- ✅ Okunmamış mesaj sayacı
- ✅ Sıfır gecikmeli sesli arama (WebRTC P2P + TURN)
- ✅ İnternetten bağlantı (TURN sunucuları sayesinde)
- ✅ Profil düzenleme (isim, bio, emoji, renk)
- ✅ Mobil uyumlu arayüz
- ✅ Koyu tema (WhatsApp stili)

---

## 🚀 Hızlı Başlangıç (Demo modunda)

```bash
# 1. Bağımlılıkları yükle
npm install

# 2. .env dosyasını oluştur (demo mod için minimum ayar)
cp .env.example .env
# .env içinde SESSION_SECRET'i değiştir

# 3. Başlat
node server.js
# → http://localhost:3000
```

Demo modunda Google OAuth olmadan kullanıcı adıyla giriş yapabilirsin.

---

## 🔐 Google OAuth Kurulumu

### 1. Google Cloud Console

1. https://console.cloud.google.com adresine git
2. Yeni proje oluştur veya mevcut projeyi seç
3. **APIs & Services → Credentials** → **Create Credentials → OAuth client ID**
4. Application type: **Web application**
5. **Authorized redirect URIs** ekle:
   - Geliştirme: `http://localhost:3000/auth/google/callback`
   - Production: `https://SENIN-DOMAININ/auth/google/callback`
6. Client ID ve Client Secret'i kopyala

### 2. .env Dosyası

```env
GOOGLE_CLIENT_ID=123456789-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abcdefghijk
APP_URL=http://localhost:3000
SESSION_SECRET=guclu-rastgele-bir-sifre-yaz
PORT=3000
```

---

## 🌍 İnternetten Erişim (Herkes bağlanabilsin)

### Seçenek 1: Railway (Ücretsiz, Önerilen)

```bash
# Railway CLI kur
npm install -g @railway/cli
railway login
railway init
railway up
```

Railway'de environment variables ekle:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`  
- `SESSION_SECRET`
- `APP_URL` → Railway'nin verdiği URL (https://...)
- `PORT` → Railway otomatik ayarlar

### Seçenek 2: Render (Ücretsiz)

1. https://render.com → New Web Service
2. GitHub reposunu bağla
3. Build: `npm install`, Start: `node server.js`
4. Environment variables ekle

### Seçenek 3: ngrok (Test için)

```bash
# ngrok kur: https://ngrok.com
ngrok http 3000
# Verilen URL'yi APP_URL olarak .env'e yaz
```

---

## 📞 Sesli Arama (WebRTC)

Uygulama WebRTC P2P kullanır. Aynı ağda sunucu üzerinden geçmeden doğrudan iletişim kurulur.

Farklı ağlardan bağlanmak için TURN sunucusu gereklidir.  
Varsayılan olarak **OpenRelay** ücretsiz TURN sunucuları kullanılmaktadır.

Daha iyi TURN performansı için:
1. https://app.metered.ca ücretsiz hesap aç
2. TURN sunucu bilgilerini al
3. `.env`'e ekle:
   ```
   TURN_USERNAME=senin_kullanicin
   TURN_CREDENTIAL=senin_sifren
   ```

---

## 📁 Dosya Yapısı

```
chatapp/
├── server.js          # Ana backend (Express + Socket.IO + Passport)
├── package.json
├── .env.example       # Örnek ortam değişkenleri
├── chatapp.db         # SQLite veritabanı (otomatik oluşur)
├── sessions.db        # Oturum veritabanı (otomatik oluşur)
└── public/
    ├── login.html     # Giriş ekranı
    └── app.html       # Ana uygulama
```

---

## 👥 Kullanım

1. Uygulamayı aç → Google ile veya demo olarak giriş yap
2. **Profil ikonuna** tıkla → ismini, bio'nu, emoji ve rengini ayarla
3. Telefon numaranı kopyala (arkadaşlarınla paylaş)
4. **➕ butonuna** tıkla → arkadaşının numarasını gir → Ekle
5. Arkadaşın isteği kabul edince sohbet başlatabilirsiniz
6. **📞** butonuna tıkla → sesli arama başlat
