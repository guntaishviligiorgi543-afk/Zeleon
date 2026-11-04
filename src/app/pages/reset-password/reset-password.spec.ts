import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Auth } from '../../services/auth';
import { createAuthStub } from '../../testing/auth-stub';
import { ResetPassword } from './reset-password';

describe('ResetPassword', () => {
  it('requires a recovery session and returns to Login after backend success', async () => {
    const auth = createAuthStub();
    auth.user.set({ id: 'user-1' });
    auth.recovering.set(true);
    TestBed.configureTestingModule({ imports: [ResetPassword], providers: [
      provideRouter([]), { provide: Auth, useValue: auth },
    ] });
    const fixture = TestBed.createComponent(ResetPassword);
    const component = fixture.componentInstance;
    await fixture.whenStable();
    component.form.setValue({ password: 'new-password-123', confirmPassword: 'new-password-123' });
    await component.submit();
    fixture.detectChanges();
    expect(auth.updatePassword).toHaveBeenCalledWith('new-password-123');
    expect(auth.signOut).toHaveBeenCalledOnce();
    expect(component.done()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Your password has been updated successfully.');
    expect(fixture.nativeElement.querySelector('a[routerLink="/login"]')).not.toBeNull();
  });

  it('does not update password when confirmation does not match or recovery is absent', async () => {
    const auth = createAuthStub();
    TestBed.configureTestingModule({ imports: [ResetPassword], providers: [
      provideRouter([]), { provide: Auth, useValue: auth },
    ] });
    const fixture = TestBed.createComponent(ResetPassword);
    const component = fixture.componentInstance;
    await fixture.whenStable();
    component.form.setValue({ password: 'new-password-123', confirmPassword: 'different-password' });
    expect(component.form.invalid).toBe(true);
    await component.submit();
    expect(auth.updatePassword).not.toHaveBeenCalled();
  });
});
