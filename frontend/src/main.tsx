import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { registerSW } from 'virtual:pwa-register';
import { ApiError } from './api';
import { App } from './App';
import { AuthClient, loadConfig } from './auth';
import './styles.css';

registerSW({ immediate: true });

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Re-fetch when the app comes back to the foreground, so you see what
      // your partner changed while it was closed.
      refetchOnWindowFocus: true,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
});

const root = createRoot(document.getElementById('root')!);

loadConfig()
  .then((config) => {
    root.render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <App auth={new AuthClient(config)} />
          </BrowserRouter>
        </QueryClientProvider>
      </StrictMode>,
    );
  })
  .catch(() => {
    root.render(
      <div className="boot-error">
        <p>Couldn’t load the app. Check your connection and try again.</p>
        <button className="btn" onClick={() => location.reload()}>
          Retry
        </button>
      </div>,
    );
  });
