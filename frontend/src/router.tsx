import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, createRoute, createRouter, redirect } from '@tanstack/react-router';
import { App, RootError } from './App';
import { schemaQuery } from './entities/item/schema';
import { settingsQuery } from './entities/settings/queries';
import { EditPage } from './pages/edit/EditPage';
import { NotesPage } from './pages/notes/NotesPage';
import { validateNotesSearch } from './pages/notes/search';
import { QuestionsPage } from './pages/questions/QuestionsPage';
import { SettingsPage } from './pages/settings/SettingsPage';
import { TasksPage } from './pages/tasks/TasksPage';

const root = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: App,
  errorComponent: RootError,
  // the item language's schema is needed to show anything; without a data directory there's nothing to show
  beforeLoad: async ({ context: { queryClient }, location }) => {
    await queryClient.ensureQueryData(schemaQuery);
    const { path } = await queryClient.ensureQueryData(settingsQuery);
    if (!path && location.pathname !== '/settings') throw redirect({ to: '/settings' });
  },
});

/** /new and /edit/$file share one editor, so a new item keeps it when it moves to its URL */
const editor = createRoute({ getParentRoute: () => root, id: 'editor', component: EditPage });

const tree = root.addChildren([
  createRoute({ getParentRoute: () => root, path: '/', validateSearch: validateNotesSearch, component: () => <NotesPage /> }),
  createRoute({ getParentRoute: () => root, path: '/broken', validateSearch: validateNotesSearch, component: () => <NotesPage attention /> }),
  editor.addChildren([
    createRoute({ getParentRoute: () => editor, path: '/new' }),
    createRoute({ getParentRoute: () => editor, path: '/edit/$file' }),
  ]),
  createRoute({ getParentRoute: () => root, path: '/tasks', component: TasksPage }),
  createRoute({ getParentRoute: () => root, path: '/questions', component: QuestionsPage }),
  createRoute({ getParentRoute: () => root, path: '/settings', component: SettingsPage }),
]);

export const createAppRouter = (queryClient: QueryClient) => createRouter({ routeTree: tree, context: { queryClient } });

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
