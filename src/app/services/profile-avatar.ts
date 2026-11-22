import { Injectable, inject, signal, effect } from '@angular/core';
import { Auth } from './auth';
import { SUPABASE_CLIENT } from './supabase';

const BUCKET = 'avatars';
const MAX_SIZE = 5 * 1024 * 1024;
const TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function validateAvatar(file: File): string {
  const extension = TYPES[file.type];
  if (!extension || !file.size || file.size > MAX_SIZE) {
    throw new Error('Choose a JPG, PNG, or WebP image up to 5 MB.');
  }
  return extension;
}

@Injectable({ providedIn: 'root' })
export class ProfileAvatar {
  private readonly client = inject(SUPABASE_CLIENT);
  private readonly auth = inject(Auth);
  readonly url = signal<string | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  private path: string | null = null;
  private request = 0;

  constructor() {
    effect(() => {
      const id = this.auth.user()?.id;
      void this.load(id);
    });
  }

  private imageUrl(path: string): string {
    return this.client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl + '?v=' + encodeURIComponent(path);
  }

  private async load(id?: string): Promise<void> {
    const request = ++this.request;
    this.path = null;
    this.url.set(null);
    if (!id) return;
    this.loading.set(true);
    try {
      const { data, error } = await this.client.from('user_avatars')
        .select('storage_path').eq('user_id', id).maybeSingle();
      if (error) throw error;
      if (request !== this.request || this.auth.user()?.id !== id) return;
      this.path = data?.storage_path ?? null;
      this.url.set(this.path ? this.imageUrl(this.path) : null);
    } catch (error) {
      console.error('Could not load profile picture', error);
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }

  async upload(file: File): Promise<void> {
    const id = this.auth.user()?.id;
    if (!id) throw new Error('Sign in to upload a profile photo.');
    const extension = validateAvatar(file);
    if (this.saving()) return;
    const newPath = id + '/' + crypto.randomUUID() + '.' + extension;
    const oldPath = this.path;
    this.saving.set(true);
    try {
      const uploaded = await this.client.storage.from(BUCKET).upload(newPath, file, {
        contentType: file.type, upsert: false, cacheControl: '3600',
      });
      if (uploaded.error) throw uploaded.error;
      const stored = await this.client.from('user_avatars').upsert({
        user_id: id, storage_path: newPath, updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (stored.error || this.auth.user()?.id !== id) {
        await this.client.storage.from(BUCKET).remove([newPath]);
        throw stored.error ?? new Error('Your session changed during upload.');
      }
      this.path = newPath;
      this.url.set(this.imageUrl(newPath));
      if (oldPath && oldPath !== newPath) {
        const cleanup = await this.client.storage.from(BUCKET).remove([oldPath]);
        if (cleanup.error) console.warn('Old avatar cleanup failed', cleanup.error);
      }
    } finally {
      this.saving.set(false);
    }
  }

  async remove(): Promise<void> {
    const id = this.auth.user()?.id;
    if (!id) throw new Error('Sign in to remove a profile photo.');
    if (this.saving() || !this.path) return;
    const oldPath = this.path;
    this.saving.set(true);
    try {
      const deleted = await this.client.from('user_avatars').delete().eq('user_id', id);
      if (deleted.error) throw deleted.error;
      this.path = null;
      this.url.set(null);
      const removed = await this.client.storage.from(BUCKET).remove([oldPath]);
      if (removed.error) console.warn('Avatar storage cleanup failed', removed.error);
    } finally {
      this.saving.set(false);
    }
  }
}
