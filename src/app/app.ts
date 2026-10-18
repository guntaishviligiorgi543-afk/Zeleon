import { AfterRenderRef, AfterViewInit, afterNextRender, Component, DestroyRef, ElementRef, inject, Injector, NgZone, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import AOS from 'aos';
import { filter } from 'rxjs';
import { Header } from './components/header/header';
import { Footer } from './components/footer/footer';

@Component({
  imports: [RouterOutlet, Header, Footer],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App implements AfterViewInit {
  protected readonly title = signal('zeleon');
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly zone = inject(NgZone);
  private readonly element: ElementRef<HTMLElement> = inject(ElementRef);
  private aosInitialized = false;
  private pendingRender?: AfterRenderRef;
  private layoutObserver?: ResizeObserver;
  private layoutFrame: number | null = null;

  ngAfterViewInit(): void {
    this.refreshAfterRender();
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => this.refreshAfterRender());

    this.destroyRef.onDestroy(() => {
      this.pendingRender?.destroy();
      this.layoutObserver?.disconnect();
      if (this.layoutFrame !== null) window.cancelAnimationFrame(this.layoutFrame);
    });
  }

  private refreshAfterRender(): void {
    // Coalesce initial navigation and route changes until the new DOM is rendered.
    this.pendingRender?.destroy();
    this.pendingRender = afterNextRender(() => {
      this.pendingRender = undefined;
      this.zone.runOutsideAngular(() => {
        if (!this.aosInitialized) {
          AOS.init({
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
              AOS.refresh();
            });
          });
          const content = this.element.nativeElement.querySelector('main');
          if (content) this.layoutObserver.observe(content);
        } else {
          AOS.refreshHard();
        }
      });
    }, { injector: this.injector });
  }
}
