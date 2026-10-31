import { chromium } from 'file:///C:/Users/itang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { readFile,writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('./',import.meta.url));
const sites=[
  {id:'resizepixel',name:'ResizePixel',url:'https://www.resizepixel.com/edit/'},
  {id:'img2go',name:'Img2Go',url:'https://www.img2go.com/crop-image'},
  {id:'polarr',name:'Polarr',url:'https://photoeditor.polarr.co/'},
  {id:'photopea',name:'Photopea',url:'https://www.photopea.com/#%7B%7D'},
];
const browser=await chromium.launch({channel:'chrome',headless:true});
const results=[];
try {
  for(let i=0;i<sites.length;i+=2) await Promise.all(sites.slice(i,i+2).map(async site=>{
    const page=await browser.newPage({viewport:{width:1440,height:1000},locale:'en-US',deviceScaleFactor:1});
    try{
      await page.goto(site.url,{waitUntil:'commit',timeout:25000});
      await page.waitForFunction(()=>document.body?.innerText.length>60,{timeout:25000});
      if(site.id==='resizepixel'){
        const sample=page.getByRole('link',{name:'Edit a sample image',exact:true});
        if(await sample.isVisible().catch(()=>false)){await sample.click();await page.waitForTimeout(2500);}
        const crop=page.getByRole('link',{name:'Crop',exact:true}).first();
        if(await crop.isVisible().catch(()=>false)){await crop.click();await page.waitForTimeout(600);}
      }
      if(site.id==='photopea'){
        const start=page.getByRole('button',{name:/Start using Photopea/i}).first();
        if(await start.isVisible().catch(()=>false)){await start.click();await page.waitForTimeout(2500);}
      }
      await page.screenshot({path:root+`screenshots/${site.id}.png`,timeout:15000});
      const evidence=await page.evaluate(()=>({title:document.title,url:location.href,background:getComputedStyle(document.body).backgroundColor,text:document.body.innerText.slice(0,1600),buttons:[...document.querySelectorAll('button')].filter(e=>e.getBoundingClientRect().height>0).slice(0,15).map(e=>e.textContent.trim())}));
      results.push({...site,evidence,screenshot:`screenshots/${site.id}.png`});console.log(site.id,JSON.stringify(evidence));
    }catch(error){results.push({...site,error:String(error)});console.log(site.id,String(error));}finally{await page.close();}
  }));
  const previous=JSON.parse(await readFile(root+'sources.json','utf8'));
  previous.additionalCaptures=results;
  await writeFile(root+'sources.json',JSON.stringify(previous,null,2));
}finally{await browser.close();}
