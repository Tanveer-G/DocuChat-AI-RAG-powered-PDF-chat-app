import SocialLinks from "@/components/SocialLinks";

export default function Header() {
  return (
    // inside your Header render

    <header className="border-b bg-card">
      <div className="flex items-center justify-between px-4 py-3 md:px-6">
        <h1 className="text-lg sm:text-xl md:text-2xl font-semibold">
          DocuChat AI
        </h1>

        {/* Right side - visible on all sizes */}
        <div className="flex items-center gap-3">
          {/* On mobile show compact icons only */}
          <div className="block md:hidden">
            <SocialLinks
              githubUrl="https://github.com/Tanveer-G/DocuChat-AI-RAG-powered-PDF-chat-app?utm_source=docuchat_app&utm_medium=header&utm_campaign=self_promo&utm_content=mobile"
              portfolioUrl="https://tanveer-portfolio.vercel.app/en-Us/?utm_source=docuchat_app&utm_medium=header&utm_campaign=self_promo&utm_content=mobile"
              contactUrl="https://tanveer-portfolio.vercel.app/en-Us/contact?utm_source=docuchat_app&utm_medium=header&utm_campaign=self_promo&utm_content=mobile"
              compact
            />
          </div>

          {/* On md+ show text + icons */}
          <div className="hidden md:block">
            <SocialLinks
              githubUrl="https://github.com/Tanveer-G/DocuChat-AI-RAG-powered-PDF-chat-app?utm_source=docuchat_app&utm_medium=header&utm_campaign=self_promo&utm_content=mobile"
              portfolioUrl="https://tanveer-portfolio.vercel.app/en-Us/?utm_source=docuchat_app&utm_medium=header&utm_campaign=self_promo&utm_content=mobile"
              contactUrl="https://tanveer-portfolio.vercel.app/en-Us/contact?utm_source=docuchat_app&utm_medium=header&utm_campaign=self_promo&utm_content=mobile"
              compact
            />
          </div>
        </div>
      </div>
    </header>
  );
}
