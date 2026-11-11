import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { Auth } from '../../services/auth';
import { SUPABASE_CLIENT } from '../../services/supabase';
import { legacyRatingPath } from './rating-link';
import { SupportRatingPage } from './support-rating';

@Component({ template: 'Home' })
class HomeStub {}

describe('Rating email navigation', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  for (const stars of [1, 2, 3, 4, 5]) {
    for (const legacy of [true, false]) {
      it(`renders the modal for ${legacy ? 'legacy' : 'new'} ${stars}-star links`, async () => {
        TestBed.configureTestingModule({ providers: [
          provideRouter(routes.map(route => route.path === '' ? { ...route, component: HomeStub } : route)),
          { provide: Auth, useValue: { ready: Promise.resolve(), isAuthenticated: () => true } },
          { provide: SUPABASE_CLIENT, useValue: { from: (table: string) => ({ select: () => ({ eq: () => ({
            maybeSingle: async () => ({ data: table === 'support_conversations' ? { id, status: 'resolved' } : null, error: null }),
          }) }) }) } },
        ] });
        const harness = await RouterTestingHarness.create();
        const page = await harness.navigateByUrl(legacy ? `/?supportChat=${id}&supportRating=${stars}` : `/rate-support/${id}?stars=${stars}`, SupportRatingPage);
        await page.load();
        harness.detectChanges();
        expect(TestBed.inject(Router).url).toBe(`/rate-support/${id}?stars=${stars}`);
        expect(page.conversationId).toBe(id);
        expect(page.choice()).toBe(stars);
        expect(harness.routeNativeElement?.querySelector('[role="dialog"]')).not.toBeNull();
        expect(harness.routeNativeElement?.querySelector('.zc-widget')).toBeNull();
        expect(harness.routeNativeElement?.querySelectorAll('.is-highlighted').length).toBe(stars);
      });
    }
  }
  it('does not redirect ordinary chat links or invalid ratings', () => {
    expect(legacyRatingPath({ supportChat: id })).toBeNull();
    expect(legacyRatingPath({ supportChat: id, supportRating: '6' })).toBeNull();
    expect(legacyRatingPath({ supportChat: 'invalid', supportRating: '3' })).toBeNull();
  });
});
