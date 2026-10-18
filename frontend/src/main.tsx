import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { showError } from './dumb/errorBanner';
import { createAppRouter } from './router';
import './app.css';

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: showError }),
  // the server is local: a failure won't go away by retrying, and nothing changes behind the app's back
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});
const router = createAppRouter(queryClient);

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
