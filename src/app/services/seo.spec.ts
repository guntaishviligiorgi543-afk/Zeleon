import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Meta } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Seo } from './seo';

@Component({ template: 'Unchanged page' })
class Page {}

describe('Route indexing metadata', () => {
  afterEach(() => {
    document.querySelectorAll('link[rel="canonical"], meta[name="robots"]').forEach(element => element.remove());
  });
  async function setup() {
    TestBed.configureTestingModule({ providers: [provideRouter([
      ...['', 'shop', 'our-story', 'contact', 'login', 'signup', 'profile/info', 'cart', 'checkout', 'manager/users', 'admin/users', 'support', 'staff-auth', 'forgot-password', 'reset-password', 'auth/callback', 'rate-support/:id', 'product/:id'].map(path => ({ path, component: Page })),
    ])] });
    const seo = TestBed.inject(Seo);
    seo.start();
    return { seo, harness: await RouterTestingHarness.create(), meta: TestBed.inject(Meta) };
  }

  it('updates noindex for every private/auth route and restores public indexing after navigation', async () => {
    const { harness, meta } = await setup();
    for (const path of ['/login', '/signup', '/profile/info', '/cart', '/checkout', '/manager/users', '/admin/users', '/support', '/staff-auth', '/forgot-password', '/reset-password', '/auth/callback', '/rate-support/test']) {
      await harness.navigateByUrl(path);
      expect(meta.getTag('name="robots"')?.content).toBe('noindex, nofollow');
      expect(document.querySelector('link[rel="canonical"]')).toBeNull();
    }
    for (const path of ['/', '/shop', '/our-story', '/contact']) {
      await harness.navigateByUrl(path);
      expect(meta.getTag('name="robots"')?.content).toBe('index, follow');
      expect(document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toBe('https://zeleon.store' + (path === '/' ? path : path + '/'));
    }
  });

  it('canonicalizes ID and slug product routes only after the public product has loaded', async () => {
    const { seo, harness, meta } = await setup();
    await harness.navigateByUrl('/product/lemon');
    expect(meta.getTag('name="robots"')?.content).toContain('noindex');
    seo.productLoaded(12);
    expect(meta.getTag('name="robots"')?.content).toBe('index, follow');
    expect(document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toBe('https://zeleon.store/product/12/');
    await harness.navigateByUrl('/product/lemon?campaign=spring');
    expect(meta.getTag('name="robots"')?.content).toBe('index, follow');
    expect(document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toBe('https://zeleon.store/product/12/');
    await harness.navigateByUrl('/product/missing');
    seo.productLoaded(null);
    expect(meta.getTag('name="robots"')?.content).toContain('noindex');
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
  });

  it('removes query variants and duplicate canonical tags without indexing feedback intent', async () => {
    const { harness, meta } = await setup();
    const duplicate = document.createElement('link');
    duplicate.rel = 'canonical'; document.head.appendChild(duplicate);
    await harness.navigateByUrl('/shop?category=classic');
    expect(document.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toBe('https://zeleon.store/shop/');
    await harness.navigateByUrl('/?supportChat=private-id');
    expect(meta.getTag('name="robots"')?.content).toContain('noindex');
  });
});
