# ChatApp v7

Gerçek zamanlı, tam özellikli bir mesajlaşma uygulaması. Node.js, Socket.IO ve WebRTC üzerine inşa edilmiştir.

---

## Kurulum

```bash
npm install
npm start
```

Uygulama varsayılan olarak **http://localhost:3000** adresinde çalışır.

> Node.js 18 veya üzeri gereklidir.

### Ortam Değişkenleri (İsteğe Bağlı)

`.env.example` dosyasını `.env` olarak kopyalayıp düzenleyebilirsiniz:

```
PORT=3000
SESSION_SECRET=gizli-anahtar
TURN_USERNAME=openrelayproject
TURN_CREDENTIAL=openrelayproject
```

---

## Özellikler

### 👤 Kullanıcı ve Profil

- **Kayıt & Giriş** — E-posta ve şifreyle hesap oluşturma, oturum yönetimi
- **Profil Düzenleme** — Kullanıcı adı ve kısa bio güncelleme
- **Özel Profil Fotoğrafı** — Galeriden fotoğraf yükleyip profil görseli yapma (maks. 5 MB)
- **Avatar Özelleştirme** — 18 farklı emoji ve 12 farklı renk arasından avatar seçimi
- **Telefon Numarası** — Her kullanıcıya otomatik atanan benzersiz numara; tek tıkla kopyalama
- **Hesap Güvenliği** — bcrypt ile şifre hashleme, güvenli oturum yönetimi

---

### 💬 Durum

- **Durum Metni** — En fazla 80 karakter uzunluğunda kişisel durum mesajı yazma
- **Durum Emojisi** — 18 hazır emoji arasından durum emojisi seçme
- **Anlık Yayılım** — Durum güncellemeleri arkadaşlara Socket.IO üzerinden anında iletilir
- **Kolay Temizleme** — Durumu tek tıkla temizleme
- **Görünürlük** — Durum, arkadaşlar listesinde ve sohbet önizlemelerinde gösterilir

---

### 🤝 Arkadaş Sistemi

- **Telefon Numarasıyla Arama** — Arkadaşları telefon numaralarıyla arama ve bulma
- **Arkadaşlık İsteği** — İstek gönderme, kabul etme ve reddetme
- **Çevrimiçi Göstergesi** — Arkadaşların anlık çevrimiçi durumu yeşil nokta ile gösterilir
- **Profil Kartı** — Arkadaşın profil fotoğrafı, biyografisi ve durumu tek panelde
- **Arkadaş Silme** — İstenen arkadaşı listeden kaldırma

---

### 👥 Grup Sohbeti

- **Grup Oluşturma** — İsim, açıklama ve üye seçerek grup kurma
- **Üye Yönetimi** — Birden fazla kişiyi aynı anda gruba ekleme
- **Grup Mesajları** — Her mesajda gönderenin avatarı ve adı gösterilir
- **Grup Yazıyor Göstergesi** — Grupta kimin yazdığı anlık olarak iletilir
- **Grup Silme** — Grup sahibi grubu tamamen silebilir

---

### 💬 Mesajlaşma

- **Gerçek Zamanlı Mesajlar** — WebSocket üzerinden anlık mesaj iletimi
- **Görüldü / Okundu Bilgisi** — Gönderilen mesajlarda ✓ (iletildi) ve ✓✓ (okundu) işaretleri; okunduğunda mavi renge döner
- **Çoklu Mesaj Türleri** — Metin, fotoğraf, sesli mesaj, emoji ve sticker desteği
- **Yazıyor Göstergesi** — Karşı taraf yazarken anlık bildirim
- **Mesaj Geçmişi** — Sayfalama olmaksızın son 300 mesaj yüklenir
- **Tarih Ayraçları** — Mesajlar arasında "Bugün", "Dün" ve tarih etiketleri

---

### 📷 Fotoğraf Gönderme

- **Galeriden Seçim** — Doğrudan sohbet içinden fotoğraf paylaşma (maks. 15 MB)
- **Tam Ekran Görüntüleme** — Fotoğrafa tıklanınca karartılmış arka planlı lightbox açılır
- **Önizleme Balonları** — Fotoğraf mesajlar balonun içinde küçük önizleme olarak gösterilir

---

### 🎙 Sesli Mesaj

- **Mikrofon Kaydı** — Mikrofon butonuna basılınca kayıt başlar, tekrar basılınca durur ve otomatik gönderilir
- **Kayıt Göstergesi** — Kayıt sırasında buton kırmızı renkte titreşim animasyonu yapar
- **Oynatıcı** — Play/pause butonu, dalga formu ilerleme çubuğu ve geçen süre göstergesi
- **Ses Formatı** — WebM / Opus formatında yüksek kaliteli kayıt

---

### 😊 Emoji Gönderme

- **300+ Emoji** — 8 kategoride düzenlenmiş geniş emoji kütüphanesi
  - Yüzler · Eller · Hayvanlar · Yemek · Spor · Araçlar · Objeler · Semboller
- **Emoji Arama** — Emoji adına göre anlık filtreleme
- **Kategori Sekmeleri** — Hızlı geçiş için sekme menüsü
- **Metin İçine Ekleme** — Emoji, imleç konumuna eklenir; yazının ortasına yerleştirilebilir

---

### 🎨 Sticker Gönderme

