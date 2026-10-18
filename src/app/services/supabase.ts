import { inject, InjectionToken, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

export const SUPABASE_CLIENT = new InjectionToken<SupabaseClient>('Public Supabase catalog client', {
  providedIn: 'root',
  factory: () => {
    if (!environment.supabasePublishableKey.startsWith('sb_publishable_')) {
      throw new Error('Set a Supabase public publishable key in src/environments/environment.ts.');
    }
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    return createClient(environment.supabaseUrl, environment.supabasePublishableKey, {
      // The callback route explicitly exchanges PKCE codes once on this shared client.
      auth: { persistSession: browser, autoRefreshToken: browser, detectSessionInUrl: false, flowType: 'pkce' },
    });
  },
});
