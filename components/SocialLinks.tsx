// components/SocialLinks.tsx
import React from "react";
import { Github, Globe, Mail } from "lucide-react"; // lucide icons
import { Button } from "@/components/ui/button";

export type SocialLinksProps = {
  githubUrl?: string;
  portfolioUrl?: string;
  contactUrl?: string; // mailto: or contact page
  compact?: boolean; // show icons only (useful in header mobile)
};

export default function SocialLinks({
  githubUrl,
  portfolioUrl,
  contactUrl,
  compact = false,
}: Readonly<SocialLinksProps>) {
  const linkClass =
    "inline-flex items-center gap-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-600";

  return (
    <div className={`flex items-center gap-2 ${compact ? "space-x-1" : ""}`}>
      {githubUrl && (
        <a
          href={githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open GitHub repository (opens in a new tab)"
          className={linkClass}
          title="GitHub"
        >
          <Button variant="ghost" size={compact ? "icon" : "sm"} className="px-2">
            <Github className="h-4 w-4" aria-hidden />
            {!compact && <span>GitHub</span>}
          </Button>
        </a>
      )}

      {portfolioUrl && (
        <a
          href={portfolioUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open portfolio (opens in a new tab)"
          className={linkClass}
          title="Portfolio"
        >
          <Button variant="ghost" size={compact ? "icon" : "sm"} className="px-2">
            <Globe className="h-4 w-4" aria-hidden />
            {!compact && <span>Portfolio</span>}
          </Button>
        </a>
      )}

      {contactUrl && (
        <a
          href={contactUrl}
          target={contactUrl.startsWith("mailto:") ? "_self" : "_blank"}
          rel={contactUrl.startsWith("mailto:") ? undefined : "noopener noreferrer"}
          aria-label="Contact (opens in a new tab)"
          className={linkClass}
          title="Contact"
        >
          <Button variant="outline" size={compact ? "icon" : "sm"} className="px-2">
            <Mail className="h-4 w-4" aria-hidden />
            {!compact && <span>Contact</span>}
          </Button>
        </a>
      )}
    </div>
  );
}