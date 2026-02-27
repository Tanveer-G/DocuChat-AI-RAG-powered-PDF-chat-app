import type { Metadata } from "next";
import "./globals.css";
import { Analytics } from "@vercel/analytics/react";
import { Toaster } from "@/components/ui/sonner";
import Script from "next/script";

export const metadata: Metadata = {
  metadataBase: new URL("https://tanveer-docuchat-ai.vercel.app"),
  title: "DocuChat AI | RAG-Powered PDF Chat Application | Tanveer H.",
  description:
    "DocuChat AI is a Retrieval-Augmented Generation (RAG) powered PDF chat application that enables semantic document search, streaming AI responses, and page-level source citations using Next.js, Supabase pgvector, and OpenRouter.",

  // You may trim keywords if desired, but they're fine as is.
  keywords: [
    "Tanveer",
    "Tanveer AI Developer",
    "DocuChat AI",
    "DocuChat AI by Tanveer",
    "RAG PDF Chat Application",
    "AI Document Chat",
    "Retrieval Augmented Generation",
    "Semantic PDF Search",
  ],

  authors: [{ name: "Tanveer H." }],
  creator: "Tanveer H.",

  openGraph: {
    title: "DocuChat AI | RAG-Powered PDF Chat Application",
    description:
      "Upload PDFs and chat with your documents using AI. Built with Next.js, Supabase pgvector, and OpenRouter. Supports streaming responses and page-level citations.",
    url: "https://tanveer-docuchat-ai.vercel.app",
    siteName: "DocuChat AI",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "DocuChat AI - RAG Powered PDF Chat Application",
      },
    ],
    type: "website",
  },

  twitter: {
    card: "summary_large_image",
    title: "DocuChat AI",
    description:
      "RAG-powered PDF chat application with semantic search and streaming AI responses.",
    images: [
      "https://tanveer-docuchat-ai.vercel.app/opengraph-image.png",
    ],
  },

  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <Script
  defer
  data-domain="https://tanveer-docuchat-ai.vercel.app/"
  src="https://getanalyzr.vercel.app/tracking-script.js"
/>
      <body
        className={`antialiased`}
      >
        {children}
        <Toaster />
        <Analytics />
      </body>
    </html>
  );
}
