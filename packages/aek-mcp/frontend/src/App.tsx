import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ServerProvider } from './contexts/ServerContext';
import { SettingsProvider } from './contexts/SettingsContext';
import MainLayout from './layouts/MainLayout';
import ProtectedRoute from './components/ProtectedRoute';
import EmbeddingSyncAlertListener from './components/EmbeddingSyncAlertListener';
import { getBasePath } from './utils/runtime';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const ServersPage = lazy(() => import('./pages/ServersPage'));
const GroupsPage = lazy(() => import('./pages/GroupsPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const LogsPage = lazy(() => import('./pages/LogsPage'));
const ActivityPage = lazy(() => import('./pages/ActivityPage'));
const PromptsPage = lazy(() => import('./pages/PromptsPage'));
const ResourcesPage = lazy(() => import('./pages/ResourcesPage'));

const RouteFallback: React.FC = () => (
  <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">
    Loading...
  </div>
);

function App() {
  const basename = getBasePath();
  return (
    <ThemeProvider>
      <AuthProvider>
        <ServerProvider>
          <ToastProvider>
            <SettingsProvider>
              <Router basename={basename}>
                <EmbeddingSyncAlertListener />
                <Routes>
                  {/* 公共路由 */}
                  <Route
                    path="/login"
                    element={
                      <Suspense fallback={<RouteFallback />}>
                        <LoginPage />
                      </Suspense>
                    }
                  />

                  {/* 受保护的路由，使用 MainLayout 作为布局容器 */}
                  <Route element={<ProtectedRoute />}>
                    <Route element={<MainLayout />}>
                      <Route path="/" element={<Navigate to="/servers" replace />} />
                      <Route path="/servers" element={<ServersPage />} />
                      <Route path="/groups" element={<GroupsPage />} />
                      <Route path="/prompts" element={<PromptsPage />} />
                      <Route path="/resources" element={<ResourcesPage />} />
                      <Route path="/users" element={<UsersPage />} />
                      <Route path="/logs" element={<LogsPage />} />
                      <Route path="/activity" element={<ActivityPage />} />
                      <Route path="/settings" element={<SettingsPage />} />
                    </Route>
                  </Route>

                  {/* 未匹配的路由重定向到首页 */}
                  <Route path="*" element={<Navigate to="/" />} />
                </Routes>
              </Router>
            </SettingsProvider>
          </ToastProvider>
        </ServerProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
