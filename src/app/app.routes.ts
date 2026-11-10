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
import { ShopInfo } from './pages/profile/shop-info/shop-info';
import { authGuard, guestGuard } from './guards/auth.guard';
import { AuthCallback } from './pages/auth-callback/auth-callback';
import { ResetPassword } from './pages/reset-password/reset-password';
import { StaffAuth } from './pages/staff-auth/staff-auth';
import { staffGuard } from './guards/staff.guard';
import { managerChildGuard, managerGuard } from './guards/manager.guard';

export const routes: Routes = [
  {
    path: '',
    component: Home,
  },
  {
    path: 'rate-support/:id',
    loadComponent: () => import('./pages/support-rating/support-rating').then(m => m.SupportRatingPage),
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
    path: 'staff-auth',
    canActivate: [authGuard],
    component: StaffAuth,
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
      {
        path: 'shop-info',
        component: ShopInfo,
      },
    ],
  },
  {
    path: 'manager',
    canActivate: [managerGuard],
    canActivateChild: [managerChildGuard],
    loadComponent: () => import('./pages/manager/manager-shell').then((m) => m.ManagerShell),
    loadChildren: () => import('./pages/manager/manager.routes').then((m) => m.MANAGER_ROUTES),
  },
  {
    path: 'admin',
    canActivate: [staffGuard],
    data: { staffRole: 'admin' },
    canActivateChild: [staffGuard],
    loadComponent: () => import('./pages/manager/manager-shell').then(m => m.ManagerShell),
    loadChildren: () => import('./pages/staff-workspace/admin.routes').then(m => m.ADMIN_ROUTES),
  },
  {
    path: 'support',
    canActivate: [staffGuard],
    data: { staffRole: 'support' },
    canActivateChild: [staffGuard],
    loadComponent: () => import('./pages/manager/manager-shell').then(m => m.ManagerShell),
    loadChildren: () => import('./pages/staff-workspace/support.routes').then(m => m.SUPPORT_ROUTES),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
