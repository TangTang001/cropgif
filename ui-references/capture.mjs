import { chromium } from 'file:///C:/Users/itang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('./', import.meta.url));
await mkdir(root+'screenshots', { recursive: true });
const sites = [
  { id:'squoosh', name:'Squoosh', url:'https://squoosh.app/' },
  { id:'iloveimg', name:'iLoveIMG', url:'https://www.iloveimg.com/crop-image' },
  { id:'pixlr', name:'Pixlr Editor', url:'https://pixlr.com/editor/' },
  { id:'photopea', name:'Photopea', url:'https://www.photopea.com/' },
  { id:'befunky', name:'BeFunky', url:'https://www.befunky.com/create/' },
  { id:'ezgif', name:'Ezgif', url:'https://ezgif.com/crop' },
];
const browser = await chromium.launch({ channel:'chrome', headless:true });
const results = [];
try {
  for (let i=0; i<sites.length; i+=2) {
    await Promise.all(sites.slice(i,i+2).map(async site => {
      const page = await browser.newPage({ viewport:{width:1440,height:1000},locale:'en-US',deviceScaleFactor:1 });
      try {
        await page.goto(site.url,{waitUntil:'domcontentloaded',timeout:45000});
        await page.waitForTimeout(2200);
        const reject = page.getByRole('button',{name:/^(Reject all|Reject All Cookies|Decline all)$/i}).first();
        if (await reject.isVisible().catch(()=>false)) await reject.click({timeout:1500}).catch(()=>{});
        if (site.id==='photopea') {
          const start=page.getByRole('button',{name:/Start using Photopea/i}).first();
          if (await start.isVisible().catch(()=>false)) { await start.click(); await page.waitForTimeout(1600); }
        }
        if (site.id==='squoosh') {
          const sample=page.getByRole('img',{name:'Artwork',exact:true}).first();
          if (await sample.isVisible().catch(()=>false)) { await sample.click(); await page.waitForTimeout(2800); }
        }
        await page.screenshot({path:root+`screenshots/${site.id}.png`});
        const evidence = await page.evaluate(()=>({title:document.title,url:location.href,background:getComputedStyle(document.body).backgroundColor,text:document.body.innerText.slice(0,2300),buttons:[...document.querySelectorAll('button')].filter(e=>e.getBoundingClientRect().height>0).slice(0,18).map(e=>e.textContent.trim()),images:[...document.images].slice(0,9).map(e=>e.alt)}));
        results.push({...site,evidence,screenshot:`screenshots/${site.id}.png`});
        console.log(site.id,JSON.stringify(evidence));
      } catch(error) { results.push({...site,error:String(error)}); console.log(site.id,String(error)); }
      finally { await page.close(); }
    }));
  }
  await writeFile(root+'sources.json',JSON.stringify({capturedAt:new Date().toISOString(),viewport:'1440x1000',note:'Live public pages; no private images uploaded; editor states only where available without login',sites:results},null,2));
} finally { await browser.close(); }
