export interface FailureAttachment {
  name: string
  path: string
  contentType: string
}

export interface TestFailure {
  title: string
  file: string
  line: number
  durationMs: number
  errorMessage: string
  snippet?: string
  attachments: FailureAttachment[]
}

export type DiagnosisCategory =
  | 'birden-fazla-eslesme'
  | 'oge-bulunamadi'
  | 'oge-tiklanamaz'
  | 'beklenti-uyusmadi'
  | 'sunucu-erisilemiyor'
  | 'test-zaman-asimi'
  | 'tarayici-kapandi'
  | 'bilinmeyen'

export interface Diagnosis {
  category: DiagnosisCategory
  title: string
  hint: string
  /** Hatadan ayıklanan seçici, varsa. */
  locator?: string
}
