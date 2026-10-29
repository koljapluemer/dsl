import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, createRoute, createRouter, redirect, retainSearchParams } from '@tanstack/react-router';
import { App, RootError, TABS } from './App';
import { schemaQuery } from './entities/item/schema';
import { SIDEBAR_KEYS, validateSidebarSearch, type SidebarSearch } from './entities/item/sidebar';
import { settingsQuery } from './entities/settings/queries';
import { CalendarPage } from './pages/calendar/CalendarPage';
import { CanvasPage } from './pages/workspaces/canvas/CanvasPage';
import { validateCanvasSearch } from './pages/workspaces/canvas/search';
import { Canvas2DocPage } from './pages/workspaces/canvas2doc/Canvas2DocPage';
import { validateCanvas2DocSearch } from './pages/workspaces/canvas2doc/search';
import { Doc2TypstPage } from './pages/workspaces/doc2typst/Doc2TypstPage';
import { validateDoc2TypstSearch } from './pages/workspaces/doc2typst/search';
import { validateCalendarSearch } from './pages/calendar/search';
import { DeskPage } from './pages/desk/DeskPage';
import { validateDeskSearch } from './pages/desk/search';
import { DocumentPage } from './pages/workspaces/document/DocumentPage';
import { validateDocumentSearch } from './pages/workspaces/document/search';
import { ExplorationsPage } from './pages/explorations/ExplorationsPage';
import { validateExplorationsSearch } from './pages/explorations/explorations';
import { FloatPage } from './pages/float/FloatPage';
import { GoalsPage } from './pages/goals/GoalsPage';
import { GraphPage } from './pages/graph/GraphPage';
import { HomePage } from './pages/home/HomePage';
import { PortfolioPage } from './pages/portfolio/PortfolioPage';
import { ProjectsPage } from './pages/projects/ProjectsPage';
import { PublishedPage } from './pages/published/PublishedPage';
import { validatePublishedSearch } from './pages/published/published';
import { QuestionsPage } from './pages/questions/QuestionsPage';
import { QueuePage } from './pages/queue/QueuePage';
import { SettingsPage } from './pages/settings/SettingsPage';
import { SourcesPage } from './pages/sources/SourcesPage';
import { validateSourcesSearch } from './pages/sources/sources';
import { SuggestPage } from './pages/suggest/SuggestPage';
import { TagsPage } from './pages/tags/TagsPage';
import { TasksPage } from './pages/tasks/TasksPage';

const root = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: App,
  errorComponent: RootError,
  // the note sidebar's state, on every page and kept across navigations
  validateSearch: validateSidebarSearch,
  search: { middlewares: [retainSearchParams<SidebarSearch>([...SIDEBAR_KEYS])] },
  // the item language's schema is needed to show anything; without a data directory there's nothing to show
  beforeLoad: async ({ context: { queryClient }, location }) => {
    await queryClient.ensureQueryData(schemaQuery);
    const { path } = await queryClient.ensureQueryData(settingsQuery);
    if (!path && location.pathname !== '/settings') throw redirect({ to: '/settings' });
  },
});

const tree = root.addChildren([
  createRoute({ getParentRoute: () => root, path: '/', component: () => <HomePage views={TABS} /> }),
  createRoute({ getParentRoute: () => root, path: '/broken', beforeLoad: () => { throw redirect({ to: '/tasks' }); } }),
  // the older address of a note's editor: the note open in the sidebar
  createRoute({ getParentRoute: () => root, path: '/edit/$file', beforeLoad: ({ params }) => { throw redirect({ to: '/', search: { sopen: [params.file] } }); } }),
  createRoute({ getParentRoute: () => root, path: '/desk', validateSearch: validateDeskSearch, component: DeskPage }),
  createRoute({ getParentRoute: () => root, path: '/document', validateSearch: validateDocumentSearch, component: DocumentPage }),
  createRoute({ getParentRoute: () => root, path: '/canvas', validateSearch: validateCanvasSearch, component: CanvasPage }),
  createRoute({ getParentRoute: () => root, path: '/canvas2doc', validateSearch: validateCanvas2DocSearch, component: Canvas2DocPage }),
  createRoute({ getParentRoute: () => root, path: '/doc2typst', validateSearch: validateDoc2TypstSearch, component: Doc2TypstPage }),
  createRoute({ getParentRoute: () => root, path: '/explorations', validateSearch: validateExplorationsSearch, component: ExplorationsPage }),
  createRoute({ getParentRoute: () => root, path: '/graph', component: GraphPage }),
  createRoute({ getParentRoute: () => root, path: '/tasks', component: TasksPage }),
  createRoute({ getParentRoute: () => root, path: '/goals', component: GoalsPage }),
  createRoute({ getParentRoute: () => root, path: '/projects', component: ProjectsPage }),
  createRoute({ getParentRoute: () => root, path: '/sources', validateSearch: validateSourcesSearch, component: SourcesPage }),
  createRoute({ getParentRoute: () => root, path: '/published', validateSearch: validatePublishedSearch, component: PublishedPage }),
  createRoute({ getParentRoute: () => root, path: '/portfolio', component: PortfolioPage }),
  createRoute({ getParentRoute: () => root, path: '/questions', component: QuestionsPage }),
  createRoute({ getParentRoute: () => root, path: '/calendar', validateSearch: validateCalendarSearch, component: CalendarPage }),
  createRoute({ getParentRoute: () => root, path: '/queue', component: QueuePage }),
  createRoute({ getParentRoute: () => root, path: '/float', component: FloatPage }),
  createRoute({ getParentRoute: () => root, path: '/tags', component: TagsPage }),
  createRoute({ getParentRoute: () => root, path: '/suggest', component: SuggestPage }),
  createRoute({ getParentRoute: () => root, path: '/settings', component: SettingsPage }),
]);

export const createAppRouter = (queryClient: QueryClient) => createRouter({ routeTree: tree, context: { queryClient } });

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
