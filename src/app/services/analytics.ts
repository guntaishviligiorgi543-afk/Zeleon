import { afterNextRender, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { Product } from '../models/product';
import { Auth } from './auth';
import { SUPABASE_CLIENT } from './supabase';

export const GA4_MEASUREMENT_ID = 'G-844EV84VWF';
const CONSENT_KEY = 'zeleon-analytics-consent-v1';
type ConsentChoice = 'accepted' | 'rejected' | null;
type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window {
    dataLayer?: unknown[][];
    gtag?: Gtag;
  }
}

// Analytics is strictly opt-in. No Google tag loads before permission.
// Never send auth, newsletter token, password or staff URLs to analytics.
@Injectable({ providedIn: 'root' })
export class Analytics {
  private readonly router = inject(Router);
  private readonly auth = inject(Auth);
  private readonly db = inject(SUPABASE_CLIENT);
  private readonly destroyRef = inject(DestroyRef);
  readonly consent = signal<ConsentChoice>(null);
  readonly preferencesOpen = signal(false);
  private started = false;
  private lastPage: string | null = null;

  constructor() {
    afterNextRender(() => {
      try {
        const saved = localStorage.getItem(CONSENT_KEY);
        if (saved === 'accepted' || saved === 'rejected') this.consent.set(saved);
      } catch { /* private mode: ask for consent every session */ }
      if (this.consent() === 'accepted') this.load();
      this.router.events.pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      ).subscribe(e => this.pageView(e.urlAfterRedirects));
    });
  }

  setConsent(value: 'accepted' | 'rejected'): void {
    this.consent.set(value);
    this.preferencesOpen.set(false);
    try {
      const existing = document.cookie.split('; ').filter(part => /^_ga(?:_|=)/.test(part));
      if (value === 'rejected') for (const cookie of existing) {
        const key = cookie.split('=')[0];
        document.cookie = key + '=; Max-Age=0; Path=/; SameSite=Lax';
      }
    } catch { /* storage may be restricted */ }
    try { localStorage.setItem(CONSENT_KEY, value); } catch { /* no persistence */ }
    if (this.auth.user()?.id) {
      void this.db.rpc('update_my_analytics_consent', { p_analytics: value === 'accepted' }).then(({ error }) => {
        if (error) console.warn('Analytics preference sync could not be saved.');
      });
    }
    if (typeof window !== 'undefined') (window as unknown as Record<string, unknown>)['ga-disable-' + GA4_MEASUREMENT_ID] = value !== 'accepted';
    if (value === 'accepted') {
      if (this.started && window.gtag) {
        window.gtag('consent', 'update', { analytics_storage: 'granted' });
        this.lastPage = null;
        this.pageView(this.router.url);
      } else this.load();
    } else if (this.started && window.gtag) {
      window.gtag('consent', 'update', {
        analytics_storage: 'denied', ad_storage: 'denied',
        ad_user_data: 'denied', ad_personalization: 'denied',
      });
      this.lastPage = null;
    }
  }

  openPreferences(): void { this.preferencesOpen.set(true); }

  private allowedPath(path: string): boolean {
    return !/^\/(?:manager|admin|support|staff-auth|auth|login|signup|profile|reset-password|forgot-password|newsletter|rate-support|checkout)(?:\/|$)/.test(path);
  }

  private load(): void {
    if (this.started || typeof window === 'undefined') {
      this.pageView(this.router.url);
      return;
    }
    this.started = true;
    (window as unknown as Record<string, unknown>)['ga-disable-' + GA4_MEASUREMENT_ID] = false;
    window.dataLayer = window.dataLayer ?? [];
    window.gtag = (...args: unknown[]) => { window.dataLayer!.push(args); };
    // Set the default synchronously before any gtag initialization or data events.
    // Google Tag Assistant otherwise reports that consent is not configured.
    window.gtag('consent', 'default', {
      analytics_storage: 'denied', ad_storage: 'denied',
      ad_user_data: 'denied', ad_personalization: 'denied',
    });
    window.gtag('js', new Date());
    window.gtag('consent', 'update', { analytics_storage: 'granted' });
    // We record route views explicitly without sending URL query parameters.
    window.gtag('config', GA4_MEASUREMENT_ID, { send_page_view: false });
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA4_MEASUREMENT_ID);
    script.dataset['zeleonAnalytics'] = 'true';
    document.head.appendChild(script);
    this.pageView(this.router.url);
  }

  pageView(route: string): void {
    if (this.consent() !== 'accepted' || !window.gtag) return;
    const path = route.split(/[?#]/, 1)[0] || '/';
    if (!this.allowedPath(path) || this.lastPage === path) return;
    this.lastPage = path;
    window.gtag('event', 'page_view', {
      page_location: window.location.origin + path,
      page_path: path,
      page_title: document.title,
    });
  }

  event(name: 'view_item' | 'add_to_cart' | 'begin_checkout', items: Array<{
    item_id: string; item_name: string; price: number; quantity: number;
  }>, currency = 'USD'): void {
    if (this.consent() !== 'accepted' || !window.gtag) return;
    window.gtag('event', name, {
      currency, value: items.reduce((total, item) => total + item.price * item.quantity, 0),
      items,
    });
  }

  productEvent(name: 'view_item' | 'add_to_cart', product: Product, quantity = 1): void {
    this.event(name, [{
      item_id: String(product.id), item_name: product.name, price: product.price, quantity,
    }], product.currency);
  }
}
