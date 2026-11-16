import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const browser = await chromium.launch({channel:'msedge',headless:true});
try {
const page = await browser.newPage({viewport:{width:1440,height:1000},hasTouch:true});
await page.goto('http://127.0.0.1:4301/shop', {waitUntil:'domcontentloaded'});
await page.locator('.productsContainer[aria-busy="false"]').waitFor();
const cards=page.locator('.productCard');
for(let i=0;i<Math.min(6,await cards.count());i++) await cards.nth(i).locator('.cart-action').click();
// Navigate with the existing Angular router, preserving the session cart.
await page.evaluate(()=>{
const a=document.createElement('a');a.href='/cart'; a.id='verify-cart-link'; a.textContent='Cart';document.body.append(a);
a.addEventListener('click',e=>{e.preventDefault(); const app=ng.getComponent(document.querySelector('app-root'));app.router.navigateByUrl('/cart');});
});
await page.locator('#verify-cart-link').click();
await page.locator('#verify-cart-link').evaluate(el=>el.remove());
await page.locator('.summary-panel[aria-busy="false"]').waitFor();
assert.equal(await page.locator('app-header').count(),1);
assert.equal(await page.locator('app-cart app-header').count(),0);
assert.equal(await page.locator('.checkout-error').count(),0);
await mkdir('tmp/cart',{recursive:true});
for(const width of [1440,1024,768,430,375]){
 await page.setViewportSize({width,height:1000});await page.waitForTimeout(400);
 assert.equal(await page.locator('.product-slide:not([inert])').count(),width<=760?1:2);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${width}`);
 assert.ok(await page.locator('.back-link').evaluate(e=>e.getBoundingClientRect().top>=120), 'Cart below header');
 const columns=await page.locator('.cart-layout').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length);
 assert.equal(columns,width<=760?1:2);
 await page.screenshot({path:`tmp/cart/${width}.png`,fullPage:true});
 console.log(`PASS ${width}px: product count, columns, overflow`);
}
await page.setViewportSize({width:1440,height:1000});await page.waitForTimeout(400);
const first=page.locator('.product-slide:not([inert])').first();
const inc=first.getByRole('button',{name:'Increase quantity',exact:true});
if(await inc.isEnabled()){await inc.click();assert.equal(await first.locator('output').textContent(),'2');}
await page.getByRole('button',{name:'Next cart products',exact:true}).click();
assert.ok((await page.locator('.slide-status').textContent()).includes('3'));
await page.getByRole('button',{name:'Previous cart products',exact:true}).click();
await page.locator('.carousel').evaluate(el=>{
 for(const [name,key,x] of [['touchstart','touches',260],['touchend','changedTouches',80]]) {
  const event=new Event(name,{bubbles:true});Object.defineProperty(event,key,{value:[{clientX:x,clientY:200}]});el.dispatchEvent(event);
 }
});
assert.ok((await page.locator('.slide-status').textContent()).includes('3'));
await page.getByRole('button',{name:'Previous cart products',exact:true}).click();
await first.getByRole('button',{name:/Delete/}).click();
assert.equal(await page.locator('.product-slide').count(),5);
page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Clear cart',exact:true}).click();
assert.equal(await page.locator('.product-slide').count(),5);
page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Clear cart',exact:true}).click();
await page.locator('#empty-title').waitFor();
assert.equal(await page.getByRole('button',{name:'Checkout',exact:true}).isDisabled(),true);
console.log('PASS live catalog, one global header, quantities, product paging, delete, clear confirmation, empty cart');
}finally{await browser.close();}
