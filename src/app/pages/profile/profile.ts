import { Component, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Auth } from '../../services/auth';

@Component({
  imports: [],
  selector: 'app-profile',
  styleUrl: './profile.css',
  templateUrl: './profile.html',
})
export class Profile {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);

  constructor() {
    effect(() => {
      if (this.auth.initialized() && !this.auth.user()) {
        void this.router.navigate(['/login'], { queryParams: { returnUrl: '/profile' }, replaceUrl: true });
      }
    });
  }
}
