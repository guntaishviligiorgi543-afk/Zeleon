import { DOCUMENT } from '@angular/common';
import { Component, HostListener, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Auth, authErrorMessage } from '../../services/auth';
import { BurgerMenu } from '../burger-menu/burger-menu';
import { CartSidebar } from '../cart-sidebar/cart-sidebar';

@Component({
  imports: [RouterLink, RouterLinkActive, BurgerMenu, CartSidebar],
  selector: 'app-header',
  styleUrl: './header.css',
  templateUrl: './header.html',
})
export class Header {
  readonly auth = inject(Auth);
  readonly signingOut = signal(false);
  readonly authError = signal('');
  readonly isScrolled = signal(false);
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);

  @HostListener('window:scroll')
  onWindowScroll(): void {
    this.isScrolled.set((this.document.defaultView?.scrollY ?? 0) > 24);
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
    { path: '/our-story', label: 'our-story' },
    { path: '/shop', label: 'Shop All' },
    { path: '/contact', label: 'Contact' },
  ];
}
