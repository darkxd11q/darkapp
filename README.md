# ChatApp v1-release

**Made by dxrks**

---

## 📋 Güncelleme Geçmişi

### v1-release (Mevcut)
- ⚙️ **Kapsamlı Ayarlar Paneli** eklendi (Gizlilik, Müzik, Engellenenler, Bildirimler)
- 🔒 **Gizlilik Ayarları**: Son görülme, çevrimiçi durumu, okundu bilgisi, profil fotoğrafı kimlere görünsün
- 🎵 **Meditasyon Müziği**: Yağmur, Okyanus, Orman, Om, 528Hz, Beyaz Gürültü – ses seviyesi ayarı ile
- 👁 **Görüldü Bilgisi Düzeltmesi**: WhatsApp gibi çalışır – sadece chat ekranı açık ve sekme aktifken okundu işaretlenir
- ✏️ **Takma Ad**: Arkadaşlara takma ad eklenebilir (sadece kendinize görünür)
- ⏱ **Süreli Mesaj**: 10 saniye sonra otomatik silinen mesajlar gönderilebilir
- 🚫 **Kullanıcı Engelleme**: Profil kartından arkadaşlar engellenebilir ve engel kaldırılabilir
- 🔔 **Bildirim Ayarları**: Mesaj, arama ve ses efektleri ayrı ayrı kapatılabilir
- 📱 **Telefon Numarası Seçimi**: Kayıt sırasında kendi numaranı girebilirsin (isteğe bağlı)
- 🔧 **Telefon Format Düzeltmesi**: 5XX XXX XX XX formatı düzeltildi

### v9 (Önceki)
- Profil banner, favori şarkılar, konum, bio link
- Sticker oluşturucu (canvas)
- Sesli ve görüntülü arama (WebRTC)
- Ekran paylaşımı
- Emoji picker, sesli mesaj
- Grup sohbeti
- Tema seçici (5 tema)
- Arama geçmişi

---

## Özellikler

### ⚙️ Ayarlar Paneli
Kenar çubuğundaki ⚙️ butonu veya profil menüsünden açılır. Dört sekme:
- **Gizlilik**: Son görülme, çevrimiçi, okundu bilgisi, profil fotoğrafı erişimini kontrol et
- **Müzik**: 6 farklı meditasyon sesi, ses seviyesi kaydırıcısı
- **Engellenenler**: Engellenen kullanıcıları gör ve engeli kaldır
- **Bildirimler**: Mesaj, arama bildirimi ve ses efektlerini aç/kapat

### 👤 Kullanıcı & Profil
Profil avatarına tıklanarak açılan panel üzerinden tüm kişisel ayarlara ulaşılır. Kullanıcı adı, bio ve avatar (emoji + renk veya fotoğraf) düzenlenebilir. Telefon numarası kayıt sırasında isteğe bağlı girilebilir veya otomatik atanır.

### 🔒 Gizlilik
Son görülme, çevrimiçi durumu ve okundu bilgisi ayrı ayrı kontrol edilebilir. Okundu bilgisi devre dışıysa mavi ✓✓ karşı tarafa gönderilmez. Görüldü işareti sadece chat ekranı açık ve tarayıcı sekmesi aktifken işaretlenir.

### 💬 Durum
Metin, emoji ve fotoğraf birleştirilerek durum oluşturulur.

### 🤝 Arkadaş Sistemi
Telefon numarasıyla kullanıcı aranır. Takma ad eklenebilir (sadece kendinize görünür). Arkadaş engellenebilir.

### ⏱ Süreli Mesaj
Mesaj kutusundaki ⏱ butonuyla süreli mesaj modu aktifleşir. Bu modda gönderilen mesajlar 10 saniye sonra her iki tarafta otomatik silinir.

### 🎵 Meditasyon Müziği
Arka planda çalışır. Yağmur, okyanus, orman, Om (136Hz), 528Hz ve beyaz gürültü seçenekleri. Web Audio API ile saf ses sentezi – harici kaynak gerektirmez.

### 👥 Grup Sohbeti
İsim, açıklama ve birden fazla üyeyle grup kurulur.

### 💬 Mesajlaşma
Anlık mesaj iletimi WebSocket üzerinden çalışır. Gönderilen mesajlarda ✓ (iletildi) ve ✓✓ mavi (okundu) göstergesi bulunur.

### 📷 Fotoğraf, 🎙 Sesli Mesaj, 😊 Emoji, 🎨 Sticker
Tam özellikli medya gönderimi ve sticker oluşturucu.

### 📞 Sesli & Görüntülü Arama
WebRTC ile P2P arama. Mikrofon kapatma, kamera kapatma, ekran paylaşımı, arama içi mesajlaşma.

### 🎨 Tema
5 tema: Karanlık, Aydınlık, Mor, Okyanus, Orman.

---

## Kurulum

```bash
npm install
cp .env.example .env
# .env dosyasını düzenle
node server.js
```

Gereksinimler: Node.js 18+, npm

---

## Ortam Değişkenleri

```
PORT=3000
APP_URL=http://localhost:3000
SESSION_SECRET=gizli-bir-anahtar
TURN_USERNAME=openrelayproject
TURN_CREDENTIAL=openrelayproject
```
