import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, createRoute, createRouter, redirect } from '@tanstack/react-router';
import { App, RootError } from './App';
import { schemaQuery } from './entities/item/schema';
import { settingsQuery } from './entities/settings/queries';
import { CalendarPage } from './pages/calendar/CalendarPage';
import { validateCalendarSearch } from './pages/calendar/search';
import { EditPage } from './pages/edit/EditPage';
import { FloatPage } from './pages/float/FloatPage';
import { GraphPage } from './pages/graph/GraphPage';
import { NotesPage } from './pages/notes/NotesPage';
import { validateNotesSearch } from './pages/notes/search';
import { ProjectsPage } from './pages/projects/ProjectsPage';
import { QuestionsPage } from './pages/questions/QuestionsPage';
import { QueuePage } from './pages/queue/QueuePage';
import { SettingsPage } from './pages/settings/SettingsPage';
import { SourceEditPage } from './pages/sources/SourceEditPage';
import { SourcesPage } from './pages/sources/SourcesPage';
import { validateSourcesSearch } from './pages/sources/sources';
import { SuggestPage } from './pages/suggest/SuggestPage';
import { TasksPage } from './pages/tasks/TasksPage';
import { ZeroPage } from './pages/zero/ZeroPage';

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

/** like `editor`, for the sources' form */
const sourceEditor = createRoute({ getParentRoute: () => root, id: 'source-editor', component: SourceEditPage });

const tree = root.addChildren([
  createRoute({ getParentRoute: () => root, path: '/', validateSearch: validateNotesSearch, component: () => <NotesPage /> }),
  createRoute({ getParentRoute: () => root, path: '/broken', validateSearch: validateNotesSearch, component: () => <NotesPage attention /> }),
  editor.addChildren([
    createRoute({ getParentRoute: () => editor, path: '/new' }),
    createRoute({ getParentRoute: () => editor, path: '/edit/$file' }),
  ]),
  createRoute({ getParentRoute: () => root, path: '/graph', component: GraphPage }),
  createRoute({ getParentRoute: () => root, path: '/tasks', component: TasksPage }),
  createRoute({ getParentRoute: () => root, path: '/projects', component: ProjectsPage }),
  createRoute({ getParentRoute: () => root, path: '/sources', validateSearch: validateSourcesSearch, component: SourcesPage }),
  sourceEditor.addChildren([
    createRoute({ getParentRoute: () => sourceEditor, path: '/sources/new' }),
    createRoute({ getParentRoute: () => sourceEditor, path: '/sources/edit/$file' }),
  ]),
  createRoute({ getParentRoute: () => root, path: '/questions', component: QuestionsPage }),
  createRoute({ getParentRoute: () => root, path: '/calendar', validateSearch: validateCalendarSearch, component: CalendarPage }),
  createRoute({ getParentRoute: () => root, path: '/queue', component: QueuePage }),
  createRoute({ getParentRoute: () => root, path: '/float', component: FloatPage }),
  createRoute({ getParentRoute: () => root, path: '/zero', component: ZeroPage }),
  createRoute({ getParentRoute: () => root, path: '/suggest', component: SuggestPage }),
  createRoute({ getParentRoute: () => root, path: '/settings', component: SettingsPage }),
]);

export const createAppRouter = (queryClient: QueryClient) => createRouter({ routeTree: tree, context: { queryClient } });

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
