import * as SecureStore from 'expo-secure-store';
import type { MobileAuthSession } from '../contracts';

const SESSION_KEY = 'leword.mobile.session.v1';

export interface StoredMobileSession {
  session: MobileAuthSession;
  savedAt: string;
}

function isValidSession(value: any): value is MobileAuthSession {
  return !!value
    && value.ok === true
    && typeof value.accessToken === 'string'
    && value.accessToken.trim().length > 0
    && typeof value.apiBaseUrl === 'string'
    && value.apiBaseUrl.trim().length > 0
    && typeof value.userId === 'string';
}

export function parseStoredMobileSession(raw: string | null): StoredMobileSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const session = parsed?.session || parsed;
    if (!isValidSession(session)) return null;

    return {
      session: {
        ...session,
        apiBaseUrl: session.apiBaseUrl.replace(/\/+$/, ''),
      },
      savedAt: typeof parsed?.savedAt === 'string' ? parsed.savedAt : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

export async function loadMobileSession(): Promise<StoredMobileSession | null> {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  return parseStoredMobileSession(raw);
}

export async function saveMobileSession(session: MobileAuthSession): Promise<void> {
  if (!isValidSession(session)) return;
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify({
    session: {
      ...session,
      apiBaseUrl: session.apiBaseUrl.replace(/\/+$/, ''),
    },
    savedAt: new Date().toISOString(),
  }));
}

export async function clearMobileSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}
