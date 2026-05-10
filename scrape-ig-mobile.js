const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');
const https = require('https');

const HANDLE = 'powerhouse_nutrition_lugo';
const ASSETS = path.join(__dirname, 'assets', 'instagram');
fs.mkdirSync(ASSETS, { recursive: true });

const dl = (url, dest) => new Promise((res, rej) => {
  const f = fs.createWriteStream(dest);
  https.get(url, r => {
    if (r.statusCode !== 200) { r.resume(); return rej(new Error('HTTP ' + r.statusCode)); }
    r.pipe(f); f.on('finish', () => f.close(() => res(dest)));
  }).on('error', rej);
});

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    ...devices['iPhone 13 Pro'],
    locale: 'es-ES'
  });
  const page = await ctx.newPage();
  const url = `https://www.instagram.com/${HANDLE}/`;
  console.log('->', url);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(()=>{});
  await page.waitForTimeout(5000);

  // Intenta cerrar modal de login si aparece
  await page.evaluate(() => {
    const closeBtn = document.querySelector('[aria-label="Cerrar"], [aria-label="Close"], svg[aria-label="Cerrar"]');
    if (closeBtn) closeBtn.closest('button')?.click();
  }).catch(()=>{});

  await page.waitForTimeout(2000);
  for (let i=0;i<5;i++){ await page.evaluate(()=>scrollBy(0,1000)); await page.waitForTimeout(1500); }

  const data = await page.evaluate(() => {
    const meta = (p)=>document.querySelector(`meta[property="${p}"]`)?.content || document.querySelector(`meta[name="${p}"]`)?.content;
    const title = meta('og:title');
    const desc = meta('og:description');
    const profileImg = meta('og:image') || document.querySelector('header img')?.src || document.querySelector('img[alt*="profile"]')?.src;
    const imgs = Array.from(document.querySelectorAll('img')).map(i=>({src:i.src,alt:i.alt,w:i.naturalWidth,h:i.naturalHeight}))
      .filter(i=>i.src && i.w>=200 && !i.src.includes('rsrc.php'));
    return { title, desc, profileImg, imgs };
  });

  console.log(JSON.stringify({title:data.title, desc:data.desc, profileImg: !!data.profileImg, imgCount: data.imgs.length}, null, 2));

  let n=0;
  if (data.profileImg) { try { await dl(data.profileImg, path.join(ASSETS,'profile.jpg')); n++; } catch(e){console.error('prof:',e.message);} }
  const seen = new Set();
  let i=1;
  for (const im of data.imgs) {
    if (seen.has(im.src)) continue; seen.add(im.src);
    if (i>12) break;
    try { await dl(im.src, path.join(ASSETS, `post-${i}.jpg`)); n++; i++; } catch(e){console.error('img:',e.message);}
  }
  console.log('Downloaded:', n);

  fs.writeFileSync(path.join(__dirname,'profile.json'), JSON.stringify(data, null, 2));
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
