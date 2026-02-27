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
import { Send, FileText, Copy, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { RoleSelector } from "./RoleSelector";
import { Role } from "@/lib/buildSystemPrompt";
import trackEvent from "@/lib/analytics/analyzr"; // <-- added import

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

export default function ChatInterface({ sessionId }: Readonly<ChatInterfaceProps>) {
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

      // Track copy action
      trackEvent({
        name: "copy_answer",
        properties: { messageId, sessionId, length: text.length },
      });
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

  // Track role changes
  const handleRoleChange = (newRole: Role) => {
    setSelectedRole(newRole);
    trackEvent({
      name: "role_changed",
      properties: { sessionId, role: newRole },
    });
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

    // Track message sent
    trackEvent({
      name: "chat_message_sent",
      properties: {
        sessionId,
        role: selectedRole,
        messageLength: input.length,
      },
    });

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

      // Track error
      trackEvent({
        name: "chat_error",
        properties: { sessionId, error: message },
      });
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

    // Track answer anyway click
    trackEvent({
      name: "answer_anyway_clicked",
      properties: { sessionId, role: selectedRole },
    });

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

      trackEvent({
        name: "answer_anyway_error",
        properties: { sessionId, error: message },
      });
    } finally {
      setIsLoading(false);
    }
  };

  // ==================== Render ====================
  return (
    <Card className="w-full h-full flex flex-col border-0 sm:border rounded-none sm:rounded-xl">
      
      {/* ================= HEADER ================= */}
      <CardHeader className="pb-3 px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-base sm:text-lg font-semibold tracking-tight">
            Chat with your PDF
          </CardTitle>

          <RoleSelector
            value={selectedRole}
            onChange={handleRoleChange} // <-- updated to use handler with tracking
            disabled={isLoading}
          />
        </div>
      </CardHeader>

      {/* ================= MESSAGES ================= */}
      <CardContent className="flex-1 overflow-hidden px-3 sm:px-6">
        <ScrollArea className="h-full pr-2 sm:pr-4">
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center px-4">
              <div className="max-w-sm space-y-2">
                <p className="text-sm sm:text-base text-muted-foreground">
                  Ask a question about your PDF
                </p>
                <p className="text-xs sm:text-sm text-muted-foreground italic">
                  “What is the main topic?”
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-5 py-2">
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
                      className={`flex gap-2 sm:gap-3 max-w-[95%] sm:max-w-[85%] ${
                        isUser ? "flex-row-reverse" : "flex-row"
                      }`}
                    >
                      <Avatar className="h-8 w-8 sm:h-9 sm:w-9 shrink-0">
                        <AvatarFallback className="text-xs font-medium">
                          {isUser ? "U" : "AI"}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex flex-col flex-1 min-w-0">
                        
                        {/* ===== MESSAGE BUBBLE ===== */}
                        <div
                          className={`rounded-xl px-4 py-3 shadow-sm ${
                            isUser
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted"
                          }`}
                        >
                          <div
                            className="whitespace-pre-wrap break-words text-sm sm:text-base leading-relaxed"
                            aria-live={isAssistant && !msg.finished ? "polite" : undefined}
                          >
                            {msg.content}
                            {isAssistant && !msg.finished && (
                              <span className="ml-1 animate-pulse">▌</span>
                            )}
                          </div>

                          {isAssistant && msg.content && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 mt-2 text-xs focus-visible:ring-2 focus-visible:ring-primary"
                              onClick={() => copyToClipboard(msg.content, msg.id)}
                            >
                              {copiedId === msg.id ? (
                                <Check className="h-3 w-3 mr-1" />
                              ) : (
                                <Copy className="h-3 w-3 mr-1" />
                              )}
                              {copiedId === msg.id ? "Copied" : "Copy"}
                            </Button>
                          )}
                        </div>

                        {/* ===== SOURCES PANEL ===== */}
                        {isAssistant &&
                          msg.finished &&
                          (sources.length > 0 ||
                            meta?.answer === "INSUFFICIENT_CONTEXT") && (
                            <div className="mt-3 text-xs sm:text-sm border rounded-lg p-3 bg-muted/30">
                              
                              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2 font-medium text-muted-foreground">
                                  <FileText className="h-4 w-4" />
                                  Sources
                                </div>

                                <div className="flex flex-wrap gap-2">
                                  {topSimilarity !== undefined && (
                                    <span className="bg-background px-2 py-1 rounded text-xs">
                                      Top {(topSimilarity * 100).toFixed(1)}%
                                    </span>
                                  )}

                                  {showLowSimilarity && (
                                    <span className="text-amber-700 bg-amber-100 px-2 py-1 rounded text-xs">
                                      Low confidence
                                    </span>
                                  )}
                                </div>
                              </div>

                              {sources.length === 0 ? (
                                <p className="text-muted-foreground text-xs">
                                  No relevant sources found.
                                </p>
                              ) : (
                                <div className="space-y-2">
                                  {sources.map((src, idx) => (
                                    <details
                                      key={idx}
                                      className="bg-background/50 rounded border p-2"
                                    >
                                      <summary className="cursor-pointer text-xs sm:text-sm font-medium">
                                        Page {src.page} •{" "}
                                        {(src.similarity * 100).toFixed(1)}%
                                      </summary>
                                      <p className="mt-2 text-xs italic text-muted-foreground break-words">
                                        {src.excerpt}
                                      </p>
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

              {error && (
                <div className="text-destructive text-center text-sm">
                  {error}
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </ScrollArea>
      </CardContent>

      {/* ================= INPUT ================= */}
      <CardFooter className="border-t px-3 sm:px-6 py-3">
        <form
          onSubmit={handleSubmit}
          className="flex w-full items-center gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your question here..."
            disabled={isLoading}
            className="flex-1 text-base"
          />

          <Button
            type="submit"
            disabled={isLoading || !input.trim()}
            size="icon"
            className="shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}