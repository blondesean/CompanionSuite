import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { AuthError, type AuthClient, type NewPasswordChallenge } from '../auth';
import { ErrorNote, Loading } from '../components/ui';

export function Login({ auth, onSignedIn }: { auth: AuthClient; onSignedIn(): void }) {
  return (
    <main className="login">
      <div className="login-card">
        <img src="/icon-192.png" alt="" className="login-logo" />
        <h1>CompanionSuite</h1>
        <p className="muted">Chores, meals and to-dos for the two of you.</p>
        {auth.config.mode === 'local' ? (
          <DevLogin auth={auth} onSignedIn={onSignedIn} />
        ) : (
          <PasswordLogin auth={auth} onSignedIn={onSignedIn} />
        )}
      </div>
    </main>
  );
}

function DevLogin({ auth, onSignedIn }: { auth: AuthClient; onSignedIn(): void }) {
  const members = useQuery({ queryKey: ['devMembers'], queryFn: api.devMembers });
  if (members.isLoading) return <Loading />;
  if (members.error) return <ErrorNote error={new Error('Start the dev API with `npm run dev` from the repo root.')} />;
  return (
    <div className="stack">
      <p className="hint">Local dev mode — pick who you are.</p>
      {members.data?.map((m) => (
        <button
          key={m.id}
          className="btn btn-primary btn-block"
          onClick={() => {
            auth.devSignIn(m);
            onSignedIn();
          }}
        >
          Continue as {m.name}
        </button>
      ))}
    </div>
  );
}

function PasswordLogin({ auth, onSignedIn }: { auth: AuthClient; onSignedIn(): void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [challenge, setChallenge] = useState<NewPasswordChallenge | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (challenge) {
        await auth.completeNewPassword(challenge, newPassword);
        onSignedIn();
      } else {
        const next = await auth.signIn(email, password);
        if (next) setChallenge(next);
        else onSignedIn();
      }
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'Could not reach the server. Check your connection.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      {challenge ? (
        <>
          <p className="hint">Welcome! Choose your own password to finish setting up.</p>
          <label className="field">
            <span>New password</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoFocus
            />
          </label>
        </>
      ) : (
        <>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="username"
              inputMode="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        </>
      )}
      {error && <p className="form-error">{error}</p>}
      <button className="btn btn-primary btn-block" disabled={busy}>
        {busy ? 'Signing in…' : challenge ? 'Set password' : 'Sign in'}
      </button>
    </form>
  );
}
