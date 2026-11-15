import { afterNextRender, Component, DestroyRef, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  imports: [RouterLink, RouterLinkActive],
  selector: 'app-burger-menu',
  styleUrl: './burger-menu.css',
  templateUrl: './burger-menu.html',
})
export class BurgerMenu {
  readonly links = input<readonly { path: string; label: string }[]>([]);
  readonly opened = signal(false);
  readonly closing = signal(false);
  readonly cartRequested = output<void>();
  readonly authenticated = input(false);
  readonly signingOut = input(false);
  readonly authError = input('');
  readonly logoutRequested = output<void>();

  openCart(): void {
    if (!this.opened()) {
      this.cartRequested.emit();
      return;
    }
    this.cartAfterClose = true;
    this.close();
  }
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('menuDialog');
  private readonly toggle = viewChild.required<ElementRef<HTMLButtonElement>>('menuToggle');
  private readonly destroyRef = inject(DestroyRef);
  private mobile?: MediaQueryList;
  private restoreScroll?: () => void;
  private closeTimer?: ReturnType<typeof setTimeout>;
  private cartAfterClose = false;

  constructor() {
    inject(Router).events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationEnd) this.close();
    });
    // Render callbacks are browser-only, keeping SSR free of window/document reads.
    afterNextRender(() => {
      if (typeof window.matchMedia !== 'function') return;
      this.mobile = window.matchMedia('(max-width: 900px)');
      const resize = () => { if (!this.mobile?.matches) this.close(true); };
      this.mobile.addEventListener('change', resize);
      this.destroyRef.onDestroy(() => this.mobile?.removeEventListener('change', resize));
    });
    this.destroyRef.onDestroy(() => {
      clearTimeout(this.closeTimer);
      this.cartAfterClose = false;
      this.restoreScroll?.();
      // Removing a native modal also releases its focus trap and inert background.
      if (this.dialog().nativeElement.open) this.dialog().nativeElement.close();
    });
  }

  open(): void {
    if (!this.mobile?.matches || this.opened()) return;
    const dialog = this.dialog().nativeElement;
    dialog.showModal();
    this.opened.set(true);
    const document = dialog.ownerDocument;
    const elements = [document.documentElement, document.body];
    const saved = elements.map((element) => ({
      value: element.style.getPropertyValue('overflow'),
      priority: element.style.getPropertyPriority('overflow'),
    }));
    elements.forEach((element) => element.style.setProperty('overflow', 'hidden'));
    this.restoreScroll = () => elements.forEach((element, index) => {
      if (saved[index].value) element.style.setProperty('overflow', saved[index].value, saved[index].priority);
      else element.style.removeProperty('overflow');
    });
  }

  close(immediate = false): void {
    if (!this.opened()) return;
    if (immediate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.completeClose();
      return;
    }
    if (this.closing()) return;
    const dialog = this.dialog().nativeElement;
    const panel = dialog.querySelector<HTMLElement>('.menu-panel')!;
    // Closing during the entrance must continue from its current position.
    const transform = getComputedStyle(panel).transform;
    panel.style.setProperty('--menu-exit-from', transform === 'none' ? 'translate3d(0, 0, 0)' : transform);
    dialog.style.setProperty('--menu-backdrop-exit-from', getComputedStyle(dialog, '::backdrop').opacity);
    this.closing.set(true);
    // Keep the modal, focus trap and scroll lock until the exit has finished.
    this.closeTimer = setTimeout(() => this.completeClose(), 400);
  }

  panelAnimationEnd(event: AnimationEvent): void {
    if (this.closing() && event.target === event.currentTarget && event.animationName === 'menu-exit') {
      this.completeClose();
    }
  }

  private completeClose(): void {
    this.dialog().nativeElement.close();
    this.finishClose();
  }

  finishClose(): void {
    if (!this.opened()) return;
    clearTimeout(this.closeTimer);
    this.closeTimer = undefined;
    this.closing.set(false);
    this.opened.set(false);
    this.restoreScroll?.();
    this.restoreScroll = undefined;
    if (this.mobile?.matches) this.toggle().nativeElement.focus({ preventScroll: true });
    if (this.cartAfterClose) {
      this.cartAfterClose = false;
      this.cartRequested.emit();
    }
  }

  cancel(event: Event): void {
    event.preventDefault();
    this.close();
  }

  outside(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.close();
  }
}
