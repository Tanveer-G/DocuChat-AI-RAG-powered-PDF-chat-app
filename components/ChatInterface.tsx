"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Send, RefreshCw, FileText, Copy, Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { RoleSelector } from "./RoleSelector";
import { Role } from "@/lib/buildSystemPrompt";

// ==================== Types ====================

interface Source {
  page: number;
  similarity: number;   // 0..1
  excerpt: string;
}

interface Meta {
  answer?: string;                 // "INSUFFICIENT_CONTEXT" etc.
  reason?: string;                 // "low_similarity", "no_chunks_found"
  topSimilarity?: number;          // highest similarity among sources
  sources?: Source[];
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  finished?: boolean;              // streaming completed
  meta?: Meta;                     // additional data (sources, warnings)
}

interface ChatInterfaceProps {
  sessionId: string;
  onReset: () => void;
}

// ==================== Helper: Stream Header Parsing ====================

const DELIMITER = "\n---\n";

async function readInitialHeader(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder = new TextDecoder()
): Promise<{ header: Meta | null; buffered: string }> {
  let buffered = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffered += decoder.decode(value, { stream: true });
    const idx = buffered.indexOf(DELIMITER);
    if (idx !== -1) {
      const headerStr = buffered.slice(0, idx);
      const rest = buffered.slice(idx + DELIMITER.length);
      try {
        const header = JSON.parse(headerStr);
        return { header, buffered: rest };
      } catch {
        // Not JSON – treat as no header
        return { header: null, buffered };
      }
    }
  }
  return { header: null, buffered };
}

// ==================== Main Component ====================

