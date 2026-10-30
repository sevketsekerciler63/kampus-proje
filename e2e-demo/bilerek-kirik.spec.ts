import { expect, test } from '@playwright/test'

// Bu senaryolar BİLEREK başarısız olur; hata raporlayıcının çıktısını göstermek için vardır.
// Çalıştırma: npm run test:e2e:demo  (ana test paketine dahil değildir)

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('olmayan bir başlık görünür olmalı (öğe bulunamadı)', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Bu başlık sayfada yok' })).toBeVisible()
})

test('olmayan bir düğmeye tıklanır (tıklama beklerken zaman aşımı)', async ({ page }) => {
  await page.getByRole('button', { name: 'Olmayan düğme' }).click({ timeout: 2000 })
})

test('sayfa başlığı yanlış beklenir (beklenti uyuşmazlığı)', async ({ page }) => {
  await expect(page).toHaveTitle('Gerçekte olmayan sayfa başlığı')
})

test('geniş seçici birden fazla öğeyle eşleşir (strict mode)', async ({ page }) => {
  await page.getByRole('button').click({ timeout: 2000 })
})
