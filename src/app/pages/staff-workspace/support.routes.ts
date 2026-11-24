import { Routes } from '@angular/router';
export const SUPPORT_ROUTES: Routes = [
 { path: 'consultations', data: { staffRole: 'support' }, loadComponent: () => import('../manager/consultations/consultation-workspace').then(m => m.ConsultationWorkspace) },
 { path: 'newsletter', data: { staffRole: 'support' }, loadComponent: () => import('../manager/newsletter/newsletter-staff').then(m => m.NewsletterStaff) },
 { path: '', pathMatch: 'full', data: { staffRole: 'support' }, loadComponent: () => import('../manager/support/manager-support').then(m => m.ManagerSupport) },
];