export default function ChatInterface({ sessionId, onReset }: Readonly<ChatInterfaceProps>) {
  const [selectedRole, setSelectedRole] = useState<Role>("strict_qa");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto‑scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Copy to clipboard state (per message)
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = async (text: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(messageId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // silent fail
    }
  };

  // Helper to add a new message
  const pushMessage = (m: Message) => setMessages(prev => [...prev, m]);

  // Helper to update an existing assistant message
  const updateAssistant = (id: string, patch: Partial<Message>) => {
    setMessages(prev =>
      prev.map(m => (m.id === id ? { ...m, ...patch } : m))
    );
  };

  // ==================== Submit Handler ====================
  const handleSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    setError(null);
    const userId = Date.now().toString();
    const assistantId = (Date.now() + 1).toString();

    const userMessage: Message = { id: userId, role: "user", content: input };
    pushMessage(userMessage);
    pushMessage({ id: assistantId, role: "assistant", content: "", finished: false });

    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(({ role, content }) => ({ role, content })),
          sessionId,
          role: selectedRole,
        }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || `Request failed (${response.status})`);
      }

      const contentType = response.headers.get("content-type") || "";
      if (!response.body) throw new Error("No response body");

      // Handle JSON‑only response (e.g., insufficient context)
      if (contentType.includes("application/json")) {
        const json = await response.json();
        if (json.answer === "INSUFFICIENT_CONTEXT") {
          updateAssistant(assistantId, {
            content: "I couldn't find sufficient context in the uploaded documents.",
            finished: true,
            meta: json,
          });
          setIsLoading(false);
          return;
        } else if (typeof json.message === "string") {
          updateAssistant(assistantId, { content: json.message, finished: true });
          setIsLoading(false);
          return;
        }
        throw new Error("Unexpected JSON response format");
      }

      // Streamed response with optional header
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const { header, buffered } = await readInitialHeader(reader, decoder);

      if (header) {
        updateAssistant(assistantId, { meta: header });
      }

      let accumulated = buffered || "";
      updateAssistant(assistantId, { content: accumulated });

      // Read remaining stream
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        updateAssistant(assistantId, { content: accumulated });
      }

      updateAssistant(assistantId, { finished: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      setMessages(prev => prev.filter(m => m.id !== assistantId));
    } finally {
      setIsLoading(false);
    }
  };

  // ==================== "Answer Anyway" Handler ====================
  const handleAskAnyway = async (lastUserMessage: Message) => {
    setError(null);
    const assistantId = (Date.now() + 1).toString();
    pushMessage({ id: assistantId, role: "assistant", content: "", finished: false });
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, lastUserMessage].map(({ role, content }) => ({ role, content })),
          sessionId,
          allowUngrounded: true, // backend must respect this
        }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || `Request failed (${response.status})`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No stream returned");

      const decoder = new TextDecoder();
      const { header, buffered } = await readInitialHeader(reader, decoder);
      if (header) updateAssistant(assistantId, { meta: header });

      let accumulated = buffered || "";
      updateAssistant(assistantId, { content: accumulated });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        updateAssistant(assistantId, { content: accumulated });
      }

      updateAssistant(assistantId, { finished: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      setMessages(prev => prev.filter(m => m.id !== assistantId));
    } finally {
      setIsLoading(false);
    }
  };

  // ==================== Render ====================
  return (
    <Card className="w-full h-[80vh] flex flex-col">
      {/* Responsive Header */}
      <CardHeader className="space-y-2 pb-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <CardTitle className="text-center sm:text-left">Chat with your PDF</CardTitle>
          <div className="flex flex-col sm:flex-row items-center gap-2">
            <RoleSelector
              value={selectedRole}
              onChange={setSelectedRole}
              disabled={isLoading}
            />
            <Button variant="outline" size="sm" onClick={onReset} className="w-full sm:w-auto">
              <RefreshCw className="h-4 w-4 mr-2" />
              New PDF
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden">
        <ScrollArea className="h-full pr-4">
          {messages.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              Ask a question about your PDF, e.g.{" "}
              <span className="italic">{`"What is the main topic?"`}</span>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg) => {
                const isUser = msg.role === "user";
                const isAssistant = !isUser;
                const meta = msg.meta;
                const sources = meta?.sources || [];
                const topSimilarity = meta?.topSimilarity;
                const showLowSimilarity =
                  topSimilarity !== undefined && topSimilarity < 0.42;

                return (
                  <div
                    key={msg.id}
                    className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`flex gap-2 sm:gap-3 max-w-[90%] sm:max-w-[85%] ${
                        isUser ? "flex-row-reverse" : "flex-row"
                      }`}
                    >
                      <Avatar className="h-8 w-8 sm:h-10 sm:w-10">
                        <AvatarFallback className="text-xs sm:text-sm">
                          {isUser ? "U" : "AI"}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex flex-col flex-1">
                        {/* Message Bubble */}
                        <div
                          className={`rounded-lg p-3 ${
                            isUser
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted"
                          }`}
                        >
                          <div className="whitespace-pre-wrap wrap-break-word text-sm sm:text-base">
                            {msg.content}
                            {/* Typing indicator for streaming assistant */}
                            {isAssistant && !msg.finished && (
                              <span className="ml-1 animate-pulse">▌</span>
                            )}
                          </div>

                          {/* Copy button (for assistant messages) */}
                          {isAssistant && msg.content && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="cursor-pointer h-6 px-2 mt-1 text-xs"
                              onClick={() => copyToClipboard(msg.content, msg.id)}
                            >
                              {copiedId === msg.id ? (
                                <Check className="h-3 w-3 mr-1" />
                              ) : (
                                <Copy className="h-3 w-3 mr-1" />
                              )}
                              {copiedId === msg.id ? "Copied!" : "Copy"}
                            </Button>
                          )}
                        </div>

                        {/* Sources Panel (only for assistant) */}
                        {isAssistant && msg.finished && (sources.length > 0 || meta?.answer === "INSUFFICIENT_CONTEXT") && (
                          <div
                            className={`mt-3 text-sm border rounded-lg p-3 transition-all ${
                              msg.finished
                                ? "bg-muted/40 shadow-sm border-primary/20"
                                : "bg-muted/30"
                            }`}
                          >
                            {/* Header with top similarity and warning */}
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                <FileText className="h-4 w-4" />
                                <span>Sources</span>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                {topSimilarity !== undefined && (
                                  <span className="text-xs bg-background px-2 py-1 rounded whitespace-nowrap">
                                    Top: {(topSimilarity * 100).toFixed(1)}%
                                  </span>
                                )}
                                {showLowSimilarity && (
                                  <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                                    ⚠️ Low confidence
                                  </span>
                                )}
                                {meta?.answer === "INSUFFICIENT_CONTEXT" && (
                                  <>
                                    <span className="text-xs text-destructive">
                                      {meta.reason || "Insufficient context"}
                                    </span>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs"
                                      onClick={() => {
                                        const lastUser = [...messages]
                                          .reverse()
                                          .find(m => m.role === "user");
                                        if (lastUser) handleAskAnyway(lastUser);
                                      }}
                                    >
                                      Answer anyway
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Source list */}
                            {sources.length === 0 ? (
                              <div className="text-xs text-muted-foreground">
                                No relevant sources found.
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {sources.map((src, idx) => (
                                  <details
                                    key={`src`+idx}
                                    className="text-xs bg-background/50 rounded border p-2 group"
                                  >
                                    <summary className="cursor-pointer text-foreground/80 hover:text-foreground flex items-center justify-between">
                                      <span>
                                        <span className="font-medium">Page {src.page}</span>
                                        <span className="ml-2 text-muted-foreground">
                                          • {(src.similarity * 100).toFixed(1)}%
                                        </span>
                                      </span>
                                      <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
                                    </summary>
                                    <div className="mt-2 text-muted-foreground text-xs italic border-l-2 pl-2 overflow-hidden">
                                      {src.excerpt}
                                    </div>
                                  </details>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Thinking indicator (before any assistant message appears) */}
              {isLoading && messages.length > 0 && messages.at(-1)?.role !== "assistant" && (
                <div className="flex justify-start">
                  <div className="flex gap-3">
                    <Avatar className="h-8 w-8 sm:h-10 sm:w-10">
                      <AvatarFallback>AI</AvatarFallback>
                    </Avatar>
                    <div className="bg-muted rounded-lg p-3 flex items-center gap-1">
                      <span className="animate-pulse text-sm">● ● ●</span>
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="text-destructive text-center p-2 text-sm sm:text-base">
                  Error: {error}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </ScrollArea>
      </CardContent>

      <CardFooter className="border-t pt-4">
        <form onSubmit={handleSubmit} className="flex w-full gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your question..."
            disabled={isLoading}
            className="flex-1 text-sm sm:text-base"
          />
          <Button type="submit" disabled={isLoading || !input.trim()} size="sm" className="sm:size-default">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}