- **Sticker Oluşturucu** — 240×240 canvas üzerinde el ile çizim yapma
- **Çizim Araçları** — Kalem (ayarlanabilir boyut & renk), silgi ve metin ekleme aracı
- **Şeffaf Arka Plan** — Tek tıkla arka plan rengini şeffaf yapma
- **Kaydetme** — Oluşturulan sticker yerel depoya kaydedilir, istediğin zaman silinebilir
- **Sticker Galerisi** — Kayıtlı tüm stickerlar pick-up menüsünde grid görünümünde listelenir

---

### 📞 Sesli & Görüntülü Arama

- **Sesli Arama** — Peer-to-peer WebRTC tabanlı yüksek kaliteli sesli görüşme
- **Görüntülü Arama** — HD kamera desteğiyle yüz yüze görüntülü arama
- **Gelen Arama Bildirimi** — Arayanın avatarı ve ismiyle birlikte alt popup
- **Zil Sesi** — Gelen aramada Web Audio API ile üretilen zil sesi
- **Arama Kontrolleri**
  - 🎙 Mikrofonu Kapat / Aç
  - 📷 Kamerayı Kapat / Aç
  - 🔄 Ön / Arka Kamera Geçişi (mobil)
  - 🖥 Ekran Paylaşımı
  - 💬 Arama Sırasında Mesajlaşma (slayt panel)
  - 📵 Aramayı Sonlandır
- **Bağlantı Sesi** — Arama kurulduğunda onay sesi çalar
- **Arama Süresi** — Aktif aramada MM:SS formatında süre sayacı
- **STUN/TURN Desteği** — NAT arkasındaki cihazlar için geçiş sunucusu yapılandırması

---

### 🖥 Ekran Paylaşımı

- **Masaüstü Paylaşımı** — getDisplayMedia API ile pencere veya tam ekran paylaşımı
- **Mobil Desteği** — Destekleyen Android tarayıcılarında (Chrome) çalışır
- **Otomatik Kamera Dönüşü** — Paylaşım bittiğinde kamera yayınına geri dönülür
- **Görsel Gösterge** — Paylaşım aktifken buton yeşile döner

---

### 📋 Arama Geçmişi

- **Geçmiş Paneli** — Sohbet başlığındaki 📋 butonuyla geçmiş aramalar listelenir
- **Arama Detayları** — Gelen / Giden, Sesli / Görüntülü, durum (tamamlandı / reddedildi) ve arama süresi
- **Süre Gösterimi** — Her arama için **X dk Y s** formatında geçen süre
- **Kalıcı Kayıt** — Arama geçmişi SQLite veritabanında saklanır

---

### 🔍 Mesaj Arama

- **Sohbet İçi Arama** — 🔍 butonuyla açılan arama çubuğu ile mesajlar arasında arama
- **Anlık Filtreleme** — Yazılırken eşleşen mesajlar gerçek zamanlı vurgulanır
- **Sonuç Sayısı** — Toplam kaç eşleşme bulunduğu gösterilir
- **Sidebar Araması** — Sol panelde sohbet listesi içinde arkadaş / grup adıyla filtreleme

---

### 🎨 Tema Seçimi

| Tema | Açıklama |
|------|----------|
| 🌑 Karanlık | Göz yormayan koyu yeşil-gri paleti (varsayılan) |
| ☀️ Aydınlık | Temiz beyaz arka planlı gündüz teması |
| 🟣 Mor | Derin mor tonlarda gece teması |
| 🌊 Okyanus | Derin mavi tonlarında deniz teması |
| 🌲 Orman | Orman yeşili tonlarında doğa teması |

Seçilen tema tarayıcıda kalıcı olarak saklanır (localStorage).

---

### 🔔 Bildirimler

- **OS Bildirimleri** — Uygulama arka planda iken işletim sistemi bildirim izni istenir; yeni mesaj ve aramalarda sistem bildirimi gönderilir
- **Uygulama İçi Banner** — Farklı sohbetten gelen mesajlarda sağ üstte kayan banner; 4 saniye sonra otomatik kapanır
- **Okunmamış Sayacı** — Her sohbet öğesinde okunmamış mesaj sayısı rozeti
- **Bildirim Sesi** — Yeni mesaj geldiğinde Web Audio API ile üretilen kısa ses

---

## Teknoloji Yığını

| Katman | Teknoloji |
|--------|-----------|
| Sunucu | Node.js · Express · Socket.IO |
| Veritabanı | SQLite (better-sqlite3) |
| Kimlik Doğrulama | bcryptjs · express-session |
| Gerçek Zamanlı İletişim | Socket.IO WebSocket |
| Görüntülü/Sesli Arama | WebRTC (RTCPeerConnection) |
| Dosya Yükleme | Multer |
| Ses Efektleri | Web Audio API |

---

## Proje Yapısı

```
chatapp-v7/
├── server.js          # Express + Socket.IO + WebRTC sinyal sunucusu
├── package.json
├── .env.example
└── public/
    ├── app.html       # Ana uygulama (tek sayfa)
    ├── login.html     # Giriş / Kayıt sayfası
    ├── index.html     # Yönlendirme sayfası
    └── uploads/       # Yüklenen fotoğraf ve sesler (otomatik oluşturulur)
```

---

## Lisans

MIT
