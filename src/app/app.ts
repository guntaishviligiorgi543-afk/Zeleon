import { Auth } from './services/auth';
import { CartLoginDialog } from './components/cart-login-dialog/cart-login-dialog';
import {
  AfterRenderRef,
  AfterViewInit,
  afterNextRender,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  NgZone,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { AOS_ENGINE } from './aos-engine';
import { filter } from 'rxjs';
import { Header } from './components/header/header';
import { Footer } from './components/footer/footer';
import { Home } from './pages/home/home';
import { CustomerChat } from './components/customer-chat/customer-chat';
import { ManagerNavigation } from './components/manager-navigation/manager-navigation';
import { legacyRatingPath } from './pages/support-rating/rating-link';

@Component({
  imports: [CartLoginDialog, RouterOutlet, Header, Footer, ManagerNavigation, CustomerChat, Home],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App implements AfterViewInit {
  protected readonly title = signal('zeleon');
  protected readonly router = inject(Router);
  protected readonly ratingRoute = signal(this.isRatingUrl(this.router.url));
  protected readonly checkoutRoute = signal(/^\/checkout(?:[/?#;]|$)/.test(this.router.url));
  protected readonly workspaceRoute = signal(/^\/(manager|admin|support)(?:[/?#;]|$)/.test(this.router.url));
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly zone = inject(NgZone);
  private readonly element: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly aos = inject(AOS_ENGINE);
  private aosInitialized = false;
  private pendingRender?: AfterRenderRef;
  private layoutObserver?: ResizeObserver;
  private layoutFrame: number | null = null;

  constructor() {
    const auth = inject(Auth);
    effect(() => {
      if (auth.initialized() && !auth.isAuthenticated() && this.checkoutOrCart()) {
        void this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url }, replaceUrl: true });
      }
    });
  }
  private checkoutOrCart(): boolean {
    return /^\/(cart|checkout)(?:[/?#;]|$)/.test(this.router.url);
  }

  ngAfterViewInit(): void {
    this.refreshAfterRender();
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((event) => {
        this.ratingRoute.set(this.isRatingUrl(event.urlAfterRedirects));
        this.checkoutRoute.set(/^\/checkout(?:[/?#;]|$)/.test(event.urlAfterRedirects));
        this.workspaceRoute.set(/^\/(manager|admin|support)(?:[/?#;]|$)/.test(event.urlAfterRedirects));
        this.refreshAfterRender();
      });

    this.destroyRef.onDestroy(() => {
      this.pendingRender?.destroy();
      this.layoutObserver?.disconnect();
      if (this.layoutFrame !== null) window.cancelAnimationFrame(this.layoutFrame);
    });
  }

  private isRatingUrl(url: string): boolean {
    return url.startsWith('/rate-support/') || !!legacyRatingPath(this.router.parseUrl(url).queryParams);
  }

  private refreshAfterRender(): void {
    // Coalesce initial navigation and route changes until the new DOM is rendered.
    this.pendingRender?.destroy();
    this.pendingRender = afterNextRender(
      () => {
        this.pendingRender = undefined;
        this.zone.runOutsideAngular(() => {
          if (!this.aosInitialized) {
            this.aos.init({
              duration: 1500,
              easing: 'ease-in-out',
              once: false,
              mirror: true,
              offset: 200,
              // Routing explicitly refreshes the element list; avoid duplicate observation.
              disableMutationObserver: true,
            });
            this.aosInitialized = true;
            // Angular rendering does not wait for intrinsic image sizes or fonts.
            // Refresh cached offsets when those change the routed content's height.
            this.layoutObserver = new ResizeObserver(() => {
              if (this.layoutFrame !== null) return;
              this.layoutFrame = window.requestAnimationFrame(() => {
                this.layoutFrame = null;
                this.aos.refresh();
              });
            });
            const content = this.element.nativeElement.querySelector('main');
            if (content) this.layoutObserver.observe(content);
          } else {
            this.aos.refreshHard();
          }
        });
      },
      { injector: this.injector },
    );
  }
}
