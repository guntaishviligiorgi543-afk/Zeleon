import { Routes } from '@angular/router';

import { Home } from './pages/home/home';
import { Shop } from './pages/shop/shop';
import { OurStory } from './pages/our-story/our-story';
import { Contact } from './pages/contact/contact';
import { ProductDetails } from './pages/product-details/product-details';
import { Login } from './pages/login/login';
import { ForgotPassword } from './pages/forgot-password/forgot-password';
import { Signup } from './pages/signup/signup';
import { Cart } from './pages/cart/cart';
import { Checkout } from './pages/checkout/checkout';
import { Profile } from './pages/profile/profile';
import { YourInfo } from './pages/profile/your-info/your-info';
import { Security } from './pages/profile/security/security';
import { authGuard, guestGuard } from './guards/auth.guard';
import { AuthCallback } from './pages/auth-callback/auth-callback';
import { ResetPassword } from './pages/reset-password/reset-password';

export const routes: Routes = [
  {
    path: '',
    component: Home,
  },
  {
    path: 'shop',
    component: Shop,
  },
  {
    path: 'our-story',
    component: OurStory,
  },
  {
    path: 'contact',
    component: Contact,
  },
  {
    path: 'product/:id',
    component: ProductDetails,
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    component: Login,
  },
  {
    path: 'signup',
    canActivate: [guestGuard],
    component: Signup,
  },
  {
    path: 'forgot-password',
    component: ForgotPassword,
  },
  {
    path: 'cart',
    component: Cart,
  },
  {
    path: 'checkout',
    component: Checkout,
  },
  {
    path: 'auth/callback',
    component: AuthCallback,
  },
  {
    path: 'reset-password',
    component: ResetPassword,
  },
  {
    path: 'profile',
    canActivate: [authGuard],
    canActivateChild: [authGuard],
    component: Profile,
    children: [
      {
        path: '',
        redirectTo: 'info',
        pathMatch: 'full',
      },
      {
        path: 'info',
        component: YourInfo,
      },
      {
        path: 'security',
        component: Security,
      },
    ],
  },
  {
    path: '**',
    redirectTo: '',
  },
];
