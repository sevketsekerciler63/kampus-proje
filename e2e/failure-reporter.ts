import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { FullConfig, Reporter, TestCase, TestResult } from '@playwright/test/reporter'
import { createClaudeComplete, summarizeFailures } from '../tools/failure-report/ai-summary.ts'
import { renderFailureReport } from '../tools/failure-report/render.ts'
import type { TestFailure } from '../tools/failure-report/types.ts'

interface Options {
  /** Raporun yazılacağı klasör (varsayılan: test-reports). */
  outputDir?: string
}

/**
 * Başarısız testleri toplayıp tek bir Markdown hata raporuna dönüştürür.
 * Yapay zekâ özeti yalnızca FAILURE_REPORT_AI=1 ve ANTHROPIC_API_KEY birlikte
 * ayarlıysa eklenir; aksi hâlde rapor tamamen kural tabanlıdır.
 */
export default class FailureReporter implements Reporter {
  private readonly failures: TestFailure[] = []
  private configFile: string | undefined
  private readonly outputDir: string

  constructor(options: Options = {}) {
    this.outputDir = path.resolve(options.outputDir ?? 'test-reports')
  }

  onBegin(config: FullConfig) {
    this.configFile = config.configFile
  }

  onTestEnd(test: TestCase, result: TestResult) {
    if (result.status !== 'failed' && result.status !== 'timedOut') return
    // Yeniden denemelerde yalnızca son denemeyi raporla.
    if (result.retry < test.retries) return

    const error = result.errors[0] ?? result.error
    this.failures.push({
      title: test.titlePath().slice(2).join(' › ') || test.title,
      file: path.relative(process.cwd(), test.location.file),
      line: test.location.line,
      durationMs: result.duration,
      errorMessage: error?.message ?? 'Hata mesajı alınamadı.',
      snippet: error?.snippet,
      attachments: result.attachments
        .filter((attachment) => attachment.path)
        .map((attachment) => ({
          name: attachment.name,
          path: attachment.path as string,
          contentType: attachment.contentType,
        })),
    })
  }

  async onEnd() {
    await mkdir(this.outputDir, { recursive: true })

    let aiSummaries: Map<string, string> | undefined
    if (this.failures.length > 0 && process.env.FAILURE_REPORT_AI === '1') {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('[hata-raporu] FAILURE_REPORT_AI=1 ama ANTHROPIC_API_KEY yok; yapay zekâ özeti atlandı.')
      } else {
        aiSummaries = await summarizeFailures(this.failures, createClaudeComplete(), (title, error) => {
          console.warn(`[hata-raporu] "${title}" için özet alınamadı:`, error instanceof Error ? error.message : error)
        })
      }
    }

    // Varsayılan yapılandırma dışındaysa yeniden çalıştırma komutuna -c eklenir.
    const configName = this.configFile ? path.basename(this.configFile) : undefined
    const report = renderFailureReport(this.failures, {
      aiSummaries,
      configFile: configName && configName !== 'playwright.config.ts' ? configName : undefined,
      relativeTo: (absolute) => path.relative(this.outputDir, absolute),
    })
    const target = path.join(this.outputDir, 'hata-raporu.md')
    await writeFile(target, report, 'utf8')
    if (this.failures.length > 0) {
      console.log(`[hata-raporu] ${this.failures.length} başarısız test için rapor yazıldı: ${path.relative(process.cwd(), target)}`)
    }
  }
}
