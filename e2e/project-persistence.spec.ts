import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
})

test('oluşturulan proje sayfa yenilendiğinde korunur', async ({ page }) => {
  await page.getByLabel('Proje adı').fill('Kampüs Enerji Takibi')
  await page.getByLabel('Problem').fill('Kampüs binalarındaki enerji tüketimi tek ekrandan izlenemiyor.')
  await page.getByLabel('Amaç').fill('Enerji tüketimini proje ekibi için anlaşılır ve izlenebilir hâle getirmek.')
  await page.getByLabel('Kapsam').fill('Bina bazlı tüketim kayıtları ve haftalık proje takibi.')
  await page.getByLabel('Danışman').fill('Dr. Deniz Yılmaz')
  await page.getByRole('button', { name: 'Proje taslağını kaydet' }).click()

  await expect(page.getByText('Proje taslağı bu cihazın tarayıcısına kaydedildi.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Kampüs Enerji Takibi' })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Kampüs Enerji Takibi' })).toBeVisible()
})

test('iki sekmedeki eşzamanlı görev kayıtları kaybolmaz', async ({ page, context }) => {
  const secondPage = await context.newPage()
  await secondPage.goto('/')

  for (const currentPage of [page, secondPage]) {
    await currentPage.getByRole('button', { name: /çalışma alanını aç/i }).click()
    await currentPage.getByRole('tab', { name: 'Görevler' }).click()
    await currentPage.getByRole('button', { name: 'Yeni görev ekle' }).click()
    await currentPage.getByLabel('Ekip sorumlusu').selectOption({ label: 'Demo üye: Ayşe Kaya' })
  }

  await page.getByLabel('Görev başlığı').fill('Birinci sekme görevi')
  await page.getByLabel('Görev açıklaması').fill('Birinci sekmeden aynı anda kaydedilen görev açıklaması.')
  await secondPage.getByLabel('Görev başlığı').fill('İkinci sekme görevi')
  await secondPage.getByLabel('Görev açıklaması').fill('İkinci sekmeden aynı anda kaydedilen görev açıklaması.')

  await Promise.all([
    page.getByRole('button', { name: 'Görevi kaydet' }).click(),
    secondPage.getByRole('button', { name: 'Görevi kaydet' }).click(),
  ])

  await page.reload()
  await page.getByRole('button', { name: /çalışma alanını aç/i }).click()
  await page.getByRole('tab', { name: 'Görevler' }).click()
  await expect(page.getByRole('heading', { name: 'Birinci sekme görevi' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'İkinci sekme görevi' })).toBeVisible()
})
