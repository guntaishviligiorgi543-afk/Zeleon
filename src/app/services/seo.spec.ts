import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Meta } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Seo } from './seo';
import { Product } from '../models/product';

const product: Product = { id: 12, name: 'Test Energy', slug: 'lemon', price: 3.5, currency: 'GEL', category: 'classic', categoryName: 'Classic', image: 'https://example.com/drink.png' };

@Component({ template: 'Unchanged page' })
class Page {}

describe('Route indexing metadata', () => {
  afterEach(() => {
    document.querySelectorAll('link[rel="canonical"], meta[name="robots"], script[data-zeleon-seo], meta[property^="og:"], meta[name^="twitter:"], meta[name="description"]').forEach(element => element.remove());
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
    seo.productLoaded(product);
    expect(meta.getTag('name="robots"')?.content).toBe('index, follow');
    expect(document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toBe('https://zeleon.store/product/12/');
    expect(document.title).toBe('Test Energy | ZELEON');
    const schema = JSON.parse(document.querySelector('script[data-zeleon-seo]')!.textContent!);
    expect(schema.offers.priceCurrency).toBe('GEL');
    expect(schema.offers.price).toBe(3.5);
    expect(schema).not.toHaveProperty('aggregateRating');
    expect(schema.offers).not.toHaveProperty('availability');
    await harness.navigateByUrl('/product/lemon?campaign=spring');
    expect(meta.getTag('name="robots"')?.content).toBe('index, follow');
    expect(document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toBe('https://zeleon.store/product/12/');
    await harness.navigateByUrl('/product/missing');
    seo.productLoaded(null);
    expect(meta.getTag('name="robots"')?.content).toContain('noindex');
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
    expect(document.querySelector('script[data-zeleon-seo]')).toBeNull();
    expect(document.title).toBe('Product unavailable | ZELEON');
    await harness.navigateByUrl('/product/13');
    seo.productLoaded({ ...product, id: 13, name: 'Next Energy', currency: 'EUR' });
    expect(document.title).toBe('Next Energy | ZELEON');
    expect(document.querySelectorAll('script[data-zeleon-seo]')).toHaveLength(1);
    expect(JSON.parse(document.querySelector('script[data-zeleon-seo]')!.textContent!).offers.priceCurrency).toBe('EUR');
    await harness.navigateByUrl('/contact');
    expect(document.title).toBe('Contact Us | ZELEON');
    expect(document.querySelector('script[data-zeleon-seo]')).toBeNull();
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
