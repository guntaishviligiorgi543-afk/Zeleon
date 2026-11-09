import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { StaffAccess, StaffRole } from '../services/staff-access';

export const staffGuard: CanActivateFn = async (route, state) => {
  const staff = inject(StaffAccess);
  const router = inject(Router);
  try {
    await staff.load();
  } catch {
    staff.clear();
    return router.createUrlTree(['/profile']);
  }
  const role = route.data['staffRole'] as StaffRole | undefined;
  if (!staff.assignment() || staff.status() !== 'active') return router.createUrlTree(['/profile']);
  if (!staff.isVerified()) return router.createUrlTree(['/staff-auth'], { queryParams: { returnUrl: state.url } });
  if (role && staff.canAccess(role)) return true;
  return router.createUrlTree(['/profile']);
};
