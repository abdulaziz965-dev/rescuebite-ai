import { useEffect, useMemo, useState } from "react";
import { RouterProvider } from "react-router";
import { router } from "./routes";

function MobilePreviewShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#eef2f7] overflow-hidden p-0 sm:p-4 sm:flex sm:items-center sm:justify-center">
      <div className="w-full min-h-screen sm:min-h-[calc(100vh-2rem)] sm:max-w-[430px] sm:mx-auto sm:rounded-[2rem] sm:border sm:border-slate-200 bg-white sm:shadow-[0_24px_70px_rgba(15,23,42,0.14)] overflow-hidden relative">
        <div className="hidden sm:block absolute top-3 left-1/2 -translate-x-1/2 w-24 h-5 rounded-full bg-slate-900/90 z-20"></div>
        <div className="h-full overflow-auto overscroll-contain pt-0 sm:pt-12">{children}</div>
      </div>
    </div>
  );
}

export default function App() {
  const [mobilePreviewEnabled, setMobilePreviewEnabled] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const previewParam = params.get("mobilePreview");
    const storedPreview = localStorage.getItem("mobile-preview-mode");
    const nextPreviewEnabled = previewParam === "1" || storedPreview === "1" || storedPreview === "true";
    setMobilePreviewEnabled(nextPreviewEnabled);
  }, []);

  const content = useMemo(() => <RouterProvider router={router} />, []);

  if (mobilePreviewEnabled) {
    return <MobilePreviewShell>{content}</MobilePreviewShell>;
  }

  return content;
}
