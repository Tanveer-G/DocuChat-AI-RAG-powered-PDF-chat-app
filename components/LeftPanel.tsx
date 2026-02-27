"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Loader2,
  Upload,
  FileText,
  AlertCircle,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import trackEvent from "@/lib/analytics/analyzr"; // default import

interface LeftPanelProps {
  onSelectPdf: (sessionId: string) => void;
  currentSessionId: string | null;
  onUploadSuccess: (sessionId: string, fileName: string) => void;
  isProcessing: boolean;
  onProcessingStart: () => void;
}

interface StoredPdf {
  sessionId: string;
  fileName: string;
  timestamp: number;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_FILE_TYPES = { "application/pdf": [".pdf"] };
const SAMPLE_SESSION_ID = process.env.NEXT_PUBLIC_SAMPLE_SESSION_ID!;
const RECENT_KEY = "recentPdfs";
const MAX_RECENTS = 5;

export default function LeftPanel({
  onSelectPdf,
  currentSessionId,
  onUploadSuccess,
  isProcessing,
  onProcessingStart,
}: Readonly<LeftPanelProps>) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [recentPdfs, setRecentPdfs] = useState<StoredPdf[]>([]);
  const statusRef = useRef<HTMLDivElement | null>(null);

  // Load recent PDFs safely
  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as StoredPdf[] | null;
      if (Array.isArray(parsed)) {
        setRecentPdfs(parsed.slice(0, MAX_RECENTS));
      }
    } catch (err) {
      console.warn("Could not read recent PDFs from localStorage", err);
    }
  }, []);

  // Save recents safely
  useEffect(() => {
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(recentPdfs.slice(0, MAX_RECENTS)));
    } catch (err) {
      console.warn("Could not save recent PDFs to localStorage", err);
    }
  }, [recentPdfs]);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      setUploadError(null);
      setSelectedFile(file);

      // Simple client-side validation
      if (file.type !== "application/pdf") {
        const msg = "Invalid file type. Please upload a PDF.";
        setUploadError(msg);
        toast.error("Invalid file type", { description: msg });
        setSelectedFile(null);
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        const msg = "File too large. Maximum size is 10MB.";
        setUploadError(msg);
        toast.error("File too large", { description: msg });
        setSelectedFile(null);
        return;
      }

      // Track upload start
      trackEvent({
        name: "upload_started",
        properties: {
          fileName: file.name,
          fileSize: file.size,
        },
      });

      onProcessingStart();

      const formData = new FormData();
      formData.append("file", file);

      try {
        const response = await fetch("/api/process-pdf", {
          method: "POST",
          body: formData,
        });

        // handle network failures gracefully
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          const errMsg = (body && (body.error || body.message)) || `Upload failed (${response.status})`;
          throw new Error(errMsg);
        }

        const data = await response.json();

        if (!data?.sessionId) {
          throw new Error("Invalid response from server");
        }

        toast.success("Success!", {
          description: "PDF processed. You can now chat.",
        });

        // Track upload success
        trackEvent({
          name: "upload_success",
          properties: {
            fileName: file.name,
            fileSize: file.size,
            sessionId: data.sessionId,
          },
        });

        const newPdf: StoredPdf = {
          sessionId: data.sessionId,
          fileName: file.name,
          timestamp: Date.now(),
        };

        setRecentPdfs((prev) => {
          const filtered = prev.filter((p) => p.sessionId !== data.sessionId);
          const combined = [newPdf, ...filtered];
          return combined.slice(0, MAX_RECENTS);
        });

        onUploadSuccess(data.sessionId, file.name);
        setSelectedFile(null);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Something went wrong";
        setUploadError(message);
        toast.error("Processing failed", { description: message });
        setSelectedFile(null);

        // Track upload failure
        trackEvent({
          name: "upload_failed",
          properties: {
            fileName: file.name,
            fileSize: file.size,
            error: message,
          },
        });

        // move focus to status for screen reader users
        setTimeout(() => statusRef.current?.focus(), 50);
      }
    },
    [onProcessingStart, onUploadSuccess]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_FILE_TYPES,
    maxFiles: 1,
    disabled: isProcessing,
  });

  const clearSelectedFile = () => {
    setSelectedFile(null);
    setUploadError(null);
  };

  const formatRelativeTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
    return "just now";
  };

  // wrapper key handler: open file dialog on Enter/Space
  const handleDropzoneKeyDown: React.KeyboardEventHandler = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      const el = (e.currentTarget.querySelector('input[type="file"]') as HTMLInputElement | null);
      el?.click();
      e.preventDefault();
    }
  };

  // Handle sample PDF selection with tracking
  const handleSampleClick = () => {
    trackEvent({
      name: "sample_pdf_selected",
      properties: { sessionId: SAMPLE_SESSION_ID },
    });
    onSelectPdf(SAMPLE_SESSION_ID);
  };

  return (
    <aside
      // mobile-first: full width and top by being order-first; on sm+ screens we let parent control ordering
      className={cn(
        "w-full h-full flex flex-col overflow-y-auto p-4 space-y-4 bg-white text-gray-900 border-b sm:border-b-0 sm:border-r border-gray-200",
        // keep it visually elevated on larger screens
        "sm:shadow-sm sm:rounded-none md:rounded-lg md:mx-0",
        // ensure it appears first in document order on mobile (top)
        "order-first sm:order-none"
      )}
      aria-label="Documents and upload"
    >
      {/* Status live region (for screen readers) */}
      <div
        tabIndex={-1}
        aria-live="polite"
        ref={statusRef}
        className="sr-only"
        id="left-panel-status"
      />

      {/* Documents nav */}
      <nav aria-label="Available documents">
        {/* Sample PDF */}
        <div className="mb-2">
          <button
            type="button"
            onClick={handleSampleClick}
            className={cn(
              "w-full flex items-center gap-3 rounded-md px-3 py-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-600",
              currentSessionId === SAMPLE_SESSION_ID
                ? "bg-indigo-50 border border-indigo-200 text-indigo-900"
                : "hover:bg-gray-50"
            )}
            aria-current={currentSessionId === SAMPLE_SESSION_ID ? "true" : undefined}
            aria-label="Open sample document"
          >
            <FileText className="h-5 w-5 shrink-0 text-gray-700" aria-hidden />
            <div className="flex-1 min-w-0">
              <div className="truncate font-medium text-sm">Project Atlas</div>
              <div className="text-xs text-gray-500">Pre-loaded example</div>
            </div>
          </button>
        </div>

        {/* Recent uploads */}
        {recentPdfs.length > 0 && (
          <div className="mb-2" aria-labelledby="recent-heading">
            <div id="recent-heading" className="text-xs text-gray-500 px-1 pt-1 mb-1">
              Recent uploads
            </div>
            <ul className="space-y-1" role="list">
              {recentPdfs.map((pdf) => (
                <li key={pdf.sessionId}>
                  <button
                    type="button"
                    onClick={() => onSelectPdf(pdf.sessionId)}
                    className={cn(
                      "w-full flex items-start gap-3 rounded-md px-3 py-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-600",
                      currentSessionId === pdf.sessionId ? "bg-indigo-50 border border-indigo-200" : "hover:bg-gray-50"
                    )}
                    aria-current={currentSessionId === pdf.sessionId ? "true" : undefined}
                    aria-label={`Open ${pdf.fileName}`}
                  >
                    <FileText className="h-5 w-5 shrink-0 text-gray-700" aria-hidden />
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium text-sm">{pdf.fileName}</div>
                      <div className="text-xs text-gray-500">{formatRelativeTime(pdf.timestamp)}</div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </nav>

      {/* Upload area */}
      <Card className="shadow-none sm:shadow">
        <CardHeader>
          <CardTitle className="text-sm">Upload PDF</CardTitle>
          <CardDescription className="text-xs text-gray-500">
            Upload a text-based PDF (Max {Math.round(MAX_FILE_SIZE / (1024 * 1024))}MB)
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div
            {...getRootProps()}
            // wrapper keyboard support
            onKeyDown={handleDropzoneKeyDown}
            role="button"
            tabIndex={0}
            aria-disabled={isProcessing}
            aria-describedby="dropzone-desc"
            className={cn(
              "relative border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-600",
              // colors tuned for contrast
              "border-gray-300 bg-white hover:bg-gray-50",
              isDragActive && "border-indigo-600 bg-indigo-50",
              isProcessing && "opacity-60 pointer-events-none",
              uploadError && "border-red-600 bg-red-50"
            )}
          >
            <input {...getInputProps()} aria-label="Select PDF to upload" />
            {!isProcessing && !selectedFile && (
              <div className="flex flex-col items-center gap-1">
                <Upload className="h-6 w-6 text-gray-600" aria-hidden />
                <p className="text-sm text-gray-700">
                  {isDragActive ? "Drop PDF here" : "Drag & drop a PDF or click to select"}
                </p>
                <p id="dropzone-desc" className="sr-only">
                  Accepts PDF files only. Max file size {Math.round(MAX_FILE_SIZE / (1024 * 1024))} MB.
                </p>
              </div>
            )}

            {isProcessing && selectedFile && (
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                <span className="text-xs text-gray-700 truncate">{selectedFile.name}</span>
              </div>
            )}

            {!isProcessing && selectedFile && (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 shrink-0 text-gray-700" aria-hidden />
                  <span className="text-xs truncate">{selectedFile.name}</span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearSelectedFile();
                  }}
                  className="inline-flex items-center justify-center p-1 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-600"
                  aria-label="Remove selected file"
                >
                  <X className="h-4 w-4 text-gray-600" aria-hidden />
                </button>
              </div>
            )}
          </div>

          <div className="mt-2 text-xs text-gray-600" aria-hidden>
            Max {Math.round(MAX_FILE_SIZE / (1024 * 1024))}MB — text-based only
          </div>

          {/* Visible error for sighted users */}
          {uploadError && (
            <div
              className="mt-2 flex items-start gap-2 text-sm text-red-700"
              role="alert"
              aria-live="assertive"
            >
              <AlertCircle className="h-4 w-4 mt-0.5 text-red-700" aria-hidden />
              <div>{uploadError}</div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Guidelines */}
      <section aria-labelledby="how-it-works" className="text-sm text-gray-700 border-t pt-4 mt-2">
        <h3 id="how-it-works" className="font-medium text-sm mb-1">
          How it works
        </h3>
        <ul className="list-disc list-inside space-y-1 pl-1">
          <li>Upload a PDF or use the sample</li>
          <li>Ask questions in natural language</li>
          <li>Answers include page references</li>
          <li>Low-similarity answers are flagged</li>
        </ul>
      </section>
    </aside>
  );
}