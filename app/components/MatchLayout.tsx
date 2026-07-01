import Link from "next/link";
import ThemeToggle from "./ThemeToggle";
import TrustMark from "./TrustMark";
import SocialLinks from "./SocialLinks";

export default function MatchLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mf-page">
      <div className="mf-shell">
        <header className="mf-topbar">
          <Link href="/" className="mf-wordmark" aria-label="MatchFlash archive home">
            <span className="mf-wordmark-mark" aria-hidden="true">ϟ</span>
            <span className="mf-wordmark-text">Match<span className="mf-wordmark-thin">Flash</span></span>
          </Link>
          <TrustMark compact className="mf-topbar-trust" />
          <ThemeToggle />
        </header>
      </div>
      <main>{children}</main>
      <footer className="mf-global-footer">
        <div><strong>MatchFlash</strong><span>Replay the moments.<br />Verify the history.</span></div>
        <span>Built with TxLINE · TxODDS</span>
        <Link href="/archive" className="mf-footer-archive-link">World Cup Archive</Link>
        <SocialLinks />
      </footer>
    </div>
  );
}
