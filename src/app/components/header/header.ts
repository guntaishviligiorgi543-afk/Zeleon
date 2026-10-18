import { Component, inject, signal } from '@angular/core';
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
  private readonly router = inject(Router);

  async logout(): Promise<void> {
    if (this.signingOut()) return;
    this.signingOut.set(true);
    this.authError.set('');
    try {
      await this.auth.signOut();
      await this.router.navigateByUrl('/');
    } catch (error) {
      this.authError.set(authErrorMessage(error));
    } finally { this.signingOut.set(false); }
  }
  readonly navigationLinks = [
    { path: '/our-story', label: 'our-story' },
    { path: '/shop', label: 'Shop All' },
    { path: '/contact', label: 'Contact' },
  ];
}
