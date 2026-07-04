"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import ThemeToggle from "./components/ThemeToggle";
import TrustMark from "./components/TrustMark";
import CountryFlag from "./components/CountryFlag";
import { MATCHES } from "./data/matches";
import { countryCode } from "../lib/flags";
import UpcomingMatches from "./components/UpcomingMatches";
import SocialLinks from "./components/SocialLinks";

export default function Home() {
  const [search, setSearch] = useState("");
  const heroRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const heroCopyRef = useRef<HTMLDivElement>(null);
  const archiveRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);

  const filtered = MATCHES.filter((match) =>
    !search ||
    match.home.toLowerCase().includes(search.toLowerCase()) ||
    match.away.toLowerCase().includes(search.toLowerCase()),
  );

  useLayoutEffect(() => {
    const hero = heroRef.current;
    const video = videoRef.current;
    const overlay = overlayRef.current;
    const heroCopy = heroCopyRef.current;
    const archive = archiveRef.current;
    const nav = navRef.current;

    if (!hero || !video || !overlay || !heroCopy || !archive || !nav) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;

    gsap.registerPlugin(ScrollTrigger);
    const context = gsap.context(() => {
      gsap.from("[data-hero-reveal]", {
        y: 28,
        autoAlpha: 0,
        duration: 0.82,
        stagger: 0.13,
        delay: 0.18,
        ease: "power3.out",
        clearProps: "transform",
      });

      gsap.timeline({
        scrollTrigger: {
          trigger: hero,
          start: "top top",
          end: "bottom top",
          scrub: 0.8,
        },
      })
        .to(video, { scale: 1.1, ease: "none" }, 0)
        .to(heroCopy, { y: -56, autoAlpha: 0, ease: "none" }, 0)
        .to(overlay, { opacity: 0.68, ease: "none" }, 0);

      gsap.from("[data-archive-reveal]", {
        y: 24,
        autoAlpha: 0,
        duration: 0.72,
        stagger: 0.08,
        ease: "power3.out",
        scrollTrigger: {
          trigger: archive,
          start: "top 76%",
          once: true,
        },
      });

      ScrollTrigger.create({
        start: "1px top",
        end: "max",
        onEnter: () => nav.classList.add("is-scrolled"),
        onLeaveBack: () => nav.classList.remove("is-scrolled"),
      });

      const quickX = gsap.quickTo(hero, "--hero-mx", { duration: 0.8, ease: "power3.out" });
      const quickY = gsap.quickTo(hero, "--hero-my", { duration: 0.8, ease: "power3.out" });
      const onPointerMove = (event: PointerEvent) => {
        if (event.pointerType === "touch") return;
        quickX(((event.clientX / window.innerWidth) - 0.5) * 10);
        quickY(((event.clientY / window.innerHeight) - 0.5) * 8);
      };
      const onPointerLeave = () => {
        quickX(0);
        quickY(0);
      };

      hero.addEventListener("pointermove", onPointerMove);
      hero.addEventListener("pointerleave", onPointerLeave);

      return () => {
        hero.removeEventListener("pointermove", onPointerMove);
        hero.removeEventListener("pointerleave", onPointerLeave);
      };
    });

    return () => context.revert();
  }, []);

  return (
    <div className="mf-page mf-landing">
      <nav ref={navRef} className="mf-cinematic-nav" aria-label="Primary navigation">
        <Link href="/" className="mf-wordmark" aria-label="MatchFlash home">
          <span className="mf-wordmark-mark" aria-hidden="true">ϟ</span>
          <span className="mf-wordmark-text">Match<span className="mf-wordmark-thin">Flash</span></span>
        </Link>

        <div className="mf-nav-links">
          <a href="#upcoming">Upcoming</a>
          <a href="#archive">Explore Archive</a>
          <a href="#about">About</a>
        </div>

        <ThemeToggle />
      </nav>

      <main>
        <section ref={heroRef} className="mf-cinematic-hero" aria-labelledby="hero-title">
          <video
            ref={videoRef}
            className="mf-hero-video"
            src="/hero.mp4"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-hidden="true"
          />
          <div ref={overlayRef} className="mf-hero-overlay" aria-hidden="true" />
          <div className="mf-hero-vignette" aria-hidden="true" />

          <div className="mf-hero-content">
            <div ref={heroCopyRef} className="mf-hero-copy">
              <p className="mf-cinematic-eyebrow" data-hero-reveal>REAL MATCH ARCHIVE</p>
              <h1 id="hero-title" className="mf-cinematic-title">
                <span data-hero-reveal>Every Match.</span>
                <span data-hero-reveal>Every Moment.</span>
                <em data-hero-reveal>Verified Forever.</em>
              </h1>
              <p className="mf-cinematic-sub" data-hero-reveal>
                Replay goals, cards, momentum, lineups and match history exactly as they happened.
              </p>
              <div data-hero-reveal><TrustMark /></div>
              <div className="mf-hero-actions" data-hero-reveal>
                <a className="mf-hero-cta mf-hero-cta-primary" href="#archive">Explore Archive <span aria-hidden="true">↘</span></a>
                <Link className="mf-hero-cta mf-hero-cta-secondary" href={`/match/${MATCHES[0]?.id ?? ""}`}>
                  <span className="mf-play-mark" aria-hidden="true">▶</span> Watch Replay Demo
                </Link>
              </div>
            </div>
          </div>

          <a className="mf-scroll-cue" href="#archive" data-hero-reveal>
            <span>Scroll to enter archive</span>
            <i aria-hidden="true" />
          </a>
        </section>

        <UpcomingMatches />

        <section ref={archiveRef} id="archive" className="mf-archive-section" aria-labelledby="archive-title">
          <div className="mf-archive-intro">
            <div data-archive-reveal>
              <p className="mf-cinematic-eyebrow mf-archive-kicker">THE RECORD, OPENED</p>
              <h2 id="archive-title" className="mf-archive-title-large">Enter the archive.</h2>
            </div>
            <div className="mf-archive-description-wrap" data-archive-reveal>
              <p className="mf-archive-description">Every replay is reconstructed from cryptographically verified TxLINE event history.</p>
              <TrustMark compact />
            </div>
          </div>

          <label className="mf-search-wrap mf-archive-search" data-archive-reveal>
            <span className="mf-search-label">Search the archive</span>
            <span className="mf-search-control">
              <span className="mf-search-icon" aria-hidden="true">⌕</span>
              <input
                className="mf-search-input"
                type="search"
                placeholder="Search a team, e.g. Argentina"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <kbd>⌘ K</kbd>
            </span>
          </label>

          <div className="mf-archive-head" data-archive-reveal>
            <h3 className="mf-archive-title">Match archive</h3>
            <span className="mf-archive-count">{filtered.length} MATCHES</span>
          </div>
          <div className="mf-match-grid">
            {filtered.length === 0 && <p className="mf-no-results" data-archive-reveal>No matches found for that search.</p>}
            {filtered.map((match, index) => (
              <article key={match.id} className="mf-match-card" data-archive-reveal style={{ "--card-index": index } as CSSProperties}>
                <div className="mf-card-top"><span>{match.date}</span><span>{match.totalEvents.toLocaleString()} EVENTS</span></div>
                <div className="mf-match-teams">
                  <span className="mf-card-team"><CountryFlag country={match.home} size="card" />{match.home}<small>{countryCode(match.home)}</small></span>
                  <span className="mf-vs">vs</span>
                  <span className="mf-card-team"><CountryFlag country={match.away} size="card" />{match.away}<small>{countryCode(match.away)}</small></span>
                </div>
                <div className="mf-match-meta"><span>Full event history captured</span><span className="mf-verified-badge"><b aria-hidden="true">✓</b> TxLINE Verified</span></div>
                <Link href={`/match/${match.id}`} className="mf-view-btn"><span aria-hidden="true">▶</span> View Replay <span className="mf-view-arrow" aria-hidden="true">↗</span></Link>
              </article>
            ))}
          </div>

          <div className="mf-archive-foot" data-archive-reveal>
            <span className="mf-foot-mark" aria-hidden="true">ϟ</span>
            <p><strong>MatchFlash</strong> is a living record of the game — one verified moment at a time.</p>
          </div>
        </section>

        <section id="about" className="mf-origin-section" aria-labelledby="origin-title">
          <div className="mf-origin-copy">
            <p className="mf-cinematic-eyebrow">THE PROVENANCE LAYER</p>
            <h2 id="origin-title">Why MatchFlash exists.</h2>
            <p>Most sports platforms show scores. MatchFlash preserves history.</p>
            <p>Every event is archived from cryptographically verified TxLINE feeds, with TxODDS providing the data infrastructure underneath. Every replay can be revisited, reconstructed and checked.</p>
          </div>
          <div className="mf-origin-signal" aria-label="MatchFlash data provenance">
            <div className="mf-origin-signal-line"><span>RAW EVENT STREAM</span><i /></div>
            <div className="mf-origin-signal-line"><span>TXLINE PROOF</span><i /></div>
            <div className="mf-origin-signal-line"><span>MATCHFLASH REPLAY</span><i /></div>
            <TrustMark compact />
          </div>
        </section>
      </main>
      <footer className="mf-landing-footer">
        <span className="mf-foot-mark" aria-hidden="true">ϟ</span>
        <div><strong>MatchFlash</strong><span>Replay the moments. Verify the history.</span></div>
        <span className="mf-footer-built">Built with TxLINE · TxODDS</span>
        <Link href="/archive" className="mf-footer-archive-link">World Cup Archive</Link>
        <SocialLinks />
      </footer>
    </div>
  );
}
