import { describe, expect, it } from 'vitest'
import { classifyFailure, stripAnsi } from './classify.ts'

const ESC = String.fromCharCode(27)

describe('classifyFailure', () => {
  it('ANSI renk kodlarını temizler', () => {
    expect(stripAnsi(`${ESC}[31mhata${ESC}[39m`)).toBe('hata')
  })

  it('birden fazla eşleşmeyi tanır ve seçiciyi ayıklar', () => {
    const result = classifyFailure(
      "Error: strict mode violation: getByRole('button', { name: 'Kaydet' }) resolved to 2 elements:\n    1) <button>Kaydet</button>",
    )
    expect(result.category).toBe('birden-fazla-eslesme')
  })

  it('eksik öğe için expect(...).toBeVisible hatasını bulunamadı olarak sınıflar', () => {
    const result = classifyFailure(
      "Error: expect(locator).toBeVisible() failed\n\nLocator: getByRole('heading', { name: 'Olmayan başlık' })\nExpected: visible\nTimeout: 2000ms\nError: element(s) not found",
    )
    expect(result.category).toBe('oge-bulunamadi')
    expect(result.locator).toBe("getByRole('heading', { name: 'Olmayan başlık' })")
  })

  it('tıklama beklerken zaman aşımını bulunamadı olarak sınıflar', () => {
    const result = classifyFailure(
      "Test timeout of 30000ms exceeded.\nError: locator.click: Test timeout of 30000ms exceeded.\nCall log:\n  - waiting for getByRole('button', { name: 'Yeni görev ekle' })",
    )
    expect(result.category).toBe('oge-bulunamadi')
    expect(result.locator).toBe("getByRole('button', { name: 'Yeni görev ekle' })")
  })

  it('öğeyi örten katmanı tıklanamaz olarak sınıflar', () => {
    const result = classifyFailure('<div class="modal"> intercepts pointer events')
    expect(result.category).toBe('oge-tiklanamaz')
  })

  it('beklenti uyuşmazlığını Expected/Received ile tanır', () => {
    const result = classifyFailure(
      "Error: expect(locator).toHaveText(expected) failed\n\nLocator: getByTestId('sayac')\nExpected: \"3\"\nReceived: \"2\"",
    )
    expect(result.category).toBe('beklenti-uyusmadi')
  })

  it('sunucu erişim hatasını tanır', () => {
    expect(classifyFailure('Error: page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:4173/').category).toBe(
      'sunucu-erisilemiyor',
    )
  })

  it('beklenen öğe olmadan toplam süre aşımını ayırır', () => {
    expect(classifyFailure('Test timeout of 30000ms exceeded.').category).toBe('test-zaman-asimi')
  })

  it('tarayıcı kapanmasını tanır', () => {
    expect(classifyFailure('Error: Target page, context or browser has been closed').category).toBe('tarayici-kapandi')
  })

  it('tanımadığı hatayı bilinmeyen olarak bırakır', () => {
    expect(classifyFailure('TypeError: x is not a function').category).toBe('bilinmeyen')
  })
})
