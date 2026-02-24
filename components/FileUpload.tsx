"use client";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, Upload, FileText, AlertCircle, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  readonly onProcessingStart: () => void;
  readonly onSuccess: (sessionId: string) => void;
  readonly isProcessing: boolean;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_FILE_TYPES = { "application/pdf": [".pdf"] };

export default function FileUpload({
  onProcessingStart,
  onSuccess,
  isProcessing,
}: FileUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      // Reset states
      setUploadError(null);
      setSelectedFile(file);

      // Client-side validation
      if (file.type !== "application/pdf") {
        setUploadError("Invalid file type. Please upload a PDF.");
        toast.error("Invalid file type", {
          description: "Please upload a PDF.",
        });
        setSelectedFile(null);
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setUploadError("File too large. Maximum size is 10MB.");
        toast.error("File too large", { description: "Maximum size is 10MB." });
        setSelectedFile(null);
        return;
      }

      onProcessingStart();

      const formData = new FormData();
      formData.append("file", file);

      try {
        const response = await fetch("/api/process-pdf", {
          method: "POST",
          body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Upload failed");
        }

        if (!data.sessionId) {
          throw new Error("Invalid response from server");
        }

        toast.success("Success!", {
          description: "PDF processed. You can now chat.",
        });
        onSuccess(data.sessionId);
        // Clear selected file after successful upload
        setSelectedFile(null);
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Something went wrong";
        setUploadError(message);
        toast.error("Processing failed", { description: message });
        setSelectedFile(null);
      }
    },
    [onProcessingStart, onSuccess],
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

  return (
    <Card className="w-full shadow-lg border-2">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-2xl">
          <FileText className="h-6 w-6" />
          Upload a PDF
        </CardTitle>
        <CardDescription>
          Drag and drop your PDF, or click to browse. Max file size:{" "}
          <strong>10MB</strong>, max pages: <strong>~10</strong> (text‑based
          only).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          {...getRootProps()}
          className={cn(
            "relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all",
            "hover:border-primary hover:bg-primary/5 hover:scale-[1.02]",
            isDragActive && "border-primary bg-primary/10 scale-[1.02]",
            isProcessing && "opacity-50 pointer-events-none",
            uploadError && "border-destructive bg-destructive/5",
          )}
        >
          <input {...getInputProps()} />

          {!isProcessing && !selectedFile && (
            <div className="flex flex-col items-center gap-3">
              <Upload className="h-12 w-12 text-muted-foreground" />
              <p className="text-lg font-medium">
                {isDragActive
                  ? "Drop your PDF here"
                  : "Drag & drop or click to browse"}
              </p>
              <p className="text-sm text-muted-foreground">
                Supports PDF files up to 10MB
              </p>
            </div>
          )}

          {isProcessing && selectedFile && (
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <div className="space-y-1">
                <p className="text-sm font-medium">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(selectedFile.size / 1024).toFixed(1)} KB • Processing...
                </p>
              </div>
            </div>
          )}

          {!isProcessing && selectedFile && (
            <div className="flex flex-col items-center gap-3">
              <FileText className="h-10 w-10 text-primary" />
              <div className="space-y-1">
                <p className="text-sm font-medium">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(selectedFile.size / 1024).toFixed(1)} KB • Ready to upload
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  clearSelectedFile();
                }}
              >
                <X className="h-4 w-4 mr-1" />
                Remove
              </Button>
            </div>
          )}
        </div>

        {uploadError && (
          <div className="mt-4 flex items-start gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-lg border border-destructive/20">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <span>{uploadError}</span>
          </div>
        )}

        <div className="mt-4 text-xs text-muted-foreground flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          <span>
            Only text‑based PDFs are supported. Scanned documents may not work.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
