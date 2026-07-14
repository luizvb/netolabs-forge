import { createInternalNeonAuth } from '@neondatabase/neon-js/auth';

const neonAuthUrl = import.meta.env.VITE_NEON_AUTH_URL?.trim();
export const neonAuth = neonAuthUrl ? createInternalNeonAuth(neonAuthUrl) : null;
export const neonAuthAvailable = Boolean(neonAuth);

export async function neonAccessToken() {
  if (!neonAuth) return null;
  return neonAuth.getJWTToken();
}

export async function signInWithGoogle(callbackPath = '/auth') {
  if (!neonAuth) throw new Error('O Google ainda não foi configurado neste ambiente.');
  await neonAuth.adapter.signIn.social({ provider: 'google', callbackURL: `${window.location.origin}${callbackPath}` });
}

export async function signOutNeon() {
  if (neonAuth) await neonAuth.adapter.signOut();
}
