import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Product } from '../models/product';
import { ORIGIN, canonicalPath, metadata, serializeJson } from '../seo-metadata.mjs';

@Injectable({ providedIn: 'root' })
export class Seo {
  private readonly document = inject(DOCUMENT);
  private readonly meta = inject(Meta);
  private readonly title = inject(Title);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private started = false;
  private resolvedProduct: { path: string; product: Product } | null = null;

  start(): void {
    if (this.started) return;
    this.started = true;
    this.update(this.document.location ? this.document.location.pathname + this.document.location.search : this.router.url);
    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(event => {
      if (event instanceof NavigationStart) {
        if (this.resolvedProduct?.path !== canonicalPath(new URL(event.url, ORIGIN).pathname)) this.resolvedProduct = null;
        this.update(event.url);
      } else if (event instanceof NavigationEnd) this.update(event.urlAfterRedirects);
    });
  }

  productLoaded(product: Product | null): void {
    const path = canonicalPath(new URL(this.router.url, ORIGIN).pathname);
    this.resolvedProduct = product === null ? null : { path, product };
    this.update(this.router.url);
  }

  private update(value: string): void {
    const url = new URL(value, ORIGIN);
    const path = canonicalPath(url.pathname);
    const page = metadata(path, this.resolvedProduct?.path === path ? this.resolvedProduct.product : null);
    const canonical = url.searchParams.has('supportChat') || url.searchParams.has('supportRating') ? null : page.canonical;
    this.title.setTitle(page.title);
    this.setMeta('description', canonical ? page.description : '');
    const social: Record<string, string> = { 'og:title': page.title, 'og:description': page.description, 'og:type': 'website', 'og:url': canonical ?? '', 'og:image': page.image, 'og:site_name': 'ZELEON', 'og:image:alt': path.startsWith('/product/') ? this.resolvedProduct?.product.name ?? 'ZELEON' : 'ZELEON logo' };
    for (const [key, value] of Object.entries(social)) this.setMeta(key, canonical ? value : '', 'property');
    for (const [key, value] of Object.entries({ 'twitter:card': 'summary_large_image', 'twitter:title': page.title, 'twitter:description': page.description, 'twitter:image': page.image, 'twitter:image:alt': social['og:image:alt'] })) this.setMeta(key, canonical ? value : '');
    this.document.querySelectorAll('script[data-zeleon-seo]').forEach(script => script.remove());
    for (const schema of canonical ? page.schemas : []) {
      const script = this.document.createElement('script');
      script.type = 'application/ld+json'; script.dataset['zeleonSeo'] = '';
      script.textContent = serializeJson(schema);
      this.document.head.appendChild(script);
    }
    this.setMeta('robots', canonical ? 'index, follow' : 'noindex, nofollow');
    const links = [...this.document.querySelectorAll<HTMLLinkElement>('link[rel="canonical"]')];
    const link = links.shift();
    links.forEach(duplicate => duplicate.remove());
    if (!canonical) { link?.remove(); return; }
    const target = link ?? this.document.createElement('link');
    target.rel = 'canonical';
    target.href = canonical;
    if (!link) this.document.head.appendChild(target);
  }

  private setMeta(key: string, value: string, attribute = 'name'): void {
    this.document.querySelectorAll(`meta[${attribute}="${key}"]`).forEach(tag => tag.remove());
    if (value) this.meta.addTag({ [attribute]: key, content: value });
  }
}
