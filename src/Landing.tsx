import {
  IconBrandTwitch,
  IconBrandStackshare,
  IconMessage2,
  IconShieldCheck,
  IconBolt,
  IconArrowsVertical,
  IconPin,
  IconEye,
  IconArrowRight,
  IconBrandGithub,
  IconFlask,
} from "@tabler/icons-react";
import "./App.css";

function Landing() {
  const overlayUrl = "/chat?streamplace=zeu.dev&twitch=zeu_dev";

  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="brand">
          <span className="brand-mark">⌥</span>
          <span className="brand-name">crosschat</span>
        </div>
        <nav>
          <a href="/test">test</a>
          <a
            href="https://github.com/natalie/crosschat"
            target="_blank"
            rel="noreferrer"
          >
            <IconBrandGithub size={16} />
            github
          </a>
        </nav>
      </header>

      <main className="landing-hero">
        <h1>
          one overlay,
          <br />
          two chats.
        </h1>
        <p className="tagline">
          Twitch and Streamplace merged into a single transparent OBS browser
          source. No server, no tokens, no setup beyond a URL.
        </p>

        <div className="overlay-url">
          <code>{overlayUrl}</code>
          <a href={overlayUrl} className="open-btn">
            open overlay
            <IconArrowRight size={16} />
          </a>
        </div>

        <div className="platforms">
          <span className="platform-badge">
            <IconBrandTwitch size={18} />
            Twitch
          </span>
          <span className="platform-badge">
            <IconBrandStackshare size={18} />
            Streamplace
          </span>
        </div>
      </main>

      <section className="features">
        <Feature
          icon={<IconMessage2 size={20} />}
          title="Unified timeline"
          desc="Messages from both platforms interleaved by timestamp, or split into columns."
        />
        <Feature
          icon={<IconShieldCheck size={20} />}
          title="Moderation aware"
          desc="Twitch CLEARMSG/CLEARCHAT and Streamplace deletes remove messages in real time."
        />
        <Feature
          icon={<IconBolt size={20} />}
          title="Instant connect"
          desc="Anonymous Twitch IRC and read-only Streamplace WebSocket. No OAuth, no backend."
        />
        <Feature
          icon={<IconArrowsVertical size={20} />}
          title="Survives disconnects"
          desc="Independent reconnect with backoff and dedup — no duplicate messages on reconnect."
        />
        <Feature
          icon={<IconPin size={20} />}
          title="Pins & replies"
          desc="Streamplace pinned messages and reply context from both platforms."
        />
        <Feature
          icon={<IconEye size={20} />}
          title="Transparent by default"
          desc="No background, no scrollbars, no chrome. Themeable to dark or light."
        />
      </section>

      <footer className="landing-footer">
        <a href="/test">
          <IconFlask size={16} />
          view test page
        </a>
        <span>MIT</span>
      </footer>
    </div>
  );
}

function Feature({
  icon,
  title,
  desc,
}: {
  icon: import("react").ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="feature">
      <div className="feature-icon">{icon}</div>
      <div>
        <h3>{title}</h3>
        <p>{desc}</p>
      </div>
    </div>
  );
}

export default Landing;
