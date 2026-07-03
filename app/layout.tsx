import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MatchFlash",
  description: "Real-time match stories",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: ["/icon.svg"],
    apple: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
};

/* Inline script that runs before paint to apply the stored theme,
   preventing flash-of-wrong-theme on page load. */
const themeScript = `(function(){try{var t=localStorage.getItem('matchflash-theme');if(t==='dark'){document.documentElement.dataset.theme='dark'}}catch(e){}})()`;

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
