import { chromium } from 'file:///C:/Users/itang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { readFile,writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('./',import.meta.url));
const configured=process.env.HTTPS_PROXY||process.env.HTTP_PROXY;
let proxy;
if(configured){const p=new URL(configured);proxy={server:`${p.protocol}//${p.hostname}${p.port?':'+p.port:''}`};if(p.username)proxy.username=decodeURIComponent(p.username);if(p.password)proxy.password=decodeURIComponent(p.password);}
const browser=await chromium.launch({channel:'chrome',headless:true,proxy});
const sites=[{id:'photopea',url:'https://www.photopea.com/#%7B%7D'},{id:'resizepixel',url:'https://www.resizepixel.com/edit?sample=true'},{id:'befunky',url:'https://www.befunky.com/create/'},{id:'polarr',url:'https://photoeditor.polarr.co/'}];
const captures=[];
try{
  for(let i=0;i<sites.length;i+=2) await Promise.all(sites.slice(i,i+2).map(async site=>{
    const page=await browser.newPage({viewport:{width:1440,height:1000},locale:'en-US'});
    try{
      await page.goto(site.url,{waitUntil:'domcontentloaded',timeout:35000});
      await page.waitForTimeout(2000);
      if(site.id==='photopea'){
        const newProject=page.getByRole('button',{name:/New Project/}).first();
        await newProject.waitFor({state:'visible',timeout:15000});await newProject.click();
        const create=page.getByRole('button',{name:/^Create$/}).first();await create.waitFor({state:'visible',timeout:10000});await create.click();
        await page.waitForTimeout(1200);
      }
      if(site.id==='resizepixel'){
        await page.waitForFunction(()=>[...document.images].some(i=>i.complete&&i.naturalWidth>500),{timeout:15000});
        await page.getByRole('link',{name:'Crop',exact:true}).click();await page.waitForTimeout(700);
      }
      if(site.id==='polarr'){
        const skip=page.getByText('Skip',{exact:true});if(await skip.isVisible().catch(()=>false))await skip.click();
        const sample=page.getByRole('button',{name:'Open sample photo',exact:true});await sample.waitFor({state:'visible',timeout:12000});await sample.click();await page.waitForTimeout(3000);
      }
      const screenshot=`screenshots/${site.id}-editor.png`;
      await page.screenshot({path:root+screenshot,timeout:12000});
      const evidence=await page.evaluate(()=>({title:document.title,url:location.href,text:document.body.innerText.slice(0,1800),background:getComputedStyle(document.body).backgroundColor}));
      captures.push({...site,screenshot,evidence});console.log(site.id,JSON.stringify(evidence));
    }catch(error){captures.push({...site,error:String(error)});console.log(site.id,String(error));}finally{await page.close();}
  }));
  const data=JSON.parse(await readFile(root+'sources.json','utf8'));data.editorCaptures=captures;await writeFile(root+'sources.json',JSON.stringify(data,null,2));
}finally{await browser.close();}
