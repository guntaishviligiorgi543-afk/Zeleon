import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Auth } from '../../services/auth';
import { SUPABASE_CLIENT } from '../../services/supabase';

@Component({
  selector: 'app-support-rating',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="rating-overlay" (mousedown)="onBackdrop($event)">
      <article
        class="rate-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rating-heading"
        tabindex="-1"
      >
        <button type="button" class="rate-close" aria-label="Close rating" (click)="close()">
          ×
        </button>
        <h1 id="rating-heading">Rate your experience</h1>
        @if (loading()) {
          <p role="status">Loading conversation…</p>
        } @else if (!auth.isAuthenticated()) {
          <p>Please sign in to submit your rating.</p>
          <a class="rate-submit" [routerLink]="['/login']" [queryParams]="{ returnUrl: returnPath }"
            >Sign in to rate</a
          >
        } @else if (accountMismatch()) {
          <p>
            <strong>You're signed in with a different account.</strong><br />This rating link is
            associated with another account. To submit your rating, please sign in with the account
            that received the email.
          </p>
          <button
            type="button"
            class="rate-submit"
            [disabled]="switching()"
            (click)="switchAccount()"
          >
            {{ switching() ? 'Switching…' : 'Switch Account' }}
          </button>
          <a class="rate-home" routerLink="/">Back to Home</a>
        } @else if (alreadyRated()) {
          <p class="rate-success">
            Thanks! You rated this conversation {{ alreadyRated() }} / 5 ★.
          </p>
        } @else if (eligible()) {
          <div
            class="rate-stars"
            role="group"
            aria-label="Choose a rating"
            (mouseleave)="hoveredRating.set(0)"
          >
            @for (star of [1, 2, 3, 4, 5]; track star) {
              <button
                type="button"
                [attr.aria-label]="star + (star === 1 ? ' star' : ' stars')"
                [attr.aria-pressed]="choice() === star"
                (mouseenter)="hoveredRating.set(star)"
                (focus)="hoveredRating.set(star)"
                (blur)="hoveredRating.set(0)"
                (click)="choice.set(star)"
                [class.is-highlighted]="star <= displayedRating()"
              >
                ★
              </button>
            }
          </div>
          <label for="rate-feedback">Your feedback (optional)</label>
          <textarea
            id="rate-feedback"
            rows="4"
            maxlength="2000"
            [value]="feedback()"
            (input)="feedback.set($any($event.target).value)"
            placeholder="Tell us about your experience (optional)..."
          ></textarea>
          <button
            type="button"
            class="rate-submit"
            [disabled]="!choice() || saving()"
            (click)="submit()"
          >
            {{ saving() ? 'Submitting…' : 'Submit Rating' }}
          </button>
        }
        @if (error()) {
          <p class="rate-error" role="alert">{{ error() }}</p>
        }
      </article>
    </section>
  `,
  styles: [
    `
      .rating-overlay {
        position: fixed;
        inset: 0;
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        box-sizing: border-box;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        color: #17324d;
      }
      .rate-card {
        position: relative;
        box-sizing: border-box;
        width: min(480px, 100%);
        max-height: calc(100dvh - 32px);
        overflow-y: auto;
        padding: 38px 30px;
        background: #fff;
        border-radius: 20px;
        box-shadow: 0 20px 70px #0003;
        text-align: center;
      }
      .rate-card h1 {
        font-size: clamp(23px, 4vw, 30px);
        margin: 14px 0 20px;
      }
      .rate-close {
        position: absolute;
        top: 6px;
        right: 8px;
        width: 44px;
        height: 44px;
        border: 0;
        background: transparent;
        color: #65728a;
        font-size: 30px;
        cursor: pointer;
      }
      .rate-stars {
        display: flex;
        justify-content: center;
        gap: 3px;
        margin: 16px 0 24px;
      }
      .rate-stars button {
        border: 0;
        background: transparent;
        font-size: clamp(36px, 9vw, 52px);
        padding: 4px;
        cursor: pointer;
        color: #a4b2c1;
        transition:
          color 180ms ease,
          transform 180ms ease;
      }
      .rate-stars button.is-highlighted {
        color: #e8a600;
      }
      @media (hover: hover) {
        .rate-stars button:hover {
          transform: scale(1.1);
        }
      }
      .rate-stars button:focus-visible,
      .rate-close:focus-visible {
        outline: 2px solid #55aee8;
        outline-offset: 3px;
      }
      .rate-card label {
        display: block;
        text-align: left;
        font-weight: 600;
        margin-bottom: 9px;
      }
      .rate-card textarea {
        box-sizing: border-box;
        width: 100%;
        padding: 13px;
        border: 1px solid #cbdde9;
        border-radius: 10px;
        resize: vertical;
      }
      .rate-submit {
        display: block;
        box-sizing: border-box;
        width: 100%;
        border: 0;
        background: #8fd0f5;
        color: #17324d;
        padding: 15px;
        border-radius: 30px;
        font-weight: 700;
        text-decoration: none;
        cursor: pointer;
        margin-top: 18px;
      }
      .rate-submit:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .rate-home {
        display: inline-block;
        margin-top: 16px;
        color: #527e9f;
      }
      .rate-error {
        color: #b42318;
      }
      .rate-success {
        color: #18794e;
      }
      @media (max-width: 480px) {
        .rate-card {
          padding: 34px 20px;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .rate-stars button {
          transition: none;
        }
        .rate-stars button:hover {
          transform: none;
        }
      }
    `,
  ],
})
export class SupportRatingPage {
  readonly auth = inject(Auth);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly client = inject(SUPABASE_CLIENT);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly subject = signal('');
  readonly alreadyRated = signal<number | null>(null);
  readonly feedback = signal('');
  readonly eligible = signal(false);
  readonly accountMismatch = signal(false);
  readonly switching = signal(false);
  private authRevision = 0;
  private lastUserId: string | null | undefined = undefined;
  readonly choice = signal(0);
  readonly hoveredRating = signal(0);
  readonly displayedRating = computed(() => this.hoveredRating() || this.choice());
  readonly conversationId = this.route.snapshot.paramMap.get('id') ?? '';
  readonly returnPath =
    '/rate-support/' +
    encodeURIComponent(this.conversationId) +
    (/^[1-5]$/.test(this.route.snapshot.queryParamMap.get('stars') ?? '')
      ? '?stars=' + this.route.snapshot.queryParamMap.get('stars')
      : '');
  constructor() {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    afterNextRender(() =>
      this.element.nativeElement.querySelector<HTMLElement>('.rate-card')?.focus(),
    );
    this.destroyRef.onDestroy(() => {
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    });
    const stars = Number(this.route.snapshot.queryParamMap.get('stars'));
    if (Number.isInteger(stars) && stars >= 1 && stars <= 5) this.choice.set(stars);
    effect(() => {
      if (!this.auth.initialized()) return;
      const userId = this.auth.user()?.id ?? null;
      if (this.lastUserId === undefined) {
        this.lastUserId = userId;
        return;
      }
      if (this.lastUserId === userId) return;
      this.lastUserId = userId;
      this.authRevision++;
      this.clearRatingState();
      // Revalidate against the new session instead of leaving the modal empty.
      // Explicit account switching is handled by switchAccount().
      if (!this.switching()) void this.load();
    });
    void this.load();
  }
  private clearRatingState(): void {
    this.choice.set(0);
    this.hoveredRating.set(0);
    this.feedback.set('');
    this.alreadyRated.set(null);
    this.eligible.set(false);
    this.accountMismatch.set(false);
    this.error.set('');
    this.subject.set('');
  }
  async switchAccount(): Promise<void> {
    if (this.switching()) return;
    this.switching.set(true);
    const destination = this.returnPath;
    try {
      await this.auth.signOut();
      this.clearRatingState();
      await this.router.navigate(['/login'], { queryParams: { returnUrl: destination } });
    } catch {
      this.error.set('Unable to switch accounts. Please try again.');
    } finally {
      this.switching.set(false);
    }
  }
  close(): void {
    void this.router.navigateByUrl('/');
  }
  onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }
  @HostListener('document:keydown.escape') onEscape(): void {
    this.close();
  }
  @HostListener('document:keydown', ['$event']) trapFocus(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const card = this.element.nativeElement.querySelector<HTMLElement>('.rate-card');
    const controls = card?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], textarea:not(:disabled)',
    );
    if (!card || !controls?.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === card)) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      (document.activeElement === last || !card.contains(document.activeElement))
    ) {
      event.preventDefault();
      first.focus();
    }
  }
  async load(): Promise<void> {
    const revision = ++this.authRevision;
    this.loading.set(true);
    this.alreadyRated.set(null);
    this.subject.set('');
    this.eligible.set(false);
    this.accountMismatch.set(false);
    this.error.set('');
    try {
      await this.auth.ready;
      if (revision !== this.authRevision) return;
      if (!this.auth.isAuthenticated()) return;
      const expectedUserId = this.auth.user()?.id;
      const { data: conversation, error } = await this.client
        .from('support_conversations')
        .select('id,subject,status,customer_user_id')
        .eq('id', this.conversationId)
        .maybeSingle();
      if (revision !== this.authRevision || expectedUserId !== this.auth.user()?.id) return;
      if (error) throw error;
      if (!conversation || conversation.customer_user_id !== expectedUserId)
        this.accountMismatch.set(true);
      else if (conversation.status !== 'resolved')
        this.error.set('This conversation has not been resolved yet.');
      else {
        this.subject.set(conversation.subject || 'Support request');
        const { data: rating, error: ratingError } = await this.client
          .from('support_ratings')
          .select('rating')
          .eq('conversation_id', this.conversationId)
          .maybeSingle();
        if (revision !== this.authRevision || expectedUserId !== this.auth.user()?.id) return;
        if (ratingError) throw ratingError;
        if (rating) this.alreadyRated.set(rating.rating);
        this.eligible.set(true);
      }
    } catch {
      if (revision === this.authRevision)
        this.error.set(
          'Unable to load this rating. Check your connection and reopen the rating link.',
        );
    } finally {
      if (revision === this.authRevision) this.loading.set(false);
    }
  }
  async submit(): Promise<void> {
    if (
      !this.eligible() ||
      !this.auth.isAuthenticated() ||
      this.saving() ||
      this.alreadyRated() ||
      this.choice() < 1 ||
      this.choice() > 5
    )
      return;
    this.saving.set(true);
    this.error.set('');
    try {
      const user = await this.auth.getCurrentUser();
      if (!user) throw new Error('Please sign in again.');
      const { error } = await this.client.from('support_ratings').insert({
        conversation_id: this.conversationId,
        customer_user_id: user.id,
        rating: this.choice(),
        feedback: this.feedback().trim().slice(0, 2000) || null,
      });
      if (error) throw error;
      this.alreadyRated.set(this.choice());
    } catch {
      this.error.set('Unable to save your rating. You may have already rated this conversation.');
    } finally {
      this.saving.set(false);
    }
  }
}
