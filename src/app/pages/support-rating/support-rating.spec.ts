import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Auth } from '../../services/auth';
import { SUPABASE_CLIENT } from '../../services/supabase';
import { SupportRatingPage } from './support-rating';

describe('Support rating stars', () => {
  const insert = vi.fn();
  beforeEach(() => insert.mockReset().mockResolvedValue({ error: null }));
  async function create(stars?: string) {
    const client = { from: (table: string) => ({ insert, select: () => ({ eq: () => ({
      maybeSingle: async () => ({ data: table === 'support_conversations'
        ? { id: 'conversation', subject: 'Help', status: 'resolved' } : null, error: null }),
    }) }) }) };
    await TestBed.configureTestingModule({
      imports: [SupportRatingPage],
      providers: [provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: {
          paramMap: convertToParamMap({ id: 'conversation' }),
          queryParamMap: convertToParamMap(stars === undefined ? {} : { stars }),
        } } },
        { provide: Auth, useValue: { ready: Promise.resolve(), isAuthenticated: () => true, getCurrentUser: async () => ({ id: 'customer' }) } },
        { provide: SUPABASE_CLIENT, useValue: client },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(SupportRatingPage);
    await fixture.componentInstance.load();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('submits once with optional feedback and shows success', async () => {
    const fixture = await create('4');
    fixture.componentInstance.feedback.set('Great help');
    await fixture.componentInstance.submit();
    await fixture.componentInstance.submit();
    fixture.detectChanges();
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith({ conversation_id: 'conversation', customer_user_id: 'customer', rating: 4, feedback: 'Great help' });
    expect(fixture.nativeElement.querySelector('.rate-success').textContent).toContain('4 / 5');
  });

  it('keeps the form and selection available after a failed save', async () => {
    const fixture = await create('3');
    insert.mockResolvedValueOnce({ error: { code: 'network' } });
    await fixture.componentInstance.submit();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('#rate-feedback')).not.toBeNull();
    expect(fixture.componentInstance.choice()).toBe(3);
    expect(fixture.componentInstance.saving()).toBe(false);
  });

  it('locks scrolling, traps focus, closes on Escape/backdrop, and restores scroll', async () => {
    const before = document.body.style.overflow;
    const fixture = await create();
    const navigate = vi.spyOn(TestBed.inject((await import('@angular/router')).Router), 'navigateByUrl').mockResolvedValue(true);
    expect(document.body.style.overflow).toBe('hidden');
    const close = fixture.nativeElement.querySelector('.rate-close') as HTMLButtonElement;
    const feedback = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    close.focus();
    close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(feedback);
    fixture.nativeElement.querySelector('.rate-card').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(navigate).not.toHaveBeenCalled();
    fixture.nativeElement.querySelector('.rating-overlay').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(navigate).toHaveBeenCalledWith('/');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(navigate).toHaveBeenCalledTimes(2);
    fixture.destroy();
    expect(document.body.style.overflow).toBe(before);
  });

  it('starts with five gray, unselected stars and disables submission', async () => {
    const fixture = await create();
    const buttons = fixture.nativeElement.querySelectorAll('.rate-stars button');
    expect(buttons.length).toBe(5);
    expect(fixture.nativeElement.querySelectorAll('.is-highlighted').length).toBe(0);
    expect(fixture.componentInstance.choice()).toBe(0);
    expect(fixture.componentInstance.displayedRating()).toBe(0);
    expect([...buttons].every((button: any) => button.getAttribute('aria-pressed') === 'false')).toBe(true);
    expect(fixture.nativeElement.querySelector('button.rate-submit').disabled).toBe(true);
  });

  it('previews every star in both directions without selecting, then clears on mouseleave', async () => {
    const fixture = await create();
    const buttons = fixture.nativeElement.querySelectorAll('.rate-stars button');
    for (const rating of [1, 2, 3, 4, 5, 4, 3, 2, 1]) {
      buttons[rating - 1].dispatchEvent(new MouseEvent('mouseenter'));
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('.is-highlighted').length).toBe(rating);
      expect(fixture.componentInstance.choice()).toBe(0);
    }
    fixture.nativeElement.querySelector('.rate-stars').dispatchEvent(new MouseEvent('mouseleave'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.is-highlighted').length).toBe(0);
  });

  it('keeps the clicked rating through hover and allows changing it', async () => {
    const fixture = await create();
    const buttons = fixture.nativeElement.querySelectorAll('.rate-stars button');
    buttons[2].click();
    buttons[4].dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    expect(fixture.componentInstance.choice()).toBe(3);
    expect(fixture.nativeElement.querySelectorAll('.is-highlighted').length).toBe(5);
    fixture.nativeElement.querySelector('.rate-stars').dispatchEvent(new MouseEvent('mouseleave'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.is-highlighted').length).toBe(3);
    expect(buttons[2].getAttribute('aria-pressed')).toBe('true');
    buttons[0].click();
    fixture.detectChanges();
    expect(fixture.componentInstance.choice()).toBe(1);
    expect(fixture.nativeElement.querySelectorAll('.is-highlighted').length).toBe(1);
    expect(buttons[0].getAttribute('aria-label')).toBe('1 star');
    buttons[0].focus();
    expect(document.activeElement).toBe(buttons[0]);
  });

  for (const rating of [1, 2, 3, 4, 5]) {
    it(`preserves email preselection of ${rating} stars`, async () => {
      const fixture = await create(String(rating));
      expect(fixture.componentInstance.choice()).toBe(rating);
      expect(fixture.nativeElement.querySelectorAll('.is-highlighted').length).toBe(rating);
    });
  }

  for (const value of ['0', '6', '2.5', 'invalid']) {
    it(`ignores invalid email preselection ${value}`, async () => {
      const fixture = await create(value);
      expect(fixture.componentInstance.choice()).toBe(0);
    });
  }
});
