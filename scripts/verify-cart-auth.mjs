import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4301/shop',{waitUntil:'domcontentloaded'});
 await page.locator('.productsContainer[aria-busy="false"]').waitFor();
 const add=page.locator('.cart-action').first();
 await add.click();
 const modal=page.locator('app-cart-login-dialog dialog');
 await modal.waitFor({state:'visible'});
 assert.equal(new URL(page.url()).pathname,'/shop');
 assert.match(await modal.textContent(),/Please log in or create an account to add products to your cart\./);
 assert.equal(await add.getAttribute('aria-busy'),'false');
 await modal.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.locator('.cart-toggle').click();
 const drawer=page.locator('#cart-sidebar');
 await drawer.getByText('Your Cart Is Locked',{exact:true}).waitFor();
 assert.equal(await drawer.locator('.cart-footer,.cart-line').count(),0);
 assert.equal(await drawer.getByRole('link',{name:'Create Account',exact:true}).getAttribute('href'),'/signup');
 await drawer.getByRole('button',{name:'Close cart',exact:true}).click();
 await drawer.waitFor({state:'hidden'});
 await add.click();await modal.getByRole('button',{name:'Log In',exact:true}).click();
 await page.waitForURL('**/login?returnUrl=%2Fcart');
 for(const route of ['/cart','/checkout']) {
  await page.goto('http://127.0.0.1:4301'+route,{waitUntil:'domcontentloaded'});
  await page.waitForURL('**/login?returnUrl='+encodeURIComponent(route));
 }
 // Simulate auth state locally to exercise the UI without credentials or backend writes.
 await page.goto('http://127.0.0.1:4301/shop',{waitUntil:'domcontentloaded'});
 await page.locator('.productsContainer[aria-busy="false"]').waitFor();
 const session = async id => page.locator('app-cart-login-dialog').evaluate((el,id)=>{
   const auth=ng.getComponent(el).cart.auth;
   auth.sessionState.set(id ? {user:{id,user_metadata:{},email:'test@example.com'}} : null);
 },id);
 await session('cart-browser-user-a');
 await add.click();
 await page.locator('.cart-toggle').click();
 await drawer.locator('.cart-line').waitFor();
 await drawer.locator('.quantity-plus').click();
 assert.equal(await drawer.locator('.quantity-value').textContent(),'2');
 await session(null);
 await drawer.waitFor({state:'hidden'});
 await session('cart-browser-user-b');
 await page.locator('.cart-toggle').click();
 await drawer.getByText('Your cart is currently empty.').waitFor();
 assert.equal(await drawer.locator('.cart-line').count(),0);
 console.log('PASS simulated authenticated add, quantity change, logout closes drawer, next user has empty cart');
 await drawer.getByRole('button',{name:'Close cart',exact:true}).click();
 await drawer.waitFor({state:'hidden'});
 await page.locator('app-root').evaluate(el=>ng.getComponent(el).router.navigateByUrl('/cart'));
 await page.waitForURL('**/cart');
 await session(null);
 await page.waitForURL('**/login?returnUrl=%2Fcart');
 console.log('PASS active cart redirects on session loss');
 assert.deepEqual(errors,[]);
 console.log('PASS guest popup, no busy animation, Cancel, existing locked drawer, auth links, protected routes and return URLs');
} finally { await browser.close(); }
