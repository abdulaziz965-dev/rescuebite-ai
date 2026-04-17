import { createBrowserRouter } from "react-router";
import { LandingPage } from "./pages/landing-page";
import { DonorDashboard } from "./pages/donor-dashboard";
import { ReceiverDashboard } from "./pages/receiver-dashboard";
import { AdminDashboard } from "./pages/admin-dashboard";
import { AIMatchingPage } from "./pages/ai-matching-page";
import { VolunteerDashboard } from "./pages/volunteer-dashboard";
import { LoginPage } from "./pages/login-page";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: LandingPage,
  },
  {
    path: "/donor",
    Component: DonorDashboard,
  },
  {
    path: "/receiver",
    Component: ReceiverDashboard,
  },
  {
    path: "/admin",
    Component: AdminDashboard,
  },
  {
    path: "/ai-matching",
    Component: AIMatchingPage,
  },
  {
    path: "/volunteer",
    Component: VolunteerDashboard,
  },
  {
    path: "/login",
    Component: LoginPage,
  },
]);
