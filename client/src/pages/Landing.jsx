import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../store/AuthContext";
import { useEffect, useRef, useState } from "react";
import landingPinIcon from "../assets/icons/landing-icons/landing-pin-icon.png";
import landingMessageIcon from "../assets/icons/landing-icons/landing-message-icon.png";
import realtimeIcon from "../assets/icons/landing-icons/realtime-icon.png";
import mapIcon from "../assets/icons/landing-icons/map-icon.png";
import messageIcon from "../assets/icons/landing-icons/message-icon.png";
import meetupIcon from "../assets/icons/landing-icons/meetup-icon.png";
import rightArrowIcon from "../assets/icons/landing-icons/right-arrow.png";
import whiteDropdownIcon from "../assets/icons/landing-icons/white-dropdown.png";
import sunIcon from "../assets/icons/Header-icons/sun.png";
import moonIcon from "../assets/icons/Header-icons/moon.png";
import "./Landing.css";

const THEME_STORAGE_KEY = "linqly.theme";

export default function Landing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [scrollY, setScrollY] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isDarkToggle, setIsDarkToggle] = useState(() => {
    if (typeof window === "undefined") return false;
    const persisted = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (persisted === "dark") return true;
    if (persisted === "light") return false;
    return document.documentElement.getAttribute("data-theme") === "dark";
  });
  const transitionRef = useRef(0);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        setScrollY(window.scrollY || 0);
        frame = 0;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    let frame = 0;
    frame = window.requestAnimationFrame(() => {
      setLoaded(true);
    });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const elements = Array.from(document.querySelectorAll(".reveal"));
    if (!elements.length) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-inview");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
    );

    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      if (transitionRef.current) {
        window.clearTimeout(transitionRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const nextTheme = isDarkToggle ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", nextTheme);
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  }, [isDarkToggle]);

  if (user) return <Navigate to="/app" replace />;

  const handleRouteTransition = (path) => (event) => {
    if (event) event.preventDefault();
    if (isTransitioning) return;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isMobileViewport = window.matchMedia("(max-width: 768px)").matches;
    if (prefersReducedMotion || isMobileViewport) {
      navigate(path);
      return;
    }
    setIsTransitioning(true);
    transitionRef.current = window.setTimeout(() => {
      navigate(path);
    }, 320);
  };

  const bgShift = `translate3d(0, ${Math.round(scrollY * 0.1)}px, 0)`;
  const midShift = `translate3d(0, ${Math.round(scrollY * 0.2)}px, 0)`;
  const fgShift = `translate3d(0, ${Math.round(scrollY * 0.3)}px, 0)`;
  const headlineShift = `translate3d(0, ${Math.round(scrollY * 0.08)}px, 0)`;
  const subheadShift = `translate3d(0, ${Math.round(scrollY * 0.12)}px, 0)`;
  const ctaShift = `translate3d(0, ${Math.round(scrollY * 0.16)}px, 0)`;
 
  return (
    <div className="landing-page">
      <div
        className={`landing-route-transition ${isTransitioning ? "is-active" : ""}`}
        aria-hidden="true"
      />
      <header className={`landing-topbar ${loaded ? "isLoaded" : ""}`}>
        <div className="landing-topbar-pill">
          <Link to="/" className="landing-logo">
            <span className="landing-logo-text">Linqly</span>
          </Link>
          <div className="landing-topbar-center">
            <button
              type="button"
              className={`landing-theme-toggle ${isDarkToggle ? "isDark" : "isLight"}`}
              aria-label="Toggle monochrome theme"
              title="Monochrome mode"
              aria-pressed={isDarkToggle}
              onClick={() => setIsDarkToggle((prev) => !prev)}
            >
              <span className={`landing-theme-toggle-knob ${isDarkToggle ? "isOn" : ""}`}>
                <img src={isDarkToggle ? moonIcon : sunIcon} alt="" aria-hidden="true" />
              </span>
            </button>
          </div>
          <div className="landing-topbar-actions">
            <Link to="/login" className="landing-btn landing-btn-ghost" onClick={handleRouteTransition("/login")}>Login</Link>
            <Link to="/register" className="landing-btn landing-btn-solid" onClick={handleRouteTransition("/register")}>Get started</Link>
          </div>
        </div>
      </header>

      <section className={`landing-hero ${loaded ? "isLoaded" : ""}`}>
        <div className="heroEffects" aria-hidden="true">
          <div className="landing-hero-layer heroBgLayer" style={{ transform: bgShift }}>
            <div className="hero-gradient" />
          </div>

          <div className="landing-hero-layer heroMidLayer" style={{ transform: midShift }}>
            <div className="hero-grid" />
            <span className="hero-particle particle-a" />
            <span className="hero-particle particle-b" />
            <span className="hero-particle particle-c" />
            <span className="hero-particle particle-d" />
            <span className="hero-particle particle-e" />
            <span className="hero-particle particle-f" />
            <span className="hero-particle particle-g" />
            <span className="hero-particle particle-h" />
            <span className="hero-particle particle-i" />
            <span className="hero-particle particle-j" />
            <span className="hero-particle particle-k" />
            <span className="hero-particle particle-l" />
            <span className="hero-particle particle-m" />
            <span className="hero-particle particle-n" />
            <span className="hero-particle particle-o" />
            <span className="hero-particle particle-p" />
          </div>

          <div className="landing-hero-layer heroFgLayer" style={{ transform: fgShift }}>
            <div className="hero-glass-card hero-card-top-left float-a">
              <img
                src={landingMessageIcon}
                alt=""
                aria-hidden="true"
                className="hero-icon hero-message-icon"
              />
              <div className="hero-lines">
                <span />
                <span />
              </div>
            </div>
            <div className="hero-glass-card hero-card-bottom-left float-b">
              <img
                src={landingMessageIcon}
                alt=""
                aria-hidden="true"
                className="hero-icon hero-message-icon"
              />
              <div className="hero-lines">
                <span />
                <span />
                <span />
              </div>
            </div>
            <div className="hero-glass-card hero-card-right float-c">
              <img
                src={landingMessageIcon}
                alt=""
                aria-hidden="true"
                className="hero-icon hero-message-icon"
              />
              <div className="hero-lines">
                <span />
                <span />
              </div>
            </div>
            <div className="hero-pin-circle float-d">
              <img
                src={landingPinIcon}
                alt=""
                aria-hidden="true"
                className="hero-icon hero-pin-icon"
              />
            </div>
          </div>
        </div>

        <div className="landing-shell landing-hero-content">
          <h1 className="heroHeadline">
            <span className="heroHeadlineParallax" style={{ transform: headlineShift }}>
              <span>Connect online.</span>
              <span>Meet offline.</span>
              <span>In real time.</span>
            </span>
          </h1>
          <p className="landing-hero-sub heroSubhead">
            <span className="heroSubheadParallax" style={{ transform: subheadShift }}>
              Linqly helps you discover people, plan hangouts on a map, and coordinate in real time
              {" "}all in one place.
            </span>
          </p>
          <div className="landing-hero-cta heroCtas">
            <div className="heroCtasParallax" style={{ transform: ctaShift }}>
              <Link to="/register" className="landing-btn landing-btn-solid landing-hero-primary" onClick={handleRouteTransition("/register")}>
                Get started
                <span aria-hidden="true" className="landing-hero-arrow">
                  <img src={rightArrowIcon} alt="" aria-hidden="true" />
                </span>
              </Link>
              <a href="#how-it-works" className="landing-btn landing-btn-outline">See how it works</a>
            </div>
          </div>
          <a href="#how-it-works" className="landing-scroll-indicator" aria-label="Scroll to next section">
            <span aria-hidden="true">
              <img src={whiteDropdownIcon} alt="" aria-hidden="true" />
            </span>
          </a>
        </div>
      </section>

      <section className="landing-section landing-value" aria-label="Core value proposition">
        <div className="landing-shell">
          <div className="landing-value-grid">
            <article className="landing-value-item reveal reveal-up reveal-blur" style={{ "--d": "0ms" }}>
              <span className="landing-value-icon-circle" aria-hidden="true">
                <img src={realtimeIcon} alt="" className="landing-value-icon" />
              </span>
              <h3>Real-time coordination</h3>
              <p>See updates as they happen and keep everyone aligned.</p>
            </article>
            <article className="landing-value-item reveal reveal-up reveal-blur" style={{ "--d": "90ms" }}>
              <span className="landing-value-icon-circle" aria-hidden="true">
                <img src={mapIcon} alt="" className="landing-value-icon" />
              </span>
              <h3>Map-based hangouts</h3>
              <p>Pin meetup spots, set context, and invite people fast.</p>
            </article>
            <article className="landing-value-item reveal reveal-up reveal-blur" style={{ "--d": "180ms" }}>
              <span className="landing-value-icon-circle" aria-hidden="true">
                <img src={messageIcon} alt="" className="landing-value-icon" />
              </span>
              <h3>In-context messaging</h3>
              <p>Chat directly around a plan without losing location context.</p>
            </article>
            <article className="landing-value-item reveal reveal-up reveal-blur" style={{ "--d": "270ms" }}>
              <span className="landing-value-icon-circle" aria-hidden="true">
                <img src={meetupIcon} alt="" className="landing-value-icon" />
              </span>
              <h3>From idea to meetup</h3>
              <p>Move from we should hang out to see you there quickly.</p>
            </article>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="landing-section landing-flow" aria-labelledby="flow-heading">
        <div className="landing-shell">
          <h2 id="flow-heading" className="reveal reveal-up reveal-blur">How it works</h2>
          <p className="landing-flow-subtitle reveal reveal-up reveal-blur" style={{ "--d": "100ms" }}>
            From first connection to final meetup, Linqly streamlines the entire coordination process.
          </p>

          <div className="landing-flow-rows">
            <article className="landing-flow-row">
              <div className="landing-flow-copy reveal reveal-left reveal-blur">
                <div className="landing-flow-headline">
                  <span className="landing-flow-badge">01</span>
                  <h3>Connect with friends</h3>
                </div>
                <p>
                  Build your network by adding friends, classmates, or community members. See who's active and
                  available in real time, so you always know who's ready to hang out.
                </p>
                <ul>
                  <li>Add friends via username or dispay name</li>
                  <li>See real-time availability status</li>
                  <li>Organize contacts into custom groups</li>
                </ul>
              </div>

              <div className="landing-flow-mock landing-flow-mock-friends reveal reveal-up reveal-blur" aria-hidden="true" style={{ "--d": "120ms" }}>
                <div className="landing-flow-mock-row">
                  <span className="landing-flow-avatar" />
                  <div className="landing-flow-lines"><span /><span /></div>
                  <span className="landing-flow-status-dot" />
                </div>
                <div className="landing-flow-mock-row">
                  <span className="landing-flow-avatar" />
                  <div className="landing-flow-lines"><span /><span /></div>
                  <span className="landing-flow-status-dot" />
                </div>
                <div className="landing-flow-mock-row">
                  <span className="landing-flow-avatar" />
                  <div className="landing-flow-lines"><span /><span /></div>
                  <span className="landing-flow-status-dot" />
                </div>
                <div className="landing-flow-mock-row">
                  <span className="landing-flow-avatar" />
                  <div className="landing-flow-lines"><span /><span /></div>
                  <span className="landing-flow-status-dot" />
                </div>
              </div>
            </article>

            <article className="landing-flow-row landing-flow-row-reverse">
              <div className="landing-flow-copy reveal reveal-right reveal-blur">
                <div className="landing-flow-headline">
                  <span className="landing-flow-badge">02</span>
                  <h3>Create a hangout</h3>
                </div>
                <p>
                  Drop a pin on the map, set the time, and invite friends in seconds. Keep plans clear by anchoring
                  details to a real place.
                </p>
                <ul>
                  <li>Pin a location and set meetup details</li>
                  <li>Invite friends or groups instantly</li>
                  <li>Control visibility and who can join</li>
                </ul>
              </div>

              <div className="landing-flow-mock landing-flow-mock-map reveal reveal-up reveal-blur" aria-hidden="true" style={{ "--d": "120ms" }}>
                <div className="landing-flow-map-panel">
                  <img src={mapIcon} alt="" className="landing-flow-map-pin" />
                  <div className="landing-flow-map-sheet">
                    <span className="landing-flow-sheet-title" />
                    <div className="landing-flow-sheet-lines">
                      <span />
                      <span />
                    </div>
                    <div className="landing-flow-sheet-avatars">
                      <span />
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                </div>
              </div>
            </article>

            <article className="landing-flow-row">
              <div className="landing-flow-copy reveal reveal-left reveal-blur">
                <div className="landing-flow-headline">
                  <span className="landing-flow-badge">03</span>
                  <h3>Coordinate in real time</h3>
                </div>
                <p>
                  Chat inside the hangout and keep everyone aligned as plans evolve. Updates stay connected to the
                  meetup so nothing gets lost.
                </p>
                <ul>
                  <li>In-context hangout chat</li>
                  <li>Live updates when people join or change plans</li>
                  <li>Share quick info like ETA or location notes</li>
                </ul>
              </div>

              <div className="landing-flow-mock landing-flow-mock-chat reveal reveal-up reveal-blur" aria-hidden="true" style={{ "--d": "120ms" }}>
                <div className="landing-flow-chat-top">
                  <span className="landing-flow-chat-avatar" />
                  <div className="landing-flow-chat-message">
                    <span className="landing-flow-chat-line" />
                    <span className="landing-flow-chat-line short" />
                  </div>
                  <span className="landing-flow-chat-time">2m ago</span>
                </div>

                <div className="landing-flow-chat-reply">
                  <div className="landing-flow-chat-bubble">
                    <span />
                    <span />
                  </div>
                  <span className="landing-flow-chat-avatar small" />
                  <span className="landing-flow-chat-time right">Just now</span>
                </div>

                <div className="landing-flow-chat-update">
                  <span className="landing-flow-chat-divider" />
                  <span className="landing-flow-chat-chip">Kian added Yao into the Group Chat</span>
                  <span className="landing-flow-chat-divider" />
                </div>

                <div className="landing-flow-chat-input">
                  <span className="landing-flow-chat-avatar" />
                  <div className="landing-flow-chat-input-bar">
                    <span />
                  </div>
                </div>
              </div>
            </article>

            <article className="landing-flow-row landing-flow-row-reverse">
              <div className="landing-flow-copy reveal reveal-right reveal-blur">
                <div className="landing-flow-headline">
                  <span className="landing-flow-badge">04</span>
                  <h3>Meet offline</h3>
                </div>
                <p>
                  Show up with confidence. With location-based planning and real-time coordination, meetups happen
                  smoothly without endless back-and-forth.
                </p>
                <ul>
                  <li>See who's joining and when</li>
                  <li>Reduce "Where are you?" messages</li>
                  <li>Turn conversations into real plans</li>
                </ul>
              </div>

              <div className="landing-flow-mock landing-flow-mock-status reveal reveal-up reveal-blur" aria-hidden="true" style={{ "--d": "120ms" }}>
                <div className="landing-flow-status-map">
                  <img src={mapIcon} alt="" className="landing-flow-status-pin" />
                  <span className="landing-flow-status-route">
                    <span />
                  </span>
                </div>
                <div className="landing-flow-status-list">
                  <div className="landing-flow-status-row">
                    <span className="landing-flow-status-avatar dark" />
                    <div className="landing-flow-status-lines">
                      <span />
                      <span />
                    </div>
                    <span className="landing-flow-status-pill dark">Arrived</span>
                  </div>
                  <div className="landing-flow-status-row">
                    <span className="landing-flow-status-avatar mid" />
                    <div className="landing-flow-status-lines">
                      <span />
                      <span />
                    </div>
                    <span className="landing-flow-status-pill">On the way</span>
                  </div>
                  <div className="landing-flow-status-row">
                    <span className="landing-flow-status-avatar mid" />
                    <div className="landing-flow-status-lines">
                      <span />
                      <span />
                    </div>
                    <span className="landing-flow-status-pill">On the way</span>
                  </div>
                  <div className="landing-flow-status-row">
                    <span className="landing-flow-status-avatar light" />
                    <div className="landing-flow-status-lines">
                      <span />
                      <span />
                    </div>
                    <span className="landing-flow-status-pill">Confirmed</span>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="landing-section landing-highlights" aria-labelledby="highlights-heading">
        <div className="landing-shell landing-highlight-layout">
          <div className="landing-highlight-visual" aria-hidden="true">
            <div className="landing-ui-card ui-map reveal reveal-up" style={{ "--d": "0ms" }}>
              <header>Map</header>
              <div className="ui-map-preview" aria-hidden="true">
                <img src={mapIcon} alt="" className="ui-map-pin" />
                <span className="ui-map-cta">
                  <span />
                </span>
              </div>
            </div>
            <div className="landing-ui-card ui-chat reveal reveal-up" style={{ "--d": "120ms" }}>
              <header>Chat</header>
              <div className="ui-line" />
              <div className="ui-line" />
              <div className="ui-line short" />
            </div>
            <div className="landing-ui-card ui-hangout reveal reveal-up" style={{ "--d": "240ms" }}>
              <header>Hangout</header>
              <p>Friday 7:30 PM - City Center</p>
            </div>
          </div>
          <div className="landing-highlight-copy">
            <h2 id="highlights-heading" className="reveal reveal-up reveal-blur">Everything around a single plan</h2>
            <ul>
              <li className="reveal reveal-up" style={{ "--d": "80ms" }}>Map and chat stay connected throughout the meetup lifecycle.</li>
              <li className="reveal reveal-up" style={{ "--d": "160ms" }}>Threaded coordination avoids scattered group chat confusion.</li>
              <li className="reveal reveal-up" style={{ "--d": "240ms" }}>Status updates make timing clearer without constant check-ins.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="landing-section landing-usecases" aria-labelledby="usecases-heading">
        <div className="landing-shell landing-usecases-shell">
          <h2 id="usecases-heading" className="reveal reveal-up reveal-blur">Built for real life</h2>
          <div className="landing-usecase-grid">
            <article className="landing-usecase-card usecaseCard uc1 reveal reveal-up reveal-blur" style={{ "--d": "0ms" }}>
              <h3>Friends planning meetups</h3>
              <p>Stop the endless "where should we go?" texts. Drop pins, vote, and coordinate in one place.</p>
            </article>
            <article className="landing-usecase-card usecaseCard uc2 reveal reveal-up reveal-blur" style={{ "--d": "110ms" }}>
              <h3>Students coordinating hangouts</h3>
              <p>Find people to study with, grab food, or explore campus. Make plans without the chaos.</p>
            </article>
            <article className="landing-usecase-card usecaseCard uc3 reveal reveal-up reveal-blur" style={{ "--d": "220ms" }}>
              <h3>Local communities</h3>
              <p>Organize neighborhood events, group activities, or spontaneous gatherings with ease.</p>
            </article>
            <article className="landing-usecase-card usecaseCard uc4 reveal reveal-up reveal-blur" style={{ "--d": "330ms" }}>
              <h3>Anyone tired of messy group chats</h3>
              <p>If you've ever lost track of plans in a 200-message thread, Linqly is for you.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="landing-final-cta" aria-labelledby="final-cta-heading">
        <div className="landing-shell">
          <h2 id="final-cta-heading" className="reveal reveal-up reveal-blur">Turn conversations into plans.</h2>
          <Link to="/register" className="landing-btn landing-btn-solid reveal reveal-up" style={{ "--d": "120ms" }} onClick={handleRouteTransition("/register")}>Join Linqly</Link>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-shell landing-footer-inner reveal reveal-fade" style={{ "--d": "0ms" }}>
          <span>Linqly - {new Date().getFullYear()}</span>
          <nav aria-label="Footer">
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
            <a href="#">Contact</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
