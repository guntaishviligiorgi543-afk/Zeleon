import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Profile } from './profile';
import { provideRouter, Router } from '@angular/router';
import { Auth } from '../../services/auth';
import { createAuthStub } from '../../testing/auth-stub';
import { User } from '@supabase/supabase-js';
import { vi } from 'vitest';

describe('Profile', () => {
  let component: Profile;
  let fixture: ComponentFixture<Profile>;
  let auth: ReturnType<typeof createAuthStub>;

  beforeEach(async () => {
    auth = createAuthStub();
    auth.user.set({ id: 'user-1' } as User);
    await TestBed.configureTestingModule({
      imports: [Profile],
      providers: [provideRouter([]), { provide: Auth, useValue: auth }],
    }).compileComponents();

    fixture = TestBed.createComponent(Profile);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('leaves Profile after an external logout', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    auth.user.set(null);
    await fixture.whenStable();
    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: '/profile' }, replaceUrl: true });
  });
});
