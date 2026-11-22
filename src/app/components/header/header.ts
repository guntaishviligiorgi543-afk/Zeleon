import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  NgZone,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Auth, authErrorMessage } from '../../services/auth';
import { BurgerMenu } from '../burger-menu/burger-menu';
import { ProfileAvatar } from '../../services/profile-avatar';
import { CartSidebar } from '../cart-sidebar/cart-sidebar';
import { Cart } from '../../services/cart';

@Component({
  imports: [RouterLink, RouterLinkActive, BurgerMenu, CartSidebar, NgTemplateOutlet],
  selector: 'app-header',
  styleUrl: './header.css',
  templateUrl: './header.html',
})
export class Header {
  readonly checkout = input(false);
  readonly scrolled = signal(false);
  readonly auth = inject(Auth);
  readonly avatar = inject(ProfileAvatar);
  private readonly cart = inject(Cart);
  readonly cartCount = computed(() =>
    this.cart.items().reduce((total, line) => total + line.quantity, 0),
  );
  readonly signingOut = signal(false);
  readonly authError = signal('');
  private readonly router = inject(Router);

  constructor() {
    const destroyRef = inject(DestroyRef);
    const zone = inject(NgZone);
    afterNextRender(() => {
      const update = () => {
        // One screen of content; recompute on resize for mobile orientation changes.
        const next = window.scrollY >= window.innerHeight;
        if (next !== this.scrolled()) zone.run(() => this.scrolled.set(next));
      };
      zone.runOutsideAngular(() => {
        window.addEventListener('scroll', update, { passive: true });
        window.addEventListener('resize', update);
      });
      update();
      destroyRef.onDestroy(() => {
        window.removeEventListener('scroll', update);
        window.removeEventListener('resize', update);
      });
    });
  }

  async logout(): Promise<void> {
    if (this.signingOut()) return;
    this.signingOut.set(true);
    this.authError.set('');
    try {
      await this.auth.signOut();
    } catch (error) {
      this.authError.set(authErrorMessage(error));
    } finally {
      await this.router.navigateByUrl('/');
      this.signingOut.set(false);
    }
  }
  readonly navigationLinks = [
    { path: '/shop', label: 'Shop All' },
    { path: '/our-story', label: 'Our Story' },
    { path: '/contact', label: 'Contact' },
  ];
}
