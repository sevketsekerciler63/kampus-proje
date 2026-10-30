# Kampüs Proje — Öğrenci Proje ve Ekip Yönetimi (Demo)

Kampüs Proje, öğrencilerin proje çalışmalarını tek bir tarayıcıda planlamayı göstermeyi amaçlayan bir **React + TypeScript demo uygulamasıdır**. Proje, ekip, görev, aşama, dönem teslimi ve haftalık rapor akışları yerel olarak yönetilir.

> Bu uygulama resmî bir üniversite sistemi değildir. Gerçek kullanıcı hesabı, danışman hesabı, sunucu, veritabanı, uzaktan teslim veya yetkilendirme içermez.

## Nasıl geliştirdim

Bu, bir ders için hazırladığım bir demo. Yapay zekâ asistanıyla birlikte yazdım. Problemi ve kapsamı ben belirledim (genel bir yapılacaklar listesi değil, öğrenci–ekip–danışman–teslim ilişkisi); kodu ve testlerin çoğunu asistan yazdı. Her küçük parçadan sonra testler ve derleme çalıştırıldı. Çalıştırılamayan şeyler README'de "doğrulanmadı" diye geçiyor.

## Teknolojiler

- React 19 + TypeScript
- Vite
- Özel CSS
- Tarayıcı `localStorage` depolaması
- Vitest + React Testing Library
- Playwright E2E testleri (kurulu Google Chrome kanalıyla)

## Kurulum ve çalıştırma

Gereksinim: Güncel bir Node.js ve npm kurulumu.

```bash
npm install
npm run dev
```

Vite geliştirme sunucusu varsayılan olarak terminalde gösterilen yerel adreste açılır; bu projede genellikle `http://127.0.0.1:5173` kullanılır.

## Kontroller

```bash
# Birim ve bileşen testleri
npm test

# Kod kalitesi kontrolü
npm run lint

# Üretim derlemesi
npm run build

# Gerçek tarayıcı E2E testleri
npm run test:e2e
```

31 Ekim 2026'da bu çalışma kopyasında **137 birim/bileşen testi**, **2 gerçek Chrome E2E testi**, lint ve production build başarıyla tamamlandı. Aynı gün `npm audit` iki yüksek seviye uyarı verdi (`vite` 8.3.0–8.3.2 ve `undici`); `npm audit fix` ile `vite` 8.3.5 ve `undici` 8.12.3'e güncellendi, testler ve build yeniden geçti ve sonuç 0 güvenlik açığı oldu. Uyarılar 6 Ekim'deki "0 açık" kaydından sonra yayımlanmıştı, bu yüzden bu sayı zamanla değişebilir.

`src/App.test.tsx` içindeki teslim ve gecikme senaryoları sabit tarihler kullandığı için testler yalnız `Date` değerini 6 Ekim 2026'ya sabitler; aksi halde testler zamanla kırılır.

### Playwright E2E testi

İki Playwright senaryosu vardır: proje oluşturma/yenileme kalıcılığını ve iki aynı-origin sekmeden yapılan eşzamanlı görev kayıtlarının Web Locks altında kaybolmadığını kontrol eder.

```bash
npm run test:e2e
```

Playwright yapılandırması sistemde kurulu Google Chrome kanalını kullanır. Bu çalışma ortamındaki son koşuda iki senaryo da başarılıdır.

## Hata raporlayıcı (E2E testleri için)

Playwright testi başarısız olduğunda `test-reports/hata-raporu.md` dosyası üretilir. Her başarısız test için:

- **Kural tabanlı tanı:** hata metni sekiz kategoriden birine ayrılır (öğe bulunamadı, birden fazla eşleşme, beklenti uyuşmazlığı, sunucuya ulaşılamadı vb.), seçici ayıklanır ve ilk bakılacak yer önerilir. Bu kısım API anahtarı gerektirmez ve birim testleriyle doğrulanır (`tools/failure-report/`).
- **Kanıt:** hata metni, kod çerçevesi, ekran görüntüsü ve izleme (trace) dosyası bağlantıları.
- **Yeniden çalıştırma komutu:** yalnızca o testi çalıştıran hazır komut.

Raporu görmek için bilerek kırık senaryoları çalıştırın (ana test paketine dahil değildir):

```bash
npm run test:e2e:demo
```

Örnek çıktı: [docs/ornek-hata-raporu/hata-raporu.md](docs/ornek-hata-raporu/hata-raporu.md)

