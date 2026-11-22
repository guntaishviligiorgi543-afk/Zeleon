import { Component, inject, signal } from '@angular/core';
import { Auth } from '../../../services/auth';
import { ProfileAvatar } from '../../../services/profile-avatar';

@Component({
  imports: [],
  selector: 'app-your-info',
  styleUrl: './your-info.css',
  templateUrl: './your-info.html',
})
export class YourInfo {
  readonly auth = inject(Auth);
  readonly avatar = inject(ProfileAvatar);
  readonly preview = signal<string | null>(null);
  readonly selected = signal<File | null>(null);
  readonly error = signal('');
  readonly success = signal('');
  private previewObjectUrl: string | null = null;

  selectPhoto(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.clearSelection();
    this.error.set('');
    this.success.set('');
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !file.size || file.size > 5 * 1024 * 1024) {
      this.error.set('Select a JPG, PNG or WebP image up to 5 MB.');
      input.value = '';
      return;
    }
    this.selected.set(file);
    this.previewObjectUrl = URL.createObjectURL(file);
    this.preview.set(this.previewObjectUrl);
    input.value = '';
  }

  clearSelection(): void {
    if (this.previewObjectUrl) URL.revokeObjectURL(this.previewObjectUrl);
    this.previewObjectUrl = null;
    this.preview.set(null);
    this.selected.set(null);
  }

  async savePhoto(): Promise<void> {
    const file = this.selected();
    if (!file || this.avatar.saving()) return;
    this.error.set('');
    this.success.set('');
    try {
      await this.avatar.upload(file);
      this.clearSelection();
      this.success.set('Profile photo saved.');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to save the photo.');
    }
  }

  async removePhoto(): Promise<void> {
    if (this.avatar.saving()) return;
    this.error.set('');
    this.success.set('');
    try {
      await this.avatar.remove();
      this.clearSelection();
      this.success.set('Profile photo removed.');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to remove the photo.');
    }
  }
}
