import React from "react";
import { Github, Globe, Mail, Linkedin } from "lucide-react";
import { Button } from "@/components/ui/button";
import trackEvent from "@/lib/analytics/analyzr";

export type SocialLinksProps = {
  githubUrl: string;
  linkedinUrl: string;
  portfolioUrl: string;
  contactUrl: string;
  compact?: boolean;
};

export default function SocialLinks({
  githubUrl,
  linkedinUrl,
  portfolioUrl,
  contactUrl,
  compact = false,
}: SocialLinksProps) {
  const linkClass =
    "inline-flex items-center gap-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-600";

  const handleClick = (platform: string, url: string) => {
    trackEvent({ name: "social_link_click", properties: { platform, url } });
  };

  return (
    <div className={`flex items-center gap-2 ${compact ? "space-x-1" : ""}`}>
      <a
        href={githubUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="GitHub repository (opens in a new tab)"
        className={linkClass}
        title="GitHub"
        onClick={() => handleClick("github", githubUrl)}
      >
        <Button variant="ghost" size={compact ? "icon" : "sm"} className="px-2">
          <Github className="h-4 w-4" aria-hidden />
          {!compact && <span>GitHub</span>}
        </Button>
      </a>

      <a
        href={linkedinUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="LinkedIn profile (opens in a new tab)"
        className={linkClass}
        title="LinkedIn"
        onClick={() => handleClick("linkedin", linkedinUrl)}
      >
        <Button variant="ghost" size={compact ? "icon" : "sm"} className="px-2">
          <Linkedin className="h-4 w-4" aria-hidden />
          {!compact && <span>LinkedIn</span>}
        </Button>
      </a>

      <a
        href={portfolioUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Portfolio (opens in a new tab)"
        className={linkClass}
        title="Portfolio"
        onClick={() => handleClick("portfolio", portfolioUrl)}
      >
        <Button variant="ghost" size={compact ? "icon" : "sm"} className="px-2">
          <Globe className="h-4 w-4" aria-hidden />
          {!compact && <span>Portfolio</span>}
        </Button>
      </a>

      <a
        href={contactUrl}
        target={contactUrl.startsWith("mailto:") ? "_self" : "_blank"}
        rel={contactUrl.startsWith("mailto:") ? undefined : "noopener noreferrer"}
        aria-label="Contact"
        className={linkClass}
        title="Contact"
        onClick={() => handleClick("contact", contactUrl)}
      >
        <Button variant="outline" size={compact ? "icon" : "sm"} className="px-2">
          <Mail className="h-4 w-4" aria-hidden />
          {!compact && <span>Contact</span>}
        </Button>
      </a>
    </div>
  );
}