import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { vi } from 'vitest';
import { StaffAccess } from '../../services/staff-access';
import { StaffAuth } from './staff-auth';

describe('StaffAuth live validation', () => {
  async function setup() {
    const staff = { verifySecondaryAuthentication: vi.fn().mockResolvedValue(undefined) };
    const router = { navigateByUrl: vi.fn().mockResolvedValue(true) };
    TestBed.configureTestingModule({ imports: [StaffAuth], providers: [
      { provide: StaffAccess, useValue: staff }, { provide: Router, useValue: router },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ returnUrl: '/manager' }) } } },
    ] });
    const fixture = TestBed.createComponent(StaffAuth);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const input = async (selector: string, value: string) => {
      const field = element.querySelector(selector) as HTMLInputElement;
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      await fixture.whenStable();
    };
    const submit = () => element.querySelector('button[type="submit"]') as HTMLButtonElement;
    return { fixture, element, input, submit, staff, router };
  }

  it('starts disabled with placeholders and without premature error messages', async () => {
    const test = await setup();
    expect(test.submit().disabled).toBe(true);
    expect(test.element.querySelector('#staff-current-password')?.getAttribute('placeholder')).toBe('Enter your current password');
    expect(test.element.querySelector('#staff-code')?.getAttribute('placeholder')).toBe('Enter 6-digit code');
    expect(test.element.querySelector('#staff-password-error')?.textContent).toBe('');
    expect(test.element.querySelector('#staff-code-error')?.textContent).toBe('');
  });

  it('shows and clears the password error while typing without blur or submission', async () => {
    const test = await setup();
    await test.input('#staff-current-password', 'short');
    expect(test.element.querySelector('#staff-password-error')?.textContent).toContain('8–128');
    expect(test.element.querySelector('#staff-current-password')?.getAttribute('aria-invalid')).toBe('true');
    expect(test.staff.verifySecondaryAuthentication).not.toHaveBeenCalled();
    await test.input('#staff-current-password', 'valid-password');
    expect(test.element.querySelector('#staff-password-error')?.textContent).toBe('');
    await test.input('#staff-current-password', '');
    expect(test.element.querySelector('#staff-password-error')?.textContent).toContain('Enter your current');
    expect(test.submit().disabled).toBe(true);
  });

  it('shows incomplete and non-numeric code errors immediately', async () => {
    const test = await setup();
    await test.input('#staff-code', '12');
    expect(test.element.querySelector('#staff-code-error')?.textContent).toContain('all 6 digits');
    await test.input('#staff-code', '12ab56');
    expect(test.element.querySelector('#staff-code-error')?.textContent).toContain('numbers only');
    expect(test.submit().disabled).toBe(true);
    expect(test.staff.verifySecondaryAuthentication).not.toHaveBeenCalled();
  });

  it('enables submission only when both fields have a valid format and preserves leading zeroes', async () => {
    const test = await setup();
    await test.input('#staff-current-password', 'valid-password');
    expect(test.submit().disabled).toBe(true);
    await test.input('#staff-code', '012345');
    expect(test.submit().disabled).toBe(false);
    expect(test.element.querySelector('#staff-code-error')?.textContent).toBe('');
    await test.fixture.componentInstance.submit();
    expect(test.staff.verifySecondaryAuthentication).toHaveBeenCalledExactlyOnceWith('valid-password', '012345');
    expect(test.router.navigateByUrl).toHaveBeenCalledWith('/manager');
    expect(test.fixture.componentInstance.currentPassword.value).toBe('');
    expect(test.fixture.componentInstance.code.value).toBe('');
  });

  it('rejects invalid programmatic submissions as well as disabling the button', async () => {
    const test = await setup();
    test.fixture.componentInstance.currentPassword.setValue('short');
    test.fixture.componentInstance.code.setValue('123456');
    await test.fixture.componentInstance.submit();
    expect(test.staff.verifySecondaryAuthentication).not.toHaveBeenCalled();
  });

  it('blocks duplicate submissions and edits while verification is pending', async () => {
    const test = await setup();
    let complete!: () => void;
    test.staff.verifySecondaryAuthentication.mockImplementationOnce(() => new Promise<void>(resolve => { complete = resolve; }));
    await test.input('#staff-current-password', 'valid-password');
    await test.input('#staff-code', '123456');
    const request = test.fixture.componentInstance.submit();
    await test.fixture.whenStable();
    expect(test.submit().disabled).toBe(true);
    expect((test.element.querySelector('#staff-current-password') as HTMLInputElement).readOnly).toBe(true);
    await test.fixture.componentInstance.submit();
    expect(test.staff.verifySecondaryAuthentication).toHaveBeenCalledOnce();
    complete();
    await request;
  });

  it('keeps server verification errors and clears stale errors on the next edit', async () => {
    const test = await setup();
    test.staff.verifySecondaryAuthentication.mockRejectedValueOnce(new Error('Invalid authentication code'));
    await test.input('#staff-current-password', 'valid-password');
    await test.input('#staff-code', '123456');
    await test.fixture.componentInstance.submit();
    await test.fixture.whenStable();
    expect(test.element.querySelector('[role="alert"]')?.textContent).toContain('Invalid authentication code');
    expect(test.submit().disabled).toBe(true);
    expect(test.router.navigateByUrl).not.toHaveBeenCalled();
    await test.input('#staff-current-password', 'valid-password');
    expect(test.element.querySelector('[role="alert"]')).toBeNull();
  });
});
