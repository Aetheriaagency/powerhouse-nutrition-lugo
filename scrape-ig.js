// Scraper IG -> volcado a assets/instagram + profile.json
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const https = require('https');

const HANDLE = process.argv[2];
if (!HANDLE) { console.error('Uso: node scrape-ig.js <handle>'); process.exit(1); }

const ASSETS = path.join(__dirname, 'assets', 'instagram');
fs.mkdirSync(ASSETS, { recursive: true });

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, res => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(dest)));
    }).on('error', reject);
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 }
  });
  const page = await ctx.newPage();
  const url = `https://www.instagram.com/${HANDLE}/`;
  console.log('-> ', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(4000);

  // Meta tags
  const meta = await page.evaluate(() => {
    const get = p => document.querySelector(`meta[property="${p}"]`)?.content || document.querySelector(`meta[name="${p}"]`)?.content || null;
    return {
      title: get('og:title'),
      description: get('og:description'),
      image: get('og:image'),
      url: get('og:url')
    };
  });

  // Scroll para cargar grid
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => window.scrollBy(0, 800));
    await page.waitForTimeout(1200);
  }

  // Imágenes del grid
  const imgs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('article img, main img'))
      .map(i => ({ src: i.src, alt: i.alt, w: i.naturalWidth, h: i.naturalHeight }))
      .filter(i => i.src && i.w >= 150 && !i.src.includes('s150x150'));
  });

  // Foto de perfil (header)
  const profileImg = await page.evaluate(() => {
    const headerImg = document.querySelector('header img');
    return headerImg ? headerImg.src : null;
  });

  console.log('Meta:', meta);
  console.log('Imgs encontradas:', imgs.length);
  console.log('Profile img:', profileImg ? 'sí' : 'no');

  // Descargar perfil
  let downloaded = [];
  if (profileImg) {
    try { await download(profileImg, path.join(ASSETS, 'profile.jpg')); downloaded.push('profile.jpg'); } catch(e){ console.error('profile dl', e.message); }
  }

  // Descargar hasta 12 imágenes únicas
  const seen = new Set();
  let n = 1;
  for (const img of imgs) {
    if (seen.has(img.src)) continue;
    seen.add(img.src);
    if (n > 12) break;
    try {
      const fname = `post-${n}.jpg`;
      await download(img.src, path.join(ASSETS, fname));
      downloaded.push(fname);
      n++;
    } catch(e) { console.error('dl', e.message); }
  }

  fs.writeFileSync(path.join(__dirname, 'profile.json'), JSON.stringify({
    handle: HANDLE,
    meta,
    profileImg,
    images: imgs.slice(0, 20),
    downloaded
  }, null, 2));

  console.log('Descargadas:', downloaded.length);
  await browser.close();
})().catch(e => { console.error('ERROR', e); process.exit(1); });
