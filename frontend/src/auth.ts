// Sign-in. In production this talks straight to Cognito's API (no SDK
// needed). In local dev there are no passwords: you just pick who you are.

export interface AppConfig {
  mode: 'cognito' | 'local';
  apiUrl: string;
  region?: string;
  userPoolId?: string;
  userPoolClientId?: string;
}

export interface User {
  id: string;
  name: string;
  email?: string;
}

export class AuthError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface NewPasswordChallenge {
  session: string;
  username: string;
}

interface StoredSession {
  idToken: string;
  refreshToken: string;
  expiresAt: number;
}

const SESSION_KEY = 'cs.session';
const DEV_USER_KEY = 'cs.devUser';
const CONFIG_KEY = 'cs.config';

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable (private mode); the session just won't persist.
  }
}

export async function loadConfig(): Promise<AppConfig> {
  if (import.meta.env.DEV) return { mode: 'local', apiUrl: '/api' };
  try {
    const res = await fetch('/config.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const config: AppConfig = { mode: 'cognito', ...(await res.json()) };
    writeJson(CONFIG_KEY, config);
    return config;
  } catch (err) {
    // Offline: fall back to the last config we saw.
    const cached = readJson<AppConfig>(CONFIG_KEY);
    if (cached) return cached;
    throw err;
  }
}

function decodeJwt(token: string): Record<string, unknown> {
  const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(part), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

const FRIENDLY_ERRORS: Record<string, string> = {
  NotAuthorizedException: 'Incorrect email or password.',
  UserNotFoundException: 'Incorrect email or password.',
  InvalidPasswordException: 'That password is too weak — use at least 8 characters.',
  PasswordResetRequiredException: 'A password reset is required for this account.',
  TooManyRequestsException: 'Too many attempts. Wait a minute and try again.',
  LimitExceededException: 'Too many attempts. Wait a minute and try again.',
};

export class AuthClient {
  private refreshing: Promise<void> | null = null;

  constructor(public readonly config: AppConfig) {}

  currentUser(): User | null {
    if (this.config.mode === 'local') return readJson<User>(DEV_USER_KEY);
    const session = readJson<StoredSession>(SESSION_KEY);
    if (!session) return null;
    try {
      const claims = decodeJwt(session.idToken);
      return {
        id: String(claims.sub),
        name: String(claims.name ?? claims.email ?? 'You'),
        email: claims.email ? String(claims.email) : undefined,
      };
    } catch {
      return null;
    }
  }

  devSignIn(user: User): void {
    writeJson(DEV_USER_KEY, user);
  }

  /** Returns a challenge if Cognito wants a new password (first sign-in). */
  async signIn(email: string, password: string): Promise<NewPasswordChallenge | null> {
    const res = await this.cognito<{
      AuthenticationResult?: { IdToken: string; RefreshToken: string; ExpiresIn: number };
      ChallengeName?: string;
      Session?: string;
      ChallengeParameters?: Record<string, string>;
    }>('InitiateAuth', {
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: this.config.userPoolClientId,
      AuthParameters: { USERNAME: email.trim().toLowerCase(), PASSWORD: password },
    });

    if (res.AuthenticationResult) {
      this.saveSession(res.AuthenticationResult);
      return null;
    }
    if (res.ChallengeName === 'NEW_PASSWORD_REQUIRED' && res.Session) {
      return { session: res.Session, username: res.ChallengeParameters?.USER_ID_FOR_SRP ?? email.trim().toLowerCase() };
    }
    throw new AuthError(res.ChallengeName ?? 'Unknown', 'This account needs a sign-in step the app does not support.');
  }

  async completeNewPassword(challenge: NewPasswordChallenge, newPassword: string): Promise<void> {
    const res = await this.cognito<{
      AuthenticationResult?: { IdToken: string; RefreshToken: string; ExpiresIn: number };
    }>('RespondToAuthChallenge', {
      ChallengeName: 'NEW_PASSWORD_REQUIRED',
      ClientId: this.config.userPoolClientId,
      Session: challenge.session,
      ChallengeResponses: { USERNAME: challenge.username, NEW_PASSWORD: newPassword },
    });
    if (!res.AuthenticationResult) throw new AuthError('Unknown', 'Could not set the new password.');
    this.saveSession(res.AuthenticationResult);
  }

  signOut(): void {
    writeJson(SESSION_KEY, null);
    writeJson(DEV_USER_KEY, null);
  }

  /** Headers that identify the user to the API, refreshing tokens if needed. */
  async authHeaders(): Promise<Record<string, string>> {
    if (this.config.mode === 'local') {
      const user = this.currentUser();
      return user ? { 'x-dev-user': user.id } : {};
    }
    let session = readJson<StoredSession>(SESSION_KEY);
    if (!session) return {};
    if (session.expiresAt - Date.now() < 2 * 60_000) {
      this.refreshing ??= this.refresh(session).finally(() => (this.refreshing = null));
      await this.refreshing;
      session = readJson<StoredSession>(SESSION_KEY);
      if (!session) return {};
    }
    return { authorization: session.idToken };
  }

  private async refresh(session: StoredSession): Promise<void> {
    try {
      const res = await this.cognito<{ AuthenticationResult?: { IdToken: string; ExpiresIn: number } }>(
        'InitiateAuth',
        {
          AuthFlow: 'REFRESH_TOKEN_AUTH',
          ClientId: this.config.userPoolClientId,
          AuthParameters: { REFRESH_TOKEN: session.refreshToken },
        },
      );
      if (!res.AuthenticationResult) throw new AuthError('Unknown', 'Refresh failed');
      this.saveSession({ ...res.AuthenticationResult, RefreshToken: session.refreshToken });
    } catch (err) {
      // Only a rejected refresh token means "sign in again"; network errors
      // leave the session alone so the app recovers when back online.
      if (err instanceof AuthError && err.code === 'NotAuthorizedException') writeJson(SESSION_KEY, null);
      throw err;
    }
  }

  private saveSession(result: { IdToken: string; RefreshToken: string; ExpiresIn: number }): void {
    writeJson(SESSION_KEY, {
      idToken: result.IdToken,
      refreshToken: result.RefreshToken,
      expiresAt: Date.now() + result.ExpiresIn * 1000,
    } satisfies StoredSession);
  }

  private async cognito<T>(target: string, body: unknown): Promise<T> {
    const res = await fetch(`https://cognito-idp.${this.config.region}.amazonaws.com/`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-amz-json-1.1',
        'x-amz-target': `AWSCognitoIdentityProviderService.${target}`,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const code = String(data.__type ?? 'Error').split('#').pop()!;
      throw new AuthError(code, FRIENDLY_ERRORS[code] ?? data.message ?? 'Sign-in failed.');
    }
    return data as T;
  }
}
