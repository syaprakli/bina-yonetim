# GitHub'a Yükleme ve Siteyi Yayınlama Rehberi

Web siteni (uygulamanı) GitHub'a yükleyerek hem dosyalarını yedeklemiş olursun hem de **GitHub Pages** sayesinde ücretsiz bir şekilde internet sitesi olarak yayınlayabilirsin.

## 1. Adım: GitHub'da Depo (Repository) Oluşturma
1. [github.com](https://github.com) adresine git ve giriş yap.
2. Sağ üstteki **+** işaretine tıkla ve **"New repository"** seç.
3. **Repository name** kısmına `bina-yonetim` (veya istediğin bir isim) yaz.
4. "Public" seçeneğini işaretle (Ücretsiz yayınlamak için Public olması gerekir).
5. **"Create repository"** butonuna tıkla.

## 2. Adım: Bilgisayardaki Dosyaları Gönderme
Aşağıdaki komutları sırasıyla terminalde (bu klasörde) çalıştır:

1. **Git'i Başlat:**
   ```bash
   git init
   ```

2. **Dosyaları Ekle:**
   ```bash
   git add .
   ```

3. **İlk Kaydı Oluştur:**
   ```bash
   git commit -m "İlk yükleme - PWA özellikli"
   ```

4. **Kendi Depo Adresini Ekle:** (GitHub'da oluşturduğun sayfanın linki, örn: `https://github.com/kullaniciadim/bina-yonetim.git`)
   ```bash
   git remote add origin https://github.com/SENIN_KULLANICI_ADIN/REPO_ADIN.git
   ```

5. **GitHub'a Gönder:**
   ```bash
   git branch -M main
   git push -u origin main
   ```

*(Giriş yapmanı isterse GitHub kullanıcı adı ve şifreni/tokenini gir.)*

---

## 3. Adım: Siteni Yayınlama (GitHub Pages)
Dosyaları yükledikten sonra siteni canlıya almak için:

1. GitHub'daki proje sayfanda üstteki menüden **Settings** (Ayarlar) sekmesine tıkla.
2. Sol menüden **Pages** kısmını bul ve tıkla.
3. **Build and deployment** başlığı altında "Source" kısmını "Deploy from a branch" olarak bırak.
4. **Branch** kısmında `None` yazan yeri **`main`** olarak değiştir ve yanındaki **Save** butonuna tıkla.

**Tebrikler!** 
Birkaç dakika içinde sayfanın üst kısmında sitenin linki belirecek (Örn: `https://senin-Adin.github.io/bina-yonetim/`).

Artık bu linki telefonuna gönderip, siteye girip **"Ana Ekrana Ekle"** diyerek uygulamanı kullanabilirsin.
