import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
import { StaffAccess } from '../services/staff-access';

async function authorizeManager(
  stateUrl: string,
): Promise<true | ReturnType<Router['createUrlTree']>> {
  const staff = inject(StaffAccess);
  const router = inject(Router);
  try {
    await staff.load();
  } catch {
    staff.clear();
    return router.createUrlTree(['/profile']);
  }
  if (!staff.assignment() || staff.status() !== 'active') return router.createUrlTree(['/profile']);
  if (!staff.isVerified()) {
    return router.createUrlTree(['/staff-auth'], { queryParams: { returnUrl: stateUrl } });
  }
  return staff.canAccess('manager') ? true : router.createUrlTree(['/profile']);
}

export const managerGuard: CanActivateFn = (_route, state) => authorizeManager(state.url);
export const managerChildGuard: CanActivateChildFn = (_route, state) => authorizeManager(state.url);
