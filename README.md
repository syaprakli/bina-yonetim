# 🏢 Bina Yönetim Sistemi (Building Management System)

Apartman, site ve bina yönetim süreçlerini dijitalleştiren; gelir-gider takibi, aidat yönetimi ve sakinler arası iletişimi kolaylaştıran modern bir web uygulamasıdır.

Bu proje **PWA (Progressive Web App)** teknolojisi ile geliştirilmiştir. Yani hem tarayıcıda çalışır hem de telefonunuza uygulama olarak kurulabilir.

## 🚀 Özellikler

*   **👥 Sakin Yönetimi:** Daire sahipleri ve kiracıların kayıtları, iletişim bilgileri.
*   **💰 Finansal Takip:** Aidat toplama, gider girişi, kasa durumu ve kişisel borçlandırma.
*   **🤖 Yapay Zeka (AI) Desteği:** 
    *   **Fiş Tarama:** Market/bakım fişlerinin fotoğrafını çekin, yapay zeka (Google Gemini) tutarı, tarihi ve kategoriyi otomatik doldursun.
    *   **Asistan:** Yönetimle ilgili sorularınızı yanıtlayan AI asistan.
*   **📊 Raporlama:** Gelir-gider grafikleri, aylık dökümler ve Excel dışa aktarma (Export).
*   **📱 Mobil Uyumlu (PWA):** Telefona indirilebilir, çevrimdışı (offline) çalışabilir arayüz.
*   **📅 Bakım Takvimi:** Asansör, temizlik gibi periyodik bakımların takibi.

## 📦 Kurulum ve Kullanım

### 1. Web Üzerinden Kullanım (Önerilen)
Bu projeyi GitHub Pages üzerinden yayınladıysanız, size verilen linke tıklamanız yeterlidir.
*   **Mobil Uygulama Olarak Yükleme:** Siteyi telefondan (Chrome/Safari) açın -> "Seçenekler" -> "Ana Ekrana Ekle" diyerek telefonunuza kurun.

### 2. Yerel (Local) Kurulum
Projeyi kendi bilgisayarınızda geliştirmek veya çalıştırmak için:
1.  Projeyi indirin: `git clone https://github.com/syaprakli/bina-yonetim.git`
2.  Klasör içinde `index.html` dosyasını bir tarayıcıda açın veya VS Code "Live Server" eklentisi ile çalıştırın.

### 3. APK Oluşturma
Bu projeyi gerçek bir Android uygulamasına (.apk) dönüştürmek isterseniz, proje içindeki **[APK_KURULUM_REHBERI.md](APK_KURULUM_REHBERI.md)** dosyasını inceleyebilirsiniz.

## 🛠️ Teknolojiler
*   **Frontend:** HTML5, CSS3, Vanilla JavaScript
*   **Depolama:** LocalStorage (Veriler tarayıcınızda saklanır, sunucu gerektirmez)
*   **AI:** Google Gemini API
*   **Kütüphaneler:** Chart.js (Grafikler), SheetJS (Excel), FontAwesome (İkonlar)

## 🔒 Güvenlik Notu
Bu uygulama verileri **tarayıcınızın yerel hafızasında (LocalStorage)** saklar. Verileriniz herhangi bir dış sunucuya gönderilmez (AI özellikleri hariç). Tarayıcı geçmişini temizlerseniz verileriniz silinebilir, bu yüzden "Ayarlar" menüsünden düzenli **Yedek (JSON)** almayı unutmayın.

---
*Geliştirici: [Sefa Yapraklı]*
