import type { Product } from './models/product';
export const ORIGIN: string;
export const BRAND_IMAGE: string;
export const PAGES: Record<string, { title: string; description: string }>;
export function canonicalPath(path: string): string;
export function safeImage(value?: string): string;
export function serializeJson(value: unknown): string;
export function metadata(path: string, product?: Product | null): { title: string; description: string; canonical: string | null; image: string; schemas: Record<string, unknown>[] };
