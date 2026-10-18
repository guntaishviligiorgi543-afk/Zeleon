import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth } from '../services/auth';

export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(Auth);
  const router = inject(Router);
  await auth.ready;
  if (auth.recovering()) return router.createUrlTree(['/reset-password']);
  return auth.user() ? true : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

export const guestGuard: CanActivateFn = async () => {
  const auth = inject(Auth);
  const router = inject(Router);
  await auth.ready;
  if (auth.recovering()) return router.createUrlTree(['/reset-password']);
  return auth.user() ? router.createUrlTree(['/profile']) : true;
};
