import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/environments/environment.ts', import.meta.url), 'utf8');
const url = source.match(/supabaseUrl:\s*'([^']+)'/)?.[1];
const key = source.match(/supabasePublishableKey:\s*'([^']+)'/)?.[1];
if (!url || !key?.startsWith('sb_publishable_')) throw new Error('Missing public Supabase configuration');
const response = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
if (!response.ok) throw new Error(`Auth settings request failed (${response.status})`);
const settings = await response.json();
console.log(JSON.stringify({
  emailProviderEnabled: settings.external?.email,
  signupDisabled: settings.disable_signup,
  emailAutoConfirm: settings.mailer_autoconfirm,
  note: 'Public read-only settings endpoint. Site URL, redirect allowlist and SMTP settings require dashboard review.',
}, null, 2));
