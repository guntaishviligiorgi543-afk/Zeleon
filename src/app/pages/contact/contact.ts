import { Component, signal } from '@angular/core';

@Component({
  imports: [],
  selector: 'app-contact',
  styleUrl: './contact.css',
  templateUrl: './contact.html',
})
export class Contact {
  readonly openFaqs = signal<ReadonlySet<number>>(new Set());
  readonly sharedFaqs = signal<ReadonlySet<number>>(new Set());
  readonly shareError = signal('');

  async shareFaq(index: number): Promise<void> {
    this.shareError.set('');
    if (typeof window === 'undefined' || !window.navigator.clipboard?.writeText) {
      this.shareError.set('Link copying is unavailable in this browser.');
      return;
    }
    try {
      await window.navigator.clipboard.writeText(window.location.href);
      this.sharedFaqs.update((current) => new Set([...current, index]));
    } catch {
      this.shareError.set('Could not copy the link. Please try again.');
    }
  }

  toggleFaq(index: number): void {
    this.openFaqs.update((current) => current.has(index) ? new Set<number>() : new Set([index]));
  }
}
