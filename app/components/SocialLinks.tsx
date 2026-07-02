const links = [
  { href: "https://github.com/Dairus01/getmatchflash", label: "GitHub", mark: "GH" },
  { href: "https://t.me/GetMatchFlashBot", label: "Telegram", mark: "TG" },
];

export default function SocialLinks({ dark = false }: { dark?: boolean }) {
  return <div className={`mf-social-links ${dark ? "mf-social-links-dark" : ""}`} aria-label="MatchFlash community links">
    {links.map((link) => <a key={link.label} href={link.href} target="_blank" rel="noreferrer" aria-label={`MatchFlash on ${link.label}`}>
      <span className="mf-social-icon" aria-hidden="true">{link.mark}</span><span>{link.label}</span>
    </a>)}
  </div>;
}

