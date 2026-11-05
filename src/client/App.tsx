import React, { Suspense, lazy } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Toaster } from "sonner";
import { Shell } from "./workspace/Shell.js";
import { Loading, ErrorState } from "./workspace/ui.js";
import { Home } from "./workspace/pages/Home.js";
const Library = lazy(() =>
  import("./workspace/pages/Library.js").then((m) => ({ default: m.Library })),
);
const Notebooks = lazy(() =>
  import("./workspace/pages/Notebooks.js").then((m) => ({
    default: m.Notebooks,
  })),
);
const Notebook = lazy(() =>
  import("./workspace/pages/Notebooks.js").then((m) => ({
    default: m.Notebook,
  })),
);
const Sheet = lazy(() =>
  import("./workspace/pages/Sheet.js").then((m) => ({ default: m.Sheet })),
);
const Review = lazy(() =>
  import("./workspace/pages/Review.js").then((m) => ({ default: m.Review })),
);
const Insights = lazy(() =>
  import("./workspace/pages/Insights.js").then((m) => ({
    default: m.Insights,
  })),
);
const Inbox = lazy(() =>
  import("./workspace/pages/Inbox.js").then((m) => ({ default: m.Inbox })),
);
const Settings = lazy(() =>
  import("./workspace/pages/Settings.js").then((m) => ({
    default: m.Settings,
  })),
);
const Editor = lazy(() => import("./workspace/pages/Editor.js"));
const Practice = lazy(() => import("./workspace/pages/Practice.js"));
const Reader = lazy(() => import("./workspace/pages/Reader.js"));
const Problem = lazy(() => import("./workspace/pages/Problem.js"));
const client = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: true },
    mutations: { retry: 0 },
  },
});
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: unknown }
> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    return this.state.error ? (
      <ErrorState
        error={this.state.error}
        retry={() => window.location.reload()}
      />
    ) : (
      this.props.children
    );
  }
}
export function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={client}>
        <HashRouter>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route element={<Shell />}>
                <Route index element={<Home />} />
                <Route path="home" element={<Navigate to="/" replace />} />
                <Route path="library" element={<Library />} />
                <Route path="notes" element={<Library initialKind="note" />} />
                <Route path="trash" element={<Library trash />} />
                <Route path="notebooks" element={<Notebooks />} />
                <Route
                  path="subjects"
                  element={<Navigate to="/notebooks" replace />}
                />
                <Route
                  path="sources"
                  element={<Navigate to="/library?kind=sheet" replace />}
                />
                <Route path="notebook/:id" element={<Notebook />} />
                <Route path="subject/:id" element={<Notebook />} />
                <Route path="source/:id" element={<Sheet />} />
                <Route path="note/:id" element={<Editor />} />
                <Route path="document/:id" element={<Editor document />} />
                <Route path="pdf/:id" element={<Reader />} />
                <Route path="problem/:id" element={<Problem />} />
                <Route path="practice" element={<Practice />} />
                <Route path="practice/:id" element={<Practice />} />
                <Route
                  path="log"
                  element={<Navigate to="/practice" replace />}
                />
                <Route
                  path="log/:sourceId"
                  element={<Practice legacySource />}
                />
                <Route path="log/session/:id" element={<Practice />} />
                <Route path="review" element={<Review />} />
                <Route path="insights" element={<Insights />} />
                <Route
                  path="analytics"
                  element={<Navigate to="/insights" replace />}
                />
                <Route path="inbox" element={<Inbox />} />
                <Route path="settings" element={<Settings />} />
                <Route
                  path="*"
                  element={
                    <div className="page">
                      <ErrorState
                        error={
                          new Error(
                            "This page has moved. Use the sidebar to find your workspace.",
                          )
                        }
                        retry={() => {
                          window.location.hash = "/";
                        }}
                      />
                    </div>
                  }
                />
              </Route>
            </Routes>
          </Suspense>
        </HashRouter>
        <Toaster position="bottom-right" richColors closeButton />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
export default App;
