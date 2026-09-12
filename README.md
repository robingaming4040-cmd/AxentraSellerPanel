# AxentraSellerPanel — REAL

Bu sürüm tek HTML/localStorage prototipinden çıkarılıp Node.js + SQLite tabanlı çalışan bir uygulama iskeletine dönüştürülmüştür.

## Gereksinim
- Node.js 22+

## Kurulum
1. `.env.example` dosyasını `.env` olarak kopyalayın.
2. `AXENTRA_ADMIN_PASSWORD` değerini güçlü bir kurucu şifreyle doldurun.
3. Terminalde proje klasöründe `node server.js` çalıştırın.
4. Tarayıcıdan `http://localhost:3000` açın.

İlk çalıştırmada `data/axentra.sqlite` oluşturulur ve kurucu hesabı oluşturulur.

## Özellikler
- SQLite kalıcı veri tabanı
- Oturum tokenları
- Scrypt ile parola hashleme
- Kayıt/giriş/çıkış API'si
- Yetkili state senkronizasyonu
- Yönetici audit kayıtları
- Mevcut V32 arayüzünün backend bridge'i
- Public store state endpoint'i
- Mobil arayüz ve mevcut mağaza/admin akışları

## Not
Frontend halen mevcut V32 UI/iş mantığını kullanır; backend bridge kalıcı veriyi SQLite'a taşır. Üretim ortamında HTTPS, reverse proxy, rate limit, CSRF/origin politikaları ve gerçek e-posta sağlayıcısı ayrıca yapılandırılmalıdır.
