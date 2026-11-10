import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Auth } from '../../services/auth';
import { SUPABASE_CLIENT } from '../../services/supabase';

@Component({
  selector: 'app-support-rating',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="rate-page">
      <article class="rate-card">
        <div class="rate-brand">⚡ ZELEON</div>
        <p class="rate-eyebrow">CUSTOMER SUPPORT</p>
        <h1>How was your support experience?</h1>
        <p>Your feedback helps us improve.</p>
        @if (loading()) { <p role="status">Loading conversation…</p> }
        @else if (error()) { <p class="rate-error" role="alert">{{ error() }}</p> }
        @else if (!auth.isAuthenticated()) {
          <p>Please sign in to submit your rating.</p>
          <a class="rate-submit" [routerLink]="['/login']" [queryParams]="{ returnUrl: returnPath }">Sign in to rate</a>
        } @else if (alreadyRated()) {
          <p class="rate-success">Thanks! You rated this conversation {{ alreadyRated() }} / 5 ★.</p>
        } @else {
          <p class="rate-subject">{{ subject() }}</p>
          <div class="rate-stars" role="group" aria-label="Choose a rating">
            @for (star of [1,2,3,4,5]; track star) {
              <button type="button" [attr.aria-label]="star + ' stars'" [attr.aria-pressed]="choice() === star" (click)="choice.set(star)" [style.color]="star <= choice() ? '#e8a600' : '#a4b2c1'">★</button>
            }
          </div>
          <label for="rate-feedback">Additional feedback (optional)</label>
          <textarea id="rate-feedback" rows="4" maxlength="2000" [value]="feedback()" (input)="feedback.set($any($event.target).value)" placeholder="Tell us about your experience…"></textarea>
          <button type="button" class="rate-submit" [disabled]="!choice() || saving()" (click)="submit()">{{ saving() ? 'Submitting…' : 'Submit rating' }}</button>
        }
        <a class="rate-back" routerLink="/">Back to ZELEON</a>
      </article>
    </section>
  `,
  styles: [`
    .rate-page{min-height:70vh;display:grid;place-items:center;padding:50px 18px;background:#f1f8ff;color:#17324d}
    .rate-card{box-sizing:border-box;width:min(100%,540px);padding:38px;background:#fff;border-radius:22px;box-shadow:0 12px 50px #17324d16;text-align:center}
    .rate-brand{font-size:27px;font-weight:800;letter-spacing:3px;color:#55aee8}
    .rate-eyebrow{font-size:12px;letter-spacing:2px}
    .rate-card h1{font-size:clamp(23px,4vw,32px);line-height:1.2;margin:22px 0 10px}
    .rate-card p{line-height:1.6}
    .rate-subject{padding:12px;background:#f1f8ff;border-radius:10px}
    .rate-stars{display:flex;justify-content:center;gap:4px;margin:22px 0}
    .rate-stars button{border:0;background:transparent;font-size:clamp(34px,8vw,52px);padding:3px;cursor:pointer}
    .rate-card label{display:block;text-align:left;font-weight:600;margin-bottom:9px}
    .rate-card textarea{box-sizing:border-box;width:100%;padding:13px;border:1px solid #cbdde9;border-radius:10px;resize:vertical}
    .rate-submit{display:block;box-sizing:border-box;width:100%;border:0;background:#8fd0f5;color:#17324d;padding:15px;border-radius:30px;font-weight:700;text-decoration:none;cursor:pointer;margin-top:18px}
    .rate-submit:disabled{opacity:.5;cursor:not-allowed}
    .rate-back{display:inline-block;margin-top:20px;color:#527e9f}
    .rate-error{color:#b42318}.rate-success{color:#18794e}
  `],
})
export class SupportRatingPage {
  readonly auth = inject(Auth);
  private readonly route = inject(ActivatedRoute);
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
    const stars = Number(this.route.snapshot.queryParamMap.get('stars'));
    if (Number.isInteger(stars) && stars >= 1 && stars <= 5) this.choice.set(stars);
    void this.load();
  }
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
