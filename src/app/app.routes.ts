import { Router, Routes } from '@angular/router';
import { inject } from '@angular/core';
import { legacyRatingPath } from './pages/support-rating/rating-link';

import { authGuard, guestGuard } from './guards/auth.guard';
import { staffGuard } from './guards/staff.guard';
import { managerChildGuard, managerGuard } from './guards/manager.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/home/home').then(m => m.Home),
    canActivate: [(route) => {
      const target = legacyRatingPath(route.queryParams);
      return target ? inject(Router).parseUrl(target) : true;
    }],
    runGuardsAndResolvers: 'paramsOrQueryParamsChange',
  },
  {
    path: 'rate-support/:id',
    loadComponent: () => import('./pages/support-rating/support-rating').then(m => m.SupportRatingPage),
  },
  {
    path: 'shop',
    loadComponent: () => import('./pages/shop/shop').then(m => m.Shop),
  },
  { path: 'shop/classic', loadComponent: () => import('./pages/shop/shop').then(m => m.Shop), data: { category: 'classic' } },
  { path: 'shop/boost-blends', loadComponent: () => import('./pages/shop/shop').then(m => m.Shop), data: { category: 'boost-blends' } },
  { path: 'shop/zero-sugar', loadComponent: () => import('./pages/shop/shop').then(m => m.Shop), data: { category: 'zero-sugar' } },
  {
    path: 'our-story',
    loadComponent: () => import('./pages/our-story/our-story').then(m => m.OurStory),
  },
  {
    path: 'contact',
    loadComponent: () => import('./pages/contact/contact').then(m => m.Contact),
  },
  {
    path: 'product/:id',
    loadComponent: () => import('./pages/product-details/product-details').then(m => m.ProductDetails),
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login').then(m => m.Login),
  },
  {
    path: 'signup',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/signup/signup').then(m => m.Signup),
  },
  {
    path: 'forgot-password',
    loadComponent: () => import('./pages/forgot-password/forgot-password').then(m => m.ForgotPassword),
  },
  {
    path: 'cart',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/cart/cart').then(m => m.Cart),
  },
  {
    path: 'checkout',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/checkout/checkout').then(m => m.Checkout),
  },
  {
    path: 'auth/callback',
    loadComponent: () => import('./pages/auth-callback/auth-callback').then(m => m.AuthCallback),
  },
  {
    path: 'reset-password',
    loadComponent: () => import('./pages/reset-password/reset-password').then(m => m.ResetPassword),
  },
  {
    path: 'staff-auth',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/staff-auth/staff-auth').then(m => m.StaffAuth),
  },
  {
    path: 'profile',
    canActivate: [authGuard],
    canActivateChild: [authGuard],
    loadComponent: () => import('./pages/profile/profile').then(m => m.Profile),
    children: [
      {
        path: '',
        redirectTo: 'info',
        pathMatch: 'full',
      },
      {
        path: 'info',
        loadComponent: () => import('./pages/profile/your-info/your-info').then(m => m.YourInfo),
      },
      {
        path: 'security',
        loadComponent: () => import('./pages/profile/security/security').then(m => m.Security),
      },
      {
        path: 'shop-info',
        loadComponent: () => import('./pages/profile/shop-info/shop-info').then(m => m.ShopInfo),
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
    loadComponent: () => import('./pages/not-found/not-found').then(m => m.NotFound),
  },
];
