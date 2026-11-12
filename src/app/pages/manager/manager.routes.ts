import { Routes } from '@angular/router';

export const MANAGER_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./overview/manager-overview').then((m) => m.ManagerOverview),
  },
  { path: 'users', loadComponent: () => import('./users/manager-users').then(m => m.ManagerUsers) },
  {
    path: 'products',
    loadComponent: () => import('./products/manager-products').then((m) => m.ManagerProducts),
  },
  {
    path: 'staff',
    loadComponent: () => import('./staff/manager-staff').then((m) => m.ManagerStaff),
  },
  {
    path: 'support',
    loadComponent: () => import('./support/manager-support').then((m) => m.ManagerSupport),
  },
  {
    path: 'orders',
    loadComponent: () => import('./orders/manager-orders').then((m) => m.ManagerOrders),
  },
  {
    path: 'analytics',
    loadComponent: () => import('./analytics/manager-analytics').then((m) => m.ManagerAnalytics),
  },
  {
    path: 'settings',
    loadComponent: () => import('./settings/manager-settings').then((m) => m.ManagerSettings),
  },
];
