import { describe, expect, it } from 'vitest'
import { renderFailureReport } from './render.ts'
import type { TestFailure } from './types.ts'

const failure: TestFailure = {
  title: 'proje oluşturulur',
  file: 'e2e\\project-persistence.spec.ts',
  line: 9,
  durationMs: 2150,
  errorMessage:
    "Error: expect(locator).toBeVisible() failed\n\nLocator: getByRole('heading', { name: 'X' })\nExpected: visible\nError: element(s) not found",
  snippet: '> 18 |   await expect(heading).toBeVisible()',
  attachments: [
    { name: 'screenshot', path: 'C:\\r\\test-results\\a\\test-failed-1.png', contentType: 'image/png' },
    { name: 'trace', path: 'C:\\r\\test-results\\a\\trace.zip', contentType: 'application/zip' },
  ],
}

describe('renderFailureReport', () => {
  it('başarısız test yokken kısa bir rapor üretir', () => {
    expect(renderFailureReport([])).toContain('Başarısız test yok.')
  })

  it('tanı, konum, yeniden çalıştırma komutu ve ekleri yazar', () => {
    const report = renderFailureReport([failure], {
      relativeTo: (p) => p.replace('C:\\r\\', ''),
      generatedAt: new Date('2026-10-31T10:00:00Z'),
    })
    expect(report).toContain('Başarısız test: 1')
    expect(report).toContain('`e2e/project-persistence.spec.ts:9`')
    expect(report).toContain('Beklenen öğe sayfada bulunamadı')
    expect(report).toContain('npx playwright test e2e/project-persistence.spec.ts:9')
    expect(report).toContain('![screenshot](test-results/a/test-failed-1.png)')
    expect(report).toContain('trace: `test-results/a/trace.zip`')
  })

  it('varsayılan dışı yapılandırmada yeniden çalıştırma komutuna -c ekler', () => {
    const report = renderFailureReport([failure], { configFile: 'playwright.demo.config.ts' })
    expect(report).toContain('npx playwright test -c playwright.demo.config.ts e2e/project-persistence.spec.ts:9')
  })

  it('uzun hata metnini kısaltır', () => {
    const long = { ...failure, errorMessage: `Error: ${'x'.repeat(5000)}` }
    expect(renderFailureReport([long])).toContain('(kısaltıldı)')
  })

  it('yapay zekâ özetini yalnızca verildiğinde ve uyarıyla ekler', () => {
    const without = renderFailureReport([failure])
    expect(without).not.toContain('Yapay zekâ özeti')
    const withSummary = renderFailureReport([failure], {
      aiSummaries: new Map([[failure.title, 'Başlık metni değişmiş olabilir.']]),
    })
    expect(withSummary).toContain('Yapay zekâ özeti')
    expect(withSummary).toContain('doğrulayın')
    expect(withSummary).toContain('Başlık metni değişmiş olabilir.')
  })

  it('tablo hücresinde dikey çizgiyi kaçırır', () => {
    const report = renderFailureReport([{ ...failure, title: 'a | b' }])
    expect(report).toContain('a \\| b')
  })
})
