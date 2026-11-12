import { Routes } from '@angular/router';
export const ADMIN_ROUTES: Routes = [
 { path: '', pathMatch: 'full', data: { staffRole: 'admin' }, loadComponent: () => import('../manager/products/manager-products').then(m => m.ManagerProducts) },
 { path: 'users', data: { staffRole: 'admin' }, loadComponent: () => import('../manager/users/manager-users').then(m => m.ManagerUsers) },
 { path: 'staff', data: { staffRole: 'admin' }, loadComponent: () => import('../manager/staff/manager-staff').then(m => m.ManagerStaff) },
 { path: 'support', data: { staffRole: 'admin' }, loadComponent: () => import('../manager/support/manager-support').then(m => m.ManagerSupport) },
];