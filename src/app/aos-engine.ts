import { InjectionToken } from '@angular/core';
import type AOS from 'aos';

// AOS 2.3.4 ships a browser UMD distribution, not an ES module. Angular loads
// that exact installed file before main via the global scripts pipeline.
// Keep the legacy module out of the application's optimizable ES module graph.
export const AOS_ENGINE = new InjectionToken<typeof AOS>('AOS engine', {
  providedIn: 'root',
  factory: () => (globalThis as typeof globalThis & { AOS: typeof AOS }).AOS,
});