**İsteğe bağlı yapay zekâ özeti:** `ANTHROPIC_API_KEY` ortam değişkenini ayarlayıp `FAILURE_REPORT_AI=1` ile çalıştırırsanız her hata için Claude kısa bir Türkçe özet ekler (varsayılan model `claude-opus-5-5`, `FAILURE_REPORT_MODEL` ile değiştirilebilir). Anahtar yalnızca ortamdan okunur, depoya yazılmaz; bayrak açık değilse hiçbir istek gönderilmez ve her istek ücretlidir. Bu kısım birim testlerinde **sahte (mock) yanıtla** doğrulanmıştır; gerçek API ile uçtan uca denenmedi.

## Kısa demo akışı

1. **Yeni proje** oluşturun; başlık ve açıklama alanlarını doldurun.
2. Proje kartından **Çalışma alanını açın**.
3. **Ekip** sekmesinde yerel ekip üyeleri ekleyin.
4. **Görevler** sekmesinde sorumlu, öncelik ve isteğe bağlı hedef tarihi olan görevler oluşturun; görev durumunu güncelleyin.
5. **Proje Aşamaları** sekmesinde aşama ve teslim tarihi ekleyin, tamamlanma durumunu izleyin.
6. **Teslimler** sekmesinde dönem teslimi oluşturun, sorumlu ve teslim durumunu belirleyin.
7. **Raporlar** sekmesinde haftalık rapor taslağı oluşturun, demo incelemeye gönderin; demo danışman kararı ve geri bildirimini görün.
8. İsterseniz projeyi silmeden **arşivleyin**; arşiv görünümünden yeniden etkinleştirin.

## Modüller ve davranışlar

### Projeler

- Proje oluşturma, düzenleme, listeleme ve geri alınabilir arşivleme
- Aktif ve arşivlenmiş projeleri ayrı görüntüleme
- Çalışma alanındaki kayıtları seçili proje ile ilişkilendirme

### Ekip ve görevler

- Yerel ekip üyesi kaydı
- Görev oluşturma, düzenleme, arama ve filtreleme
- `Yapılacak`, `Devam ediyor` ve `Tamamlandı` görev durumları
- Öncelik, sorumlu ve isteğe bağlı hedef tarihi izleme

### Proje aşamaları ve Dönem Teslim Merkezi

- Aşama/teslim başlığı, açıklaması, sorumlusu ve teslim tarihi
- Teslim durumunu güncelleme
- Geciken ve geç tamamlanan kayıtları görünür kılma
- Teslim kayıtlarını yalnız seçili proje kapsamında gösterme

### Haftalık raporlar

- Hafta başlangıcı, tamamlanan işler, engeller veya **“Engel yok”** seçeneği ve gelecek hafta planı
- İsteğe bağlı kanıt bağlantısı; yalnız `http` ve `https` bağlantıları kabul edilir
- Taslak, gönderildi, incelendi ve düzeltme istendi durumları
- Yeni rapor sürümü oluştururken önceki sürüm bağlantısını koruma
- **Demo danışman** incelemesi ve geri bildirimi; gerçek kişi, hesap veya onay değildir

### Kullanılabilirlik ve hata davranışları

- Form doğrulama mesajları ve ilk hatalı alana odaklanma
- Klavyeyle sekme gezinmesi için erişilebilir etiketler
- Yerel depolama okunamadığında kullanıcıya hata mesajı ve yeniden deneme seçeneği

## Veri saklama ve güvenlik kapsamı

- Proje, ekip, görev, aşama, teslim ve rapor kayıtları yalnızca kullanılan tarayıcının `localStorage` alanında tutulur.
- Kayıtlar cihazlar veya tarayıcılar arasında paylaşılmaz ve başka kullanıcılarla eşzamanlanmaz.
- Tarayıcı verileri temizlenirse, farklı tarayıcı profili kullanılırsa veya depolama engellenirse kayıtlar erişilemez ya da silinebilir.
- Uygulama, bozuk yerel kaydı algıladığında yeni yazmayı reddederek mevcut ham verinin üzerine yazmaktan kaçınır. Bu, yedekleme veya veri kurtarma garantisi değildir.
- Bu depolama yöntemi hassas, kişisel veya resmî akademik veri için uygun değildir. Gerçek kullanım için sunucu taraflı erişim denetimi, kimlik doğrulama, güvenli veritabanı, yedekleme ve gizlilik süreçleri gerekir.

## Bilinen sınırlar

- Backend, sunucu API'si, gerçek veritabanı veya bulut eşzamanlaması yoktur.
- Giriş, kullanıcı profili, gerçek ekip daveti, rol/yetki kontrolü ve kimlik doğrulama yoktur.
- Gerçek danışman hesabı, bildirim, uzaktan onay veya resmî teslim işlemi yoktur.
- Çok kullanıcılı eşzamanlı çalışma ve cihazlar arası veri paylaşımı yoktur.
- E2E testleri sistemde kurulu Google Chrome gerektirir; GitHub Actions iş akışı lint, birim testleri ve production build'i çalıştırır, E2E testlerini çalıştırmaz.
