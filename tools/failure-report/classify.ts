import type { Diagnosis } from './types.ts'

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')

export function stripAnsi(text: string): string {
  return text.replace(ANSI, '')
}

function extractLocator(message: string): string | undefined {
  const fromLine = /^\s*Locator:\s*(.+)$/m.exec(message)
  if (fromLine) return fromLine[1].trim()
  const fromWaiting = /waiting for\s+(getBy\w+\(.+?\)|locator\(.+?\))/s.exec(message)
  return fromWaiting?.[1].replace(/\s+/g, ' ').trim()
}

/**
 * Playwright hata metnini kural tabanlı olarak sınıflandırır. Sıra önemlidir:
 * daha belirgin işaretler daha genel olanlardan önce denenir.
 */
export function classifyFailure(rawMessage: string): Diagnosis {
  const message = stripAnsi(rawMessage)
  const locator = extractLocator(message)

  if (/strict mode violation/i.test(message)) {
    return {
      category: 'birden-fazla-eslesme',
      title: 'Seçici birden fazla öğeyle eşleşti',
      hint: 'Seçiciyi daraltın (rol + ad, `exact: true` veya bir kapsayıcı içinde arama); sayfaya yeni bir benzer öğe eklenmiş olabilir.',
      locator,
    }
  }
  if (/net::ERR_|ECONNREFUSED|ERR_CONNECTION|connection refused/i.test(message)) {
    return {
      category: 'sunucu-erisilemiyor',
      title: 'Uygulamaya ulaşılamadı',
      hint: 'Geliştirme sunucusunun çalıştığını ve `baseURL` ile portun eşleştiğini kontrol edin.',
    }
  }
  if (/target (page|context|browser).*(closed|crashed)|browser has been closed/i.test(message)) {
    return {
      category: 'tarayici-kapandi',
      title: 'Tarayıcı veya sayfa test bitmeden kapandı',
      hint: 'Testin `await` edilmeyen bir adımı olabilir; ya da sayfa çöktü. Ekran görüntüsü ve izleme (trace) dosyasına bakın.',
    }
  }
  if (/Test timeout of \d+ms exceeded/i.test(message) && !/waiting for/i.test(message)) {
    return {
      category: 'test-zaman-asimi',
      title: 'Testin toplam süresi aşıldı',
      hint: 'Test çok adımlı veya bir adım takılıyor. Hangi adımda beklediğini kod çerçevesinden bulun; süreyi artırmak son çaredir.',
    }
  }
  if (
    /element\(s\) not found/i.test(message) ||
    /waiting for (getBy\w+|locator)\(/i.test(message) ||
    /resolved to 0 elements/i.test(message)
  ) {
    return {
      category: 'oge-bulunamadi',
      title: 'Beklenen öğe sayfada bulunamadı',
      hint: 'Metin, etiket veya rol değişmiş ya da öğe henüz çizilmemiş olabilir. Seçiciyi arayüzdeki güncel metinle karşılaştırın; önceki adım (örneğin bir kayıt) başarısız olduysa öğe hiç oluşmamıştır.',
      locator,
    }
  }
  if (/intercepts pointer events|element is not (visible|enabled|stable)|not receiving pointer events/i.test(message)) {
    return {
      category: 'oge-tiklanamaz',
      title: 'Öğe bulundu ama etkileşime geçilemedi',
      hint: 'Üstünü örten bir katman, devre dışı bir düğme veya animasyon olabilir. Ekran görüntüsünde öğenin üstünü kontrol edin.',
      locator,
    }
  }
  if (/expect\(.+\)\.\w+/.test(message) && /Expected|Received/.test(message)) {
    return {
      category: 'beklenti-uyusmadi',
      title: 'Beklenen değer ile gerçek değer farklı',
      hint: 'Uygulama çalıştı ama farklı bir sonuç üretti. "Expected" ve "Received" satırlarını karşılaştırın; hata uygulamada mı testte mi karar verin.',
      locator,
    }
  }
  return {
    category: 'bilinmeyen',
    title: 'Sınıflandırılamayan hata',
    hint: 'Kural tabanlı sınıflandırıcı bu hatayı tanımadı. Ham hata metnini ve izleme dosyasını inceleyin.',
    locator,
  }
}
