import { useEffect, useState, type ReactNode } from "react";
import { createBrowserRouter, Navigate, useLocation } from "react-router";
import { onAuthStateChanged } from "firebase/auth";
import { LandingPage } from "./pages/landing-page";
import { DonorDashboard } from "./pages/donor-dashboard";
import { ReceiverDashboard } from "./pages/receiver-dashboard";
import { AdminDashboard } from "./pages/admin-dashboard";
import { AIMatchingPage } from "./pages/ai-matching-page";
import { VolunteerDashboard } from "./pages/volunteer-dashboard";
import { LoginPage } from "./pages/login-page";
import { auth } from "../firebase/config";

function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [authReady, setAuthReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAuthenticated(Boolean(user));
      setAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  if (!authReady) {
    return <div className="min-h-screen flex items-center justify-center text-gray-600">Checking session...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}

function ProtectedDonorPage() {
  return (
    <RequireAuth>
      <DonorDashboard />
    </RequireAuth>
  );
}

function ProtectedReceiverPage() {
  return (
    <RequireAuth>
      <ReceiverDashboard />
    </RequireAuth>
  );
}

function ProtectedAdminPage() {
  return (
    <RequireAuth>
      <AdminDashboard />
    </RequireAuth>
  );
}

function ProtectedAIMatchingPage() {
  return (
    <RequireAuth>
      <AIMatchingPage />
    </RequireAuth>
  );
}

function ProtectedVolunteerPage() {
  return (
    <RequireAuth>
      <VolunteerDashboard />
    </RequireAuth>
  );
}

export const router = createBrowserRouter([
  {
    path: "/",
    Component: LandingPage,
  },
  {
    path: "/home",
    Component: LandingPage,
  },
  {
    path: "/donor",
    Component: ProtectedDonorPage,
  },
  {
    path: "/receiver",
    Component: ProtectedReceiverPage,
  },
  {
    path: "/admin",
    Component: ProtectedAdminPage,
  },
  {
    path: "/ai-matching",
    Component: ProtectedAIMatchingPage,
  },
  {
    path: "/volunteer",
    Component: ProtectedVolunteerPage,
  },
  {
    path: "/login",
    Component: LoginPage,
  },
]);
