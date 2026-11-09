import { Routes } from '@angular/router';
export const SUPPORT_ROUTES: Routes = [
 { path: '', pathMatch: 'full', data: { staffRole: 'support' }, loadComponent: () => import('../manager/support/manager-support').then(m => m.ManagerSupport) },
];