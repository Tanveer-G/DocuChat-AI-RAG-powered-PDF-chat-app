"use client";
import { useState } from "react";
import FileUpload from "@/components/FileUpload";
import ChatInterface from "@/components/ChatInterface";

export default function Home() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleUploadSuccess = (newSessionId: string) => {
    setSessionId(newSessionId);
    setIsProcessing(false);
  };

  const handleProcessingStart = () => setIsProcessing(true);

  const handleReset = () => {
    setSessionId(null);
    setIsProcessing(false);
  };

  return (
    <main className="container mx-auto max-w-4xl py-8 px-4">
      <h1 className="text-3xl font-bold mb-6 text-center">DocuChat AI RAG-powered PDF chat app</h1>
      {!sessionId ? (
        <FileUpload
          onProcessingStart={handleProcessingStart}
          onSuccess={handleUploadSuccess}
          isProcessing={isProcessing}
          />
      ) : (
        <ChatInterface sessionId={sessionId} onReset={handleReset} />
      )}
    </main>
  );
}