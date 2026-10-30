import { describe, expect, it, vi } from 'vitest'
import { buildPrompt, summarizeFailures } from './ai-summary.ts'
import type { TestFailure } from './types.ts'

const failure = (title: string): TestFailure => ({
  title,
  file: 'e2e/a.spec.ts',
  line: 3,
  durationMs: 100,
  errorMessage: "Error: expect(locator).toBeVisible() failed\nLocator: getByText('x')\nError: element(s) not found",
  attachments: [],
})

describe('buildPrompt', () => {
  it('ön tanıyı ve hata verisini etiketli bölümlerde taşır', () => {
    const prompt = buildPrompt(failure('t1'))
    expect(prompt).toContain('Beklenen öğe sayfada bulunamadı')
    expect(prompt).toContain('<hata>')
    expect(prompt).toContain('<kod_cercevesi>')
  })

  it('çok uzun hata metnini kırpar', () => {
    const long = { ...failure('t'), errorMessage: 'y'.repeat(20000) }
    expect(buildPrompt(long).length).toBeLessThan(9000)
  })
})

describe('summarizeFailures', () => {
  it('her başarısız test için özeti başlığa göre döndürür', async () => {
    const complete = vi.fn().mockResolvedValue('  Olası neden: metin değişti.  ')
    const result = await summarizeFailures([failure('a'), failure('b')], complete)
    expect(complete).toHaveBeenCalledTimes(2)
    expect(result.get('a')).toBe('Olası neden: metin değişti.')
    expect(result.size).toBe(2)
  })

  it('bir çağrı hata verirse diğerlerine devam eder ve hatayı bildirir', async () => {
    const complete = vi.fn().mockRejectedValueOnce(new Error('ağ hatası')).mockResolvedValueOnce('tamam')
    const onError = vi.fn()
    const result = await summarizeFailures([failure('a'), failure('b')], complete, onError)
    expect(onError).toHaveBeenCalledWith('a', expect.any(Error))
    expect(result.has('a')).toBe(false)
    expect(result.get('b')).toBe('tamam')
  })

  it('boş veya null yanıtı yok sayar', async () => {
    const complete = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce('   ')
    const result = await summarizeFailures([failure('a'), failure('b')], complete)
    expect(result.size).toBe(0)
  })
})
