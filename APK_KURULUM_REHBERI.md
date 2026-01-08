# APK ve Mobil Uygulama Dönüşüm Rehberi

Bu projeyi (Bina Yönetim Sistemi) mobil uygulama olarak kullanmanın iki ana yolu vardır. Senin için gerekli altyapıyı hazırladım (PWA).

## 1. Yöntem: PWA (En Kolay ve Önerilen)
Yaptığım değişikliklerle uygulaman artık **PWA (Progressive Web App)** uyumlu!
APK indirmeye gerek kalmadan, doğrudan telefonuna kurabilirsin.

### Nasıl Yapılır?
1. Bu projeyi bir sunucuya yükle (veya localhost'ta çalıştır).
2. Telefondan Chrome (Android) veya Safari (iOS) ile siteye gir.
3. Tarayıcı menüsünden **"Ana Ekrana Ekle" (Add to Home Screen)** seçeneğine tıkla.
4. Artık telefonunda bir uygulama gibi görünecek, tam ekran çalışacak ve "BinaYönetim" adıyla ikonu olacak.

**Avantajları:**
* APK imzalamayla uğraşmazsın.
* Güncelleme yapmak için siteyi güncellemen yeterli, herkesin telefonunda otomatik güncellenir.
* Hem Android hem iOS'ta çalışır.

---

## 2. Yöntem: Gerçek APK Oluşturma (Geliştirici Yolu)
Eğer mutlaka `.apk` dosyası istiyorsan, **Capacitor** kullanarak bu web sitesini paketleyebiliriz. Bilgisayarında `Node.js` ve `Android Studio` kurulu olmalıdır.

### Adım Adım Kurulum

Terminali (CMD veya PowerShell) proje klasöründe aç ve sırasıyla şu komutları yaz:

1. **Projeyi Başlat**
   ```bash
   npm init -y
   ```

2. **Capacitor'ı Yükle**
   ```bash
   npm install @capacitor/core @capacitor/cli @capacitor/android
   ```

3. **Ayarları Yapılandır**
   ```bash
   npx cap init "Bina Yonetim" com.binayonetim.app --web-dir "."
   ```
   *(Burada `--web-dir "."` çok önemli, çünkü dosyaların ana dizinde duruyor.)*

4. **Android Platformunu Ekle**
   ```bash
   npx cap add android
   ```

5. **Dosyaları Eşle**
   ```bash
   npx cap sync
   ```

6. **Projeyi Aç ve APK Üret**
   ```bash
   npx cap open android
   ```
   * Bu komut **Android Studio**'yu açacaktır.
   * Android Studio açılınca uygulamanın yüklenmesini bekle.
   * Üst menüden **Build > Build Bundle(s) / APK(s) > Build APK(s)** yolunu izle.
   * İşlem bitince sağ altta "APK generated successfully" yazısı çıkacak, "locate" diyerek dosyayı alabilirsin.

---

> **Not:** Windows bilgisayarında güvenlik kısıtlamaları (Policy) nedeniyle `npm` komutlarını ben senin adına çalıştıramadım. Bu yüzden yukarıdaki komutları kendi bilgisayarında çalıştırman gerekecek.
