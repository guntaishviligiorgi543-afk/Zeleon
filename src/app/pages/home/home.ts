import { afterNextRender, Component, DestroyRef, ElementRef, inject, NgZone, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Products } from '../../services/products';
import { Product } from '../../models/product';

@Component({
  imports: [CurrencyPipe, RouterLink],
  selector: 'app-home',
  styleUrl: './home.css',
  templateUrl: './home.html',
})
export class Home {
  readonly products = signal<Product[]>([]);
  readonly productsLoading = signal(true);
  readonly productsError = signal(false);
  private readonly catalog = inject(Products);
  private productRequest?: AbortController;
  private readonly element: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => { void this.loadProducts(); });
    this.destroyRef.onDestroy(() => this.productRequest?.abort());
    afterNextRender(() => {
      this.zone.runOutsideAngular(() => this.initializeProductSlider());
    });
    afterNextRender(() => {
      this.zone.runOutsideAngular(() => this.initializeSection6Scroll());
    });
    afterNextRender(() => {
      this.zone.runOutsideAngular(() => this.initializeSection5Scroll());
    });
    // afterNextRender never runs during SSR; native CSS uses one section timeline.
    afterNextRender(() => {
      if (window.CSS?.supports('animation-timeline: --sec4-scroll') &&
          window.CSS.supports('animation-range: entry-crossing 0% entry-crossing 100%')) return;
      this.zone.runOutsideAngular(() => this.initializeSection4Scroll());
    });
    // Actual card widths and flex positions are needed for the overlapping stack.
    // One browser-only controller supplies both stages without elapsed-time easing.
    afterNextRender(() => {
      this.zone.runOutsideAngular(() => {
        const categories = this.element.nativeElement.querySelector<HTMLElement>('.productCategories');
        if (!categories) return;

        const cards = ['.boostBlends', '.zeroSugar', '.classic'].map((selector) =>
          categories.querySelector<HTMLElement>(selector),
        ).filter((card): card is HTMLElement => card !== null);
        const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
        let frame: number | null = null;
        let offsets = cards.map(() => 0);
        // Remove the pre-initialization transform to measure unmodified layout.
        cards.forEach((card) => card.style.setProperty('--category-x', '0px'));

        const update = () => {
          frame = null;
          const bounds = categories.getBoundingClientRect();
          const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
          // First intersection through full entry (top alignment for a tall container).
          const range = Math.min(bounds.height, viewportHeight);
          const progress = motion.matches || range <= 0
            ? 1
            : Math.max(0, Math.min(1, (viewportHeight - bounds.top) / range));

          // Read all geometry before writing. Subtract our previous translation so
          // resizing and image/font loads always target the actual flex positions.
          const geometry = cards.map((card, index) => {
            const rect = card.getBoundingClientRect();
            return { left: rect.left - offsets[index], width: rect.width };
          });
          let stackWidth = 0;
          let stackCursor = 0;
          const stackPositions = geometry.map(({ width }) => {
            const left = stackCursor;
            stackWidth = Math.max(stackWidth, left + width);
            stackCursor += width * 0.5;
            return left;
          });
          const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
          const visibleLeft = Math.min(viewportWidth, Math.max(0, bounds.left));
          // Full entry happens at the left boundary, never at the viewport center.
          // If the unchanged stack is wider than the available viewport, full
          // visibility is geometrically impossible; use the same left-edge handoff.
          const stackLeft = visibleLeft;
          const startLeft = -stackWidth - 1;
          const entranceDistance = stackLeft - startLeft;
          const spreadDistance = Math.max(0, ...geometry.map(({ left }, index) =>
            Math.abs(left - stackLeft - stackPositions[index]),
          ));
          // Allocate scroll progress using actual travel distances. At this exact
          // threshold the whole stack has cleared the left edge; spreading starts
          // on the next increment, with the identical position on either side.
          const handoff = entranceDistance / (entranceDistance + spreadDistance);
          const entrance = Math.min(1, progress / handoff);
          const spread = handoff < 1 ? Math.max(0, (progress - handoff) / (1 - handoff)) : 0;
          const groupLeft = startLeft + (stackLeft - startLeft) * entrance;

          offsets = geometry.map(({ left }, index) =>
            motion.matches ? 0 : (groupLeft + stackPositions[index] - left) * (1 - spread),
          );
          cards.forEach((card, index) => {
            card.style.setProperty('--category-x', `${offsets[index]}px`);
          });
        };

        const schedule = () => {
          if (frame === null) frame = window.requestAnimationFrame(update);
        };

        window.addEventListener('scroll', schedule, { passive: true });
        window.addEventListener('resize', schedule, { passive: true });
        motion.addEventListener('change', schedule);
        const observer = new ResizeObserver(schedule);
        observer.observe(categories);
        cards.forEach((card) => observer.observe(card));
        update();

        this.destroyRef.onDestroy(() => {
          window.removeEventListener('scroll', schedule);
          window.removeEventListener('resize', schedule);
          motion.removeEventListener('change', schedule);
          observer.disconnect();
          if (frame !== null) window.cancelAnimationFrame(frame);
        });
      });
    });
  }

  async loadProducts(): Promise<void> {
    this.productRequest?.abort();
    const request = this.productRequest = new AbortController();
    this.productsLoading.set(true);
    this.productsError.set(false);
    try {
      const products = await this.catalog.getActiveProducts(request.signal);
      if (!request.signal.aborted) this.products.set(products);
    } catch {
      if (!request.signal.aborted) this.productsError.set(true);
    } finally {
      if (!request.signal.aborted) this.productsLoading.set(false);
    }
  }

  private initializeProductSlider(): void {
    const carousel = this.element.nativeElement.querySelector<HTMLElement>('.sec3-carousel');
    const track = carousel?.querySelector<HTMLElement>('.sec3Slider');
    const previous = carousel?.querySelector<HTMLButtonElement>('.slider-prev');
    const next = carousel?.querySelector<HTMLButtonElement>('.slider-next');
    if (!track || !previous || !next) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      previous.disabled = track.scrollLeft <= 1;
      next.disabled = track.scrollLeft >= track.scrollWidth - track.clientWidth - 1;
    };
    const move = (direction: number) => {
      const card = track.querySelector<HTMLElement>('.card');
      const distance = card ? card.getBoundingClientRect().width +
        (parseFloat(window.getComputedStyle(track).columnGap) || 0) : track.clientWidth;
      track.scrollBy({ left: direction * distance, behavior: motion.matches ? 'auto' : 'smooth' });
    };
    const back = () => move(-1);
    const forward = () => move(1);
    const wheel = (event: WheelEvent) => {
      // Vertical wheel input belongs to the page; Shift explicitly selects the slider.
      if (event.ctrlKey) return;
      if (!event.shiftKey && Math.abs(event.deltaY) >= Math.abs(event.deltaX)) return;
      const delta = event.shiftKey && Math.abs(event.deltaY) > Math.abs(event.deltaX)
        ? event.deltaY : event.deltaX;
      const pixels = delta * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? track.clientWidth : 1) * 0.55;
      const end = Math.max(0, track.scrollWidth - track.clientWidth);
      if (end === 0 || pixels === 0) return;
      const target = Math.max(0, Math.min(end, track.scrollLeft + pixels));
      event.preventDefault();
      track.scrollLeft = target;
      update();
    };
    let pointerStartX = 0;
    let pointerStartY = 0;
    let pointerStartScroll = 0;
    let dragging = false;
    const pointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.button !== 0 ||
          (event.target as HTMLElement).closest('button')) return;
      pointerStartX = event.clientX;
      pointerStartY = event.clientY;
      pointerStartScroll = track.scrollLeft;
      dragging = false;
      track.setPointerCapture(event.pointerId);
    };
    const pointerMove = (event: PointerEvent) => {
      if (!track.hasPointerCapture(event.pointerId)) return;
      const deltaX = event.clientX - pointerStartX;
      const deltaY = event.clientY - pointerStartY;
      // Let vertical mouse movement continue to scroll the document.
      if (!dragging && Math.abs(deltaY) > Math.abs(deltaX)) {
        track.releasePointerCapture(event.pointerId);
        return;
      }
      if (Math.abs(deltaX) > 4) dragging = true;
      if (dragging) {
        track.scrollLeft = pointerStartScroll - deltaX * 0.82;
        update();
      }
    };
    const pointerUp = (event: PointerEvent) => {
      if (track.hasPointerCapture(event.pointerId)) track.releasePointerCapture(event.pointerId);
      if (dragging) {
        // Prevent the click generated after a drag from opening a product.
        event.preventDefault();
        window.setTimeout(() => { dragging = false; }, 0);
      }
    };
    const click = (event: MouseEvent) => {
      if (!dragging) return;
      event.preventDefault();
      event.stopPropagation();
      dragging = false;
    };
    previous.addEventListener('click', back);
    next.addEventListener('click', forward);
    track.addEventListener('wheel', wheel, { passive: false });
    track.addEventListener('scroll', update, { passive: true });
    track.addEventListener('pointerdown', pointerDown);
    track.addEventListener('pointermove', pointerMove);
    track.addEventListener('pointerup', pointerUp);
    track.addEventListener('pointercancel', pointerUp);
    track.addEventListener('click', click, true);
    const observer = new ResizeObserver(update);
    observer.observe(track);
    const observeCards = () => {
      observer.disconnect();
      observer.observe(track);
      track.querySelectorAll('.card').forEach((card) => observer.observe(card));
      update();
    };
    const cardsObserver = new MutationObserver(observeCards);
    cardsObserver.observe(track, { childList: true });
    observeCards();
    update();
    this.destroyRef.onDestroy(() => {
      previous.removeEventListener('click', back);
      next.removeEventListener('click', forward);
      track.removeEventListener('wheel', wheel);
      track.removeEventListener('scroll', update);
      track.removeEventListener('pointerdown', pointerDown);
      track.removeEventListener('pointermove', pointerMove);
      track.removeEventListener('pointerup', pointerUp);
      track.removeEventListener('pointercancel', pointerUp);
      track.removeEventListener('click', click, true);
      observer.disconnect();
      cardsObserver.disconnect();
    });
  }

  private initializeSection6Scroll(): void {
    const section = this.element.nativeElement.querySelector<HTMLElement>('.sec6');
    const image = section?.querySelector<HTMLImageElement>(':scope > img');
    if (!section || !image) return;

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame: number | null = null;
    let previousWidth = -1;
    let previousHeight = -1;
    let previousRatio = -1;
    let imageHeight = 0;
    const update = () => {
      frame = null;
      const rect = section.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const ratio = image.naturalWidth > 0 && image.naturalHeight > 0
        ? image.naturalWidth / image.naturalHeight : rect.width / rect.height;
      if (rect.width !== previousWidth || rect.height !== previousHeight || ratio !== previousRatio) {
        // Size the actual image to cover, preserving its intrinsic aspect ratio.
        imageHeight = Math.max(rect.height, rect.width / ratio);
        image.style.width = `${imageHeight * ratio}px`;
        image.style.height = `${imageHeight}px`;
        previousWidth = rect.width;
        previousHeight = rect.height;
        previousRatio = ratio;
      }
      const progress = motion.matches ? 0.5
        : Math.max(0, Math.min(1, (window.innerHeight - rect.top) / rect.height));
      const zoom = 1 + 0.5 * Math.abs(2 * progress - 1);
      // With a top transform origin, [-(scaledHeight - sectionHeight), 0]
      // is the safe vertical range. Traverse it from top through center to bottom.
      const y = -(imageHeight * zoom - rect.height) * progress;
      image.style.transform = `translateX(-50%) translateY(${y}px) scale(${zoom})`;
    };
    const schedule = () => {
      if (frame === null) frame = window.requestAnimationFrame(update);
    };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    image.addEventListener('load', schedule);
    motion.addEventListener('change', schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(section);
    update();

    this.destroyRef.onDestroy(() => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      image.removeEventListener('load', schedule);
      motion.removeEventListener('change', schedule);
      observer.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
    });
  }

  private initializeSection5Scroll(): void {
    const section = this.element.nativeElement.querySelector<HTMLElement>('.sec5');
    const first = section?.querySelector<HTMLElement>('.sec5img1');
    const second = section?.querySelector<HTMLElement>('.sec5img2');
    const review = section?.querySelector<HTMLElement>('.reviewBox');
    const stars = Array.from(section?.querySelectorAll<SVGSVGElement>('.stars svg') ?? []);
    if (!section || !first || !second || !review || stars.length !== 5) return;

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame: number | null = null;
    let dirty = true;
    let destroyed = false;
    let offsets = stars.map(() => ({ x: 0, y: 0 }));
    let arc = offsets;
    let initialScale = 1.8;
    let starScale = 1;

    const update = () => {
      frame = null;
      const rect = section.getBoundingClientRect();
      const progress = motion.matches || rect.height <= 0 ? 1
        : Math.max(0, Math.min(1, (window.innerHeight - rect.top) / rect.height));
      if (dirty) {
        // Measure the real rating row only on layout changes. Previous translations
        // are removed mathematically; centered scaling does not move each center.
        const geometry = stars.map((star) => star.getBoundingClientRect());
        initialScale = Math.max(1, Math.min(1.8, rect.width * 0.12 /
          Math.max(1, ...geometry.map((bounds) => bounds.width / starScale))));
        arc = geometry.map((bounds, index) => ({
          x: rect.width * (0.1 + index * 0.2) -
            (bounds.left + bounds.width / 2 - offsets[index].x - rect.left),
          y: rect.height * [0.38, 0.23, 0.18, 0.23, 0.38][index] -
            (bounds.top + bounds.height / 2 - offsets[index].y - rect.top),
        }));
        dirty = false;
      }
      // Smoothstep eases spatial progress only; no elapsed time or trailing frames.
      const remaining = 1 - progress * progress * (3 - 2 * progress);
      first.style.transform = `translateX(${-100 * remaining}%)`;
      second.style.transform = `translateX(${100 * remaining}%)`;
      offsets = arc.map(({ x, y }) => ({ x: x * remaining, y: y * remaining }));
      starScale = 1 + (initialScale - 1) * remaining;
      stars.forEach((star, index) => {
        // Individual translate precedes the existing CSS scale, so these are
        // section-space pixels and the original 2.3 scale remains intact.
        star.style.translate = `${offsets[index].x}px ${offsets[index].y}px`;
        star.style.transform = `scale(${starScale})`;
      });
    };
    const schedule = () => {
      if (!destroyed && frame === null) frame = window.requestAnimationFrame(update);
    };
    const remeasure = () => { dirty = true; schedule(); };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', remeasure, { passive: true });
    motion.addEventListener('change', remeasure);
    const observer = new ResizeObserver(remeasure);
    observer.observe(section);
    observer.observe(review);
    stars.forEach((star) => observer.observe(star));
    document.fonts?.addEventListener('loadingdone', remeasure);
    update();

    this.destroyRef.onDestroy(() => {
      destroyed = true;
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', remeasure);
      motion.removeEventListener('change', remeasure);
      document.fonts?.removeEventListener('loadingdone', remeasure);
      observer.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
    });
  }

  private initializeSection4Scroll(): void {
    const section = this.element.nativeElement.querySelector<HTMLElement>('.sec4');
    const first = section?.querySelector<HTMLElement>('.sec4img1');
    const second = section?.querySelector<HTMLElement>('.sec4img2');
    if (!section || !first || !second) return;

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame: number | null = null;
    const update = () => {
      frame = null;
      const bounds = section.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const range = bounds.height;
      // Both section edges cross the viewport bottom over the full section height.
      const progress = motion.matches || range <= 0
        ? 0
        : Math.max(0, Math.min(1, (viewportHeight - bounds.top) / range));
      first.style.transform = `translateY(${-50 * progress}px) rotate(${20 - 55 * progress}deg)`;
      second.style.transform = `translateY(${50 * progress}px) rotate(${-20 + 55 * progress}deg)`;
    };
    const schedule = () => {
      if (frame === null) frame = window.requestAnimationFrame(update);
    };

    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    motion.addEventListener('change', schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(section);
    update();

    this.destroyRef.onDestroy(() => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      motion.removeEventListener('change', schedule);
      observer.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
    });
  }
}
