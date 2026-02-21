# 💬 ChatApp — WhatsApp Alternatifi

Anlık mesajlaşma + sıfır gecikmeli WebRTC sesli arama uygulaması.

## Özellikler
- ✅ Gerçek zamanlı mesajlaşma (Socket.IO)
- ✅ Sıfır gecikmeli sesli arama (WebRTC P2P)
- ✅ Mobil uyumlu arayüz
- ✅ Yazıyor... bildirimi
- ✅ Okunmamış mesaj sayacı
- ✅ Sessiz / aramayı bitir kontrolleri

---

## Kurulum

### 1. Bağımlılıkları yükle
```bash
npm install
```

### 2. Uygulamayı başlat
```bash
node server.js
```

### 3. Bağlan
- **Bilgisayar:** http://localhost:3000
- **Aynı ağdaki telefon:** http://<BİLGİSAYARIN_IP>:3000

> IP adresini öğrenmek için: `ipconfig` (Windows) veya `ifconfig` / `ip a` (Linux/Mac)

---

## Kullanım

1. Her cihazdan aynı adrese gir
2. Kullanıcı adı gir → Giriş Yap
3. Sol panelde çevrimiçi arkadaşlar görünür
4. Birine tıkla → mesajlaş veya 📞 ile ara

## Sesli Arama
WebRTC kullandığı için ses doğrudan cihazlar arasında gider (peer-to-peer). Sunucu sadece sinyal taşır. Gecikme minimumdur.

> ⚠️ Farklı ağlardan (internet üzerinden) bağlanmak için sunucunun public IP'si olması veya bir VPS'e deploy edilmesi gerekir.
