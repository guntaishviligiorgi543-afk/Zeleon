import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Contact } from './contact';
import { vi } from 'vitest';

describe('Contact', () => {
  let component: Contact;
  let fixture: ComponentFixture<Contact>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Contact],
    }).compileComponents();

    fixture = TestBed.createComponent(Contact);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows shared feedback only for the item whose link was copied successfully', async () => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    try {
      const feedback = Array.from(fixture.nativeElement.querySelectorAll('.sharedResp')) as HTMLElement[];
      expect(feedback.every((item) => item.hidden)).toBe(true);
      await component.shareFaq(1);
      fixture.detectChanges();
      expect(writeText).toHaveBeenCalledWith(window.location.href);
      expect(feedback.map((item) => item.hidden)).toEqual([true, false, true, true, true]);
      writeText.mockRejectedValueOnce(new Error('Denied'));
      await component.shareFaq(2);
      fixture.detectChanges();
      expect(feedback[2].hidden).toBe(true);
      expect(component.shareError()).toContain('Could not copy');
    } finally {
      if (original) Object.defineProperty(navigator, 'clipboard', original);
      else Reflect.deleteProperty(navigator, 'clipboard');
    }
  });
});
