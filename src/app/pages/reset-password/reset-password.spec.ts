import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { User } from '@supabase/supabase-js';
import { Auth } from '../../services/auth';
import { createAuthStub } from '../../testing/auth-stub';
import { ResetPassword } from './reset-password';

describe('ResetPassword', () => {
  async function setup(signedIn = true) {
    const auth = createAuthStub();
    if (signedIn) auth.user.set({ id: 'user-1' } as User);
    TestBed.configureTestingModule({ imports: [ResetPassword], providers: [provideRouter([]), { provide: Auth, useValue: auth }] });
    const fixture = TestBed.createComponent(ResetPassword);
    await fixture.whenStable();
    return { auth, fixture, component: fixture.componentInstance };
  }

  it('rejects mismatched passwords and updates a valid new password', async () => {
    const { auth, component, fixture } = await setup();
    component.form.setValue({ password: 'newpassword', confirmPassword: 'different' });
    await component.submit();
    expect(auth.updatePassword).not.toHaveBeenCalled();
    component.form.controls.confirmPassword.setValue('newpassword');
    await component.submit();
    await fixture.whenStable();
    expect(auth.updatePassword).toHaveBeenCalledWith('newpassword');
    expect(component.done()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('updated successfully');
    expect(component.form.controls.password.value).toBe('');
  });

  it('handles missing/expired sessions and backend rejection', async () => {
    const { auth, component, fixture } = await setup(false);
    expect(fixture.nativeElement.textContent).toContain('missing or expired');
    component.form.setValue({ password: 'newpassword', confirmPassword: 'newpassword' });
    await component.submit();
    expect(auth.updatePassword).not.toHaveBeenCalled();
    auth.user.set({ id: 'user-1' } as User);
    auth.updatePassword.mockRejectedValueOnce({ code: 'same_password' });
    await component.submit();
    expect(component.status()).toContain('different from your current password');
    expect(component.done()).toBe(false);
  });
});
