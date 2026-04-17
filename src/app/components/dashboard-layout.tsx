import { ReactNode } from "react";

interface DashboardLayoutProps {
  children: ReactNode;
  className?: string;
}

export function DashboardLayout({ children, className = "" }: DashboardLayoutProps) {
  return (
    <div className={`min-h-screen pl-0 lg:pl-72 transition-all duration-300 ${className}`}>
      {/* Add animation styles */}
      <style>{`
        @keyframes slideInContent {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        
        .dashboard-content {
          animation: slideInContent 0.4s ease-out;
        }
      `}</style>
      <div className="dashboard-content">{children}</div>
    </div>
  );
}
