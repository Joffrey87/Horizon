import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

mkdirSync('/tmp/shots', { recursive: true })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(String(e)))

const routes = [
  ['/', 'accueil'], ['/projets', 'projets'], ['/priorites', 'priorites'],
  ['/domaines', 'domaines'], ['/temps', 'temps'], ['/idees', 'idees'],
  ['/habitudes', 'habitudes'], ['/revues', 'revues'], ['/espace', 'espace'],
  ['/parametres', 'parametres'],
]

// La démo est une SPA : on charge /demo.html puis on navigue côté client
await page.goto('http://localhost:5199/demo.html', { waitUntil: 'networkidle' })
for (const [path, name] of routes) {
  await page.evaluate((p) => window.history.pushState({}, '', p), path)
  await page.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate')))
  await page.waitForTimeout(900)
  await page.screenshot({ path: `/tmp/shots/${name}.png`, fullPage: name !== 'espace' })
  console.log('shot:', name)
}

console.log('console errors:', errors.length ? errors.slice(0, 10) : 'aucune')
await browser.close()
