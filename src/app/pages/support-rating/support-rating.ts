import { Component, DestroyRef, HostListener, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Auth } from '../../services/auth';
import { SUPABASE_CLIENT } from '../../services/supabase';

@Component({
  selector: 'app-support-rating',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="rating-overlay" (mousedown)="onBackdrop($event)">
      <article class="rate-card" role="dialog" aria-modal="true" aria-labelledby="rating-heading" tabindex="-1">
        <button type="button" class="rate-close" aria-label="Close rating" (click)="close()">×</button>
        <h1 id="rating-heading">Rate your experience</h1>
        @if (loading()) { <p role="status">Loading conversation…</p> }
        @else if (error()) { <p class="rate-error" role="alert">{{ error() }}</p> }
        @else if (!auth.isAuthenticated()) {
          <p>Please sign in to submit your rating.</p>
          <a class="rate-submit" [routerLink]="['/login']" [queryParams]="{ returnUrl: returnPath }">Sign in to rate</a>
        } @else if (alreadyRated()) {
          <p class="rate-success">Thanks! You rated this conversation {{ alreadyRated() }} / 5 ★.</p>
        } @else {
          <div class="rate-stars" role="group" aria-label="Choose a rating" (mouseleave)="hovered.set(0)">
            @for (star of [1,2,3,4,5]; track star) {
              <button type="button" [attr.aria-label]="star + ' stars'" [attr.aria-pressed]="choice() === star" (mouseenter)="hovered.set(star)" (focus)="hovered.set(star)" (blur)="hovered.set(0)" (click)="choice.set(star)" [style.color]="star <= (hovered() || choice()) ? '#e8a600' : '#a4b2c1'">★</button>
            }
          </div>
          <label for="rate-feedback">Your feedback (optional)</label>
          <textarea id="rate-feedback" rows="4" maxlength="2000" [value]="feedback()" (input)="feedback.set($any($event.target).value)" placeholder="Tell us about your experience (optional)..."></textarea>
          <button type="button" class="rate-submit" [disabled]="!choice() || saving()" (click)="submit()">{{ saving() ? 'Submitting…' : 'Submit rating' }}</button>
        }

      </article>
    </section>
  `,
  styles: [`
    .rating-overlay{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:16px;box-sizing:border-box;background:rgba(0,0,0,.5);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);color:#17324d}
    .rate-card{position:relative;box-sizing:border-box;width:min(480px,100%);max-height:calc(100dvh - 32px);overflow-y:auto;padding:38px 30px;background:#fff;border-radius:20px;box-shadow:0 20px 70px #0003;text-align:center}
    .rate-card h1{font-size:clamp(23px,4vw,30px);margin:14px 0 20px}
    .rate-close{position:absolute;top:10px;right:14px;border:0;background:transparent;color:#65728a;font-size:30px;cursor:pointer}
    .rate-stars{display:flex;justify-content:center;gap:3px;margin:16px 0 24px}
    .rate-stars button{border:0;background:transparent;font-size:clamp(36px,9vw,52px);padding:4px;cursor:pointer;transition:color 180ms,transform 180ms}
    .rate-stars button:hover,.rate-stars button:focus-visible{transform:scale(1.1)}
    .rate-stars button:focus-visible,.rate-close:focus-visible{outline:2px solid #55aee8;outline-offset:3px}
    .rate-card label{display:block;text-align:left;font-weight:600;margin-bottom:9px}
    .rate-card textarea{box-sizing:border-box;width:100%;padding:13px;border:1px solid #cbdde9;border-radius:10px;resize:vertical}
    .rate-submit{display:block;box-sizing:border-box;width:100%;border:0;background:#8fd0f5;color:#17324d;padding:15px;border-radius:30px;font-weight:700;text-decoration:none;cursor:pointer;margin-top:18px}
    .rate-submit:disabled{opacity:.5;cursor:not-allowed}
    .rate-error{color:#b42318}.rate-success{color:#18794e}
    @media(max-width:480px){.rate-card{padding:34px 20px}}
    @media(prefers-reduced-motion:reduce){.rate-stars button{transition:none}}
  `],
})
export class SupportRatingPage {
  readonly auth = inject(Auth);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly hovered = signal(0);
  private readonly client = inject(SUPABASE_CLIENT);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly subject = signal('');
  readonly alreadyRated = signal<number | null>(null);
  readonly feedback = signal('');
  readonly choice = signal(0);
  readonly conversationId = this.route.snapshot.paramMap.get('id') ?? '';
  readonly returnPath = '/rate-support/' + encodeURIComponent(this.conversationId) + '?stars=' + this.route.snapshot.queryParamMap.get('stars');
  constructor() {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    this.destroyRef.onDestroy(() => { document.body.style.overflow = previousOverflow; });
    const stars = Number(this.route.snapshot.queryParamMap.get('stars'));
    if (Number.isInteger(stars) && stars >= 1 && stars <= 5) this.choice.set(stars);
    void this.load();
  }
  close(): void { void this.router.navigateByUrl('/'); }
  onBackdrop(event: MouseEvent): void { if (event.target === event.currentTarget) this.close(); }
  @HostListener('document:keydown.escape') onEscape(): void { this.close(); }
  async load(): Promise<void> {
    await this.auth.ready;
    if (!this.auth.isAuthenticated()) { this.loading.set(false); return; }
    const { data: conversation, error } = await this.client.from('support_conversations')
      .select('id,subject,status').eq('id', this.conversationId).maybeSingle();
    if (error || !conversation) this.error.set('Conversation not found or you do not have access.');
    else if (conversation.status !== 'resolved') this.error.set('This conversation has not been resolved yet.');
    else {
      this.subject.set(conversation.subject || 'Support request');
      const { data: rating } = await this.client.from('support_ratings').select('rating').eq('conversation_id', this.conversationId).maybeSingle();
      if (rating) this.alreadyRated.set(rating.rating);
    }
    this.loading.set(false);
  }
  async submit(): Promise<void> {
    if (this.saving() || this.alreadyRated() || this.choice() < 1 || this.choice() > 5) return;
    this.saving.set(true);this.error.set('');
    try {
      const user = await this.auth.getCurrentUser();
      if (!user) throw new Error('Please sign in again.');
      const { error } = await this.client.from('support_ratings').insert({
        conversation_id:this.conversationId,customer_user_id:user.id,rating:this.choice(),feedback:this.feedback().trim().slice(0,2000)||null,
      });
      if (error) throw error;
      this.alreadyRated.set(this.choice());
    } catch { this.error.set('Unable to save your rating. You may have already rated this conversation.'); }
    finally { this.saving.set(false); }
  }
}
