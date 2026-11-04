import { DestroyRef, Directive, ElementRef, Renderer2, inject } from '@angular/core';

@Directive({
  selector: 'input[type="password"][appPasswordToggle]',
  standalone: true,
})
export class PasswordToggle {
  private readonly input = inject(ElementRef<HTMLInputElement>).nativeElement;
  private readonly renderer = inject(Renderer2);
  private readonly button: HTMLButtonElement;

  constructor() {
    const wrapper = this.renderer.createElement('span') as HTMLSpanElement;
    this.renderer.addClass(wrapper, 'password-field');
    this.renderer.insertBefore(this.input.parentNode, wrapper, this.input);
    this.renderer.appendChild(wrapper, this.input);

    this.button = this.renderer.createElement('button') as HTMLButtonElement;
    this.renderer.setAttribute(this.button, 'type', 'button');
    this.renderer.addClass(this.button, 'password-toggle');
    this.renderer.setAttribute(this.button, 'aria-label', 'Show password');
    this.renderer.setAttribute(this.button, 'aria-pressed', 'false');
    this.renderer.setProperty(this.button, 'innerHTML', PasswordToggle.hiddenIcon);
    this.renderer.appendChild(wrapper, this.button);
    const stopListening = this.renderer.listen(this.button, 'click', () => this.toggle());
    inject(DestroyRef).onDestroy(stopListening);
  }

  private toggle(): void {
    const visible = this.input.type === 'text';
    this.renderer.setAttribute(this.input, 'type', visible ? 'password' : 'text');
    this.renderer.setAttribute(this.button, 'aria-label', visible ? 'Show password' : 'Hide password');
    this.renderer.setAttribute(this.button, 'aria-pressed', String(!visible));
    this.renderer.setProperty(this.button, 'innerHTML', visible ? PasswordToggle.hiddenIcon : PasswordToggle.visibleIcon);
    this.input.focus();
  }

  static readonly hiddenIcon = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"></path><circle cx="12" cy="12" r="2.5"></circle></svg>';
  static readonly visibleIcon = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m3 3 18 18M10.6 6.2A10.7 10.7 0 0 1 12 6c6 0 9.5 6 9.5 6a17.5 17.5 0 0 1-3.1 3.8M6.2 6.8C3.9 8.3 2.5 12 2.5 12s3.5 6 9.5 6c1 0 1.9-.2 2.7-.5"></path></svg>';
}
