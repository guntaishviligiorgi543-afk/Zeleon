import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import publicPages from '../seo-pages.json';

const ORIGIN = 'https://zeleon.store';
const canonicalPath = (path: string) => path === '/' ? '/' : path.replace(/\/+$/, '') + '/';

@Injectable({ providedIn: 'root' })
export class Seo {
  private readonly document = inject(DOCUMENT);
  private readonly meta = inject(Meta);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private started = false;
  private resolvedProduct: { path: string; id: string | number } | null = null;

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

  productLoaded(id: string | number | null): void {
    const path = canonicalPath(new URL(this.router.url, ORIGIN).pathname);
    this.resolvedProduct = id === null ? null : { path, id };
    this.update(this.router.url);
  }

  private update(value: string): void {
    const url = new URL(value, ORIGIN);
    const path = canonicalPath(url.pathname);
    let canonical: string | null = publicPages.includes(path) ? ORIGIN + path : null;
    if (url.searchParams.has('supportChat') || url.searchParams.has('supportRating')) canonical = null;
    if (/^\/product\/[^/]+\/$/.test(path) && this.resolvedProduct?.path === path) {
      canonical = `${ORIGIN}/product/${encodeURIComponent(String(this.resolvedProduct.id))}/`;
    }
    this.meta.updateTag({ name: 'robots', content: canonical ? 'index, follow' : 'noindex, nofollow' });
    const links = [...this.document.querySelectorAll<HTMLLinkElement>('link[rel="canonical"]')];
    const link = links.shift();
    links.forEach(duplicate => duplicate.remove());
    if (!canonical) { link?.remove(); return; }
    const target = link ?? this.document.createElement('link');
    target.rel = 'canonical';
    target.href = canonical;
    if (!link) this.document.head.appendChild(target);
  }
}
