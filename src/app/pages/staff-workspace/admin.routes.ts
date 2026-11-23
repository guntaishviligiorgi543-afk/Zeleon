import { Routes } from '@angular/router';
export const ADMIN_ROUTES: Routes = [
 { path: 'catalog', loadComponent: () => import('../manager/products/catalog-tools').then(m => m.CatalogTools) },
 { path: '', pathMatch: 'full', data: { staffRole: 'admin' }, loadComponent: () => import('../manager/products/manager-products').then(m => m.ManagerProducts) },
 { path: 'newsletter', data: { staffRole: 'admin' }, loadComponent: () => import('../manager/newsletter/newsletter-staff').then(m => m.NewsletterStaff) },
 { path: 'users', data: { staffRole: 'admin' }, loadComponent: () => import('../manager/users/manager-users').then(m => m.ManagerUsers) },
 { path: 'staff', data: { staffRole: 'admin' }, loadComponent: () => import('../manager/staff/manager-staff').then(m => m.ManagerStaff) },
 { path: 'contact', data: { staffRole: 'admin' }, loadComponent: () => import('../manager/contact/contact-inbox').then(m => m.ContactInbox) },
 { path: 'support', data: { staffRole: 'admin' }, loadComponent: () => import('../manager/support/manager-support').then(m => m.ManagerSupport) },
];