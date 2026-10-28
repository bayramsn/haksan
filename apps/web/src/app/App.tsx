import { lazy, Suspense, useState } from "react";
import { AuthProvider, useAuth } from "../lib/auth";
import { LoginPage } from "./components/pages/Login";
import { markOnboardingSeen, OnboardingPage, shouldShowOnboarding } from "./components/pages/Onboarding";
import { PageLoadingSkeleton } from "./components/shared/PageLoadingSkeleton";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Toaster } from "./components/ui/sonner";

const WorkspaceApp = lazy(() => import("./WorkspaceApp"));
const PublicServiceComplaintPage = lazy(() => import("./components/pages/PublicServiceComplaint").then(module => ({ default: module.PublicServiceComplaintPage })));

/** CRM/store/form code is requested only after session authentication. */
export function SessionGate() {
  const { authed, loading, login } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState(shouldShowOnboarding);
  if (loading) return <PageLoadingSkeleton />;
  if (!authed) {
    if (showOnboarding) return <OnboardingPage onFinish={() => { markOnboardingSeen(); setShowOnboarding(false); }} />;
    return <LoginPage onLogin={async (identifier, password) => { await login(identifier, password); }} onReplayIntro={() => setShowOnboarding(true)} />;
  }
  return <Suspense fallback={<PageLoadingSkeleton />}><WorkspaceApp /></Suspense>;
}

export default function App() {
  const publicMatch = typeof window !== "undefined" ? window.location.pathname.match(/^\/public\/service-complaints\/([^/]+)\/([^/?#]+)/) : null;
  if (publicMatch) return <><ErrorBoundary><Suspense fallback={<PageLoadingSkeleton />}><PublicServiceComplaintPage slug={decodeURIComponent(publicMatch[1])} token={decodeURIComponent(publicMatch[2])} /></Suspense></ErrorBoundary><Toaster richColors position="top-right" /></>;
  return <AuthProvider><ErrorBoundary><SessionGate /></ErrorBoundary><Toaster richColors position="top-right" /></AuthProvider>;
}
