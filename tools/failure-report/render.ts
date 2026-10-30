import { classifyFailure, stripAnsi } from './classify.ts'
import type { TestFailure } from './types.ts'

const MAX_ERROR_CHARS = 1800

function clip(text: string): string {
  return text.length > MAX_ERROR_CHARS ? `${text.slice(0, MAX_ERROR_CHARS)}\n… (kısaltıldı)` : text
}

function posix(value: string): string {
  return value.replace(/\\/g, '/')
}

export interface RenderOptions {
  /** Rapor dosyasından ek dosyalara göreli yol üretmek için. */
  relativeTo?: (absolutePath: string) => string
  /** Başarısız test başlığına göre isteğe bağlı yapay zekâ özeti. */
  aiSummaries?: Map<string, string>
  generatedAt?: Date
  /** Varsayılan dışındaki Playwright yapılandırma dosyası; yeniden çalıştırma komutuna `-c` olarak eklenir. */
  configFile?: string
}

export function renderFailureReport(failures: TestFailure[], options: RenderOptions = {}): string {
  const date = (options.generatedAt ?? new Date()).toISOString()
  const lines: string[] = ['# Hata raporu', '']

  if (failures.length === 0) {
    lines.push(`Oluşturulma: ${date}`, '', 'Başarısız test yok.')
    return `${lines.join('\n')}\n`
  }

  lines.push(`Oluşturulma: ${date} · Başarısız test: ${failures.length}`, '')
  lines.push('| # | Test | Tanı |', '|---|---|---|')
  failures.forEach((failure, index) => {
    const diagnosis = classifyFailure(failure.errorMessage)
    lines.push(`| ${index + 1} | ${failure.title.replace(/\|/g, '\\|')} | ${diagnosis.title} |`)
  })
  lines.push('')

  failures.forEach((failure, index) => {
    const diagnosis = classifyFailure(failure.errorMessage)
    const location = `${posix(failure.file)}:${failure.line}`
    lines.push(`## ${index + 1}. ${failure.title}`, '')
    lines.push(`- **Konum:** \`${location}\``)
    lines.push(`- **Süre:** ${failure.durationMs} ms`)
    lines.push(`- **Tanı:** ${diagnosis.title} (\`${diagnosis.category}\`)`)
    if (diagnosis.locator) lines.push(`- **Seçici:** \`${diagnosis.locator}\``)
    lines.push(`- **Önerilen ilk adım:** ${diagnosis.hint}`)
    const configFlag = options.configFile ? ` -c ${options.configFile}` : ''
    lines.push(`- **Yeniden çalıştır:** \`npx playwright test${configFlag} ${posix(failure.file)}:${failure.line}\``, '')

    lines.push('### Hata', '', '```text', clip(stripAnsi(failure.errorMessage).trim()), '```', '')
    if (failure.snippet) {
      lines.push('### Kod çerçevesi', '', '```text', stripAnsi(failure.snippet).trimEnd(), '```', '')
    }

    const images = failure.attachments.filter((a) => a.contentType.startsWith('image/'))
    const others = failure.attachments.filter((a) => !a.contentType.startsWith('image/'))
    const toPath = (absolute: string) => posix(options.relativeTo ? options.relativeTo(absolute) : absolute)
    if (images.length > 0 || others.length > 0) {
      lines.push('### Ekler', '')
      for (const image of images) lines.push(`![${image.name}](${toPath(image.path)})`, '')
      for (const other of others) lines.push(`- ${other.name}: \`${toPath(other.path)}\``)
      if (others.length > 0) lines.push('')
    }

    const summary = options.aiSummaries?.get(failure.title)
    if (summary) {
      lines.push('### Yapay zekâ özeti', '', '> Otomatik üretildi; kural tabanlı tanının yerine geçmez, doğrulayın.', '', summary.trim(), '')
    }
  })

  return `${lines.join('\n').trimEnd()}\n`
}
