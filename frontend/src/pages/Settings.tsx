import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { useSession } from '../App';
import { PageHeader } from '../components/ui';
import { currentSubscription, disablePush, enablePush, isStandalone, pushSupport } from '../push';

export function Settings() {
  const { user, auth, signOut } = useSession();

  return (
    <main className="page">
      <PageHeader title="Settings" />

      <section className="card">
        <h2 className="card-title">Account</h2>
        <p>
          Signed in as <strong>{user.name}</strong>
          {user.email && <span className="muted"> · {user.email}</span>}
        </p>
        {auth.config.mode === 'local' && (
          <p className="hint">Local dev mode — data is saved in api/.local-data.json.</p>
        )}
        <button className="btn btn-danger-outline" onClick={signOut}>
          Sign out
        </button>
      </section>

      <NotificationSettings />

      {!isStandalone() && (
        <section className="card">
          <h2 className="card-title">Put it on your Home Screen</h2>
          <ol className="steps">
            <li>Open this page in Safari.</li>
            <li>
              Tap the <strong>Share</strong> button.
            </li>
            <li>
              Choose <strong>Add to Home Screen</strong>.
            </li>
          </ol>
          <p className="hint">It then opens full-screen like a normal app, and can send reminders.</p>
        </section>
      )}
    </main>
  );
}

function NotificationSettings() {
  const support = pushSupport();
  const key = useQuery({ queryKey: ['pushKey'], queryFn: api.pushKey, enabled: support === 'supported' });
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (support === 'supported') currentSubscription().then((s) => setSubscribed(!!s));
  }, [support]);

  async function run(action: () => Promise<string | void>) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await action();
      if (result) setMessage(result);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'That didn’t work.');
    } finally {
      setBusy(false);
    }
  }

  let body;
  if (support === 'needs-install') {
    body = <p>Add the app to your Home Screen first (see below) — iPhones only allow reminders from installed apps.</p>;
  } else if (support === 'unsupported') {
    body = <p>This browser can’t receive notifications.</p>;
  } else if (key.data && !key.data.publicKey) {
    body = <p className="muted">Reminders aren’t set up on the server yet (run the VAPID setup step).</p>;
  } else if (subscribed) {
    body = (
      <>
        <p>✅ Reminders are on for this device.</p>
        <div className="row">
          <button
            className="btn"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const { sent } = await api.testPush();
                return sent ? 'Test sent — it should appear in a few seconds.' : 'No devices received it. Try turning reminders off and on.';
              })
            }
          >
            Send a test
          </button>
          <button
            className="btn btn-ghost"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await disablePush();
                setSubscribed(false);
              })
            }
          >
            Turn off
          </button>
        </div>
      </>
    );
  } else {
    body = (
      <>
        <p>Get to-do reminders on this device.</p>
        <button
          className="btn btn-primary"
          disabled={busy || !key.data?.publicKey}
          onClick={() =>
            run(async () => {
              await enablePush(key.data!.publicKey!);
              setSubscribed(true);
              return 'Reminders are on.';
            })
          }
        >
          Turn on reminders
        </button>
      </>
    );
  }

  return (
    <section className="card">
      <h2 className="card-title">Notifications</h2>
      {body}
      {message && <p className="hint">{message}</p>}
    </section>
  );
}
