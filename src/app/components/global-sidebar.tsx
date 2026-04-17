import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Link } from "react-router";
import {
  Home,
  Upload,
  BarChart3,
  Building2,
  Settings,
  LogOut,
  Truck,
  User,
  Shield,
  Sparkles,
  Menu,
  X,
  Utensils,
  Clock,
} from "lucide-react";
import { Button } from "./ui/button";
import { signOut } from "firebase/auth";
import { auth } from "../../firebase/config";

const donorNav = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "donate", label: "New Donation", icon: Upload },
  { id: "history", label: "My Donations", icon: Clock },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "ngos", label: "Find NGOs", icon: Building2 },
  { id: "settings", label: "Settings", icon: Settings },
];

const receiverNav = [
  { id: "available", label: "Available", icon: Home },
  { id: "history", label: "My Claims", icon: Clock },
  { id: "map", label: "Map View", icon: Building2 },
  { id: "proof", label: "Proof Manager", icon: Upload },
  { id: "settings", label: "Settings", icon: Settings },
];

const volunteerNav = [
  { id: "tasks", label: "Tasks", icon: Home },
  { id: "history", label: "Completed", icon: Clock },
  { id: "stats", label: "Statistics", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings },
];

const adminNav = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "reports", label: "Reports", icon: Shield },
  { id: "users", label: "Users", icon: User },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings },
];

export function GlobalSidebar({
  role,
  activeTab,
  onTabChange,
}: {
  role: "donor" | "receiver" | "volunteer" | "admin";
  activeTab: string;
  onTabChange: (tab: string) => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const navItems =
    role === "donor"
      ? donorNav
      : role === "receiver"
        ? receiverNav
        : role === "volunteer"
          ? volunteerNav
          : adminNav;

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      navigate("/login");
    } catch {
      console.error("Sign out failed");
    }
  };

  const roleColors = {
    donor: "from-[#10b981] to-[#047857]",
    receiver: "from-[#3b82f6] to-[#1d4ed8]",
    volunteer: "from-[#8b5cf6] to-[#6d28d9]",
    admin: "from-[#f97316] to-[#c2410c]",
  };

  const roleIcons = {
    donor: Upload,
    receiver: Building2,
    volunteer: Truck,
    admin: Shield,
  };

  const RoleIcon = roleIcons[role];

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 left-6 z-50 lg:hidden p-3 bg-gradient-to-br from-[#10b981] to-[#3b82f6] text-white rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-110"
      >
        {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {/* Mobile Overlay - shown before sidebar */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Floating Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-screen w-72 bg-white shadow-2xl transform transition-transform duration-300 ease-in-out z-50 lg:translate-x-0 pointer-events-auto ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="p-6 h-full flex flex-col">
          {/* Logo */}
          <Link to="/">
            <div className="flex items-center gap-2 mb-8">
              <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${roleColors[role]} flex items-center justify-center`}>
                <Utensils className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-semibold">RescueBite AI</span>
            </div>
          </Link>

          {/* Navigation */}
          <nav className="flex-1 space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onTabChange(item.id);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${
                    activeTab === item.id
                      ? `bg-gradient-to-r ${roleColors[role]} text-white`
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Bottom Actions */}
          <div className="space-y-3 border-t pt-4">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-gray-600 hover:bg-gray-100 transition-all"
            >
              <LogOut className="w-5 h-5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
