"use client";
import { useEffect, useRef, useState } from "react";
import LeftPanel from "@/components/LeftPanel";
import ChatInterface from "@/components/ChatInterface";
import { X, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";

const SAMPLE_SESSION_ID = process.env.NEXT_PUBLIC_SAMPLE_SESSION_ID! || null;

export default function Home() {
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(SAMPLE_SESSION_ID);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Refs for focus management
  const openTriggerRef = useRef<HTMLButtonElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const sidebarRef = useRef<HTMLElement | null>(null);

  const handleSelectPdf = (sessionId: string) => {
    setCurrentSessionId(sessionId);
    setIsSidebarOpen(false);
  };

  const handleUploadSuccess = (sessionId: string) => {
    setCurrentSessionId(sessionId);
    setIsSidebarOpen(false);
  };

  const handleProcessingStart = () => setIsProcessing(true);

  // Lock body scroll when sidebar open
  useEffect(() => {
    const original = document.body.style.overflow;
    if (isSidebarOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = original || "";
    }
    return () => {
      document.body.style.overflow = original || "";
    };
  }, [isSidebarOpen]);

  // Close on Escape and restore focus
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && isSidebarOpen) {
        setIsSidebarOpen(false);
      }
      // optional: close the sidebar on Ctrl/Cmd+K
      // if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") setIsSidebarOpen(s => !s);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isSidebarOpen]);

  // Manage focus when opening/closing the mobile sidebar
  useEffect(() => {
    if (isSidebarOpen) {
      // focus the close button (if present) so keyboard users are inside the dialog
      setTimeout(() => {
        closeBtnRef.current?.focus();
      }, 0);
    } else {
      // restore focus to the trigger button
      setTimeout(() => {
        openTriggerRef.current?.focus();
      }, 0);
    }
  }, [isSidebarOpen]);

  return (
    <div className="h-dvh flex flex-col bg-background text-foreground">
      {/* ================= HEADER ================= */}
     <Header />
      

      {/* ================= MAIN LAYOUT ================= */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* ===== MOBILE OVERLAY ===== */}
        {/* z-30: overlay under sidebar (sidebar z-40). Only visible on small screens */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30 md:hidden"
            onClick={() => setIsSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* ================= SIDEBAR (PRO) ================= */}
        {/* - slides in from left on mobile
            - limited width on mobile (w-11/12 capped by max-w-sm)
            - static left column on md+ breakpoints
        */}
        <aside
          id="mobile-sidebar"
          ref={sidebarRef}
          role={isSidebarOpen ? "dialog" : undefined}
          aria-modal={isSidebarOpen ? true : undefined}
          aria-label="Document list and upload"
          className={`
            fixed left-0 top-0 bottom-0 z-40
            transform transition-transform duration-300 ease-in-out
            bg-card border-r shadow-lg
            md:static md:translate-x-0 md:shadow-none
            ${/* mobile width: 11/12 of viewport but capped */ ""}
            w-11/12 max-w-xs sm:max-w-sm md:w-80 lg:w-96
            overflow-y-auto
            ${isSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
          `}
        >
          {/* Close header for mobile */}
          <div className="flex items-center justify-between px-4 py-3 border-b md:hidden">
            <div className="font-medium flex gap-3 items-center text-base"><BookOpen className="size-6 mt-0.5" /> Documents</div>
            <Button
              ref={closeBtnRef}
              variant="ghost"
              size="icon"
              onClick={() => setIsSidebarOpen(false)}
              aria-label="Close document panel"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Content padding: keep the same inner padding as desktop */}
          <div className="p-4">
            <LeftPanel
              onSelectPdf={handleSelectPdf}
              currentSessionId={currentSessionId}
              onUploadSuccess={handleUploadSuccess}
              isProcessing={isProcessing}
              onProcessingStart={handleProcessingStart}
            />
          </div>
        </aside>

        {/* ================= CHAT AREA ================= */}
        <main className="flex-1 flex flex-col bg-muted/10" role="main">
          {currentSessionId ? (
            <ChatInterface sessionId={currentSessionId} />
          ) : (
            <div className="flex flex-1 items-center justify-center px-6 text-center">
              <div className="max-w-md space-y-3">
                <h2 className="text-lg sm:text-xl font-medium">Start chatting with your PDF</h2>
                <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                  Select a document from the panel or upload a new PDF to begin.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}