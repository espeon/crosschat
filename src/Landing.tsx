import { useState } from "react";
import {
  IconBrandTwitch,
  IconMessage2,
  IconShieldCheck,
  IconBolt,
  IconArrowsVertical,
  IconPin,
  IconEye,
  IconArrowRight,
  IconBrandGithub,
} from "@tabler/icons-react";

import "./App.css";
import { StreamplaceLogo } from "./renderer/PlatformLogos";

function Landing() {
  const [twitch, setTwitch] = useState("zeu_dev");
  const [streamplace, setStreamplace] = useState("zeu.dev");

  const overlayUrl = `/chat?streamplace=${streamplace}&twitch=${twitch}`;

  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="brand">
          <span className="brand-mark">⌥</span>
          <span className="brand-name">crosschat</span>
        </div>
        <nav>
          <a href="/builder">builder</a>
          <a href="/test">test</a>
          <a
            href="https://github.com/espeon/crosschat"
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
          <span style={{opacity: 0.65}}>one overlay,</span>
          <br />
          multiple chats.
        </h1>
        <p className="tagline">
          Twitch and Streamplace merged into a single transparent OBS browser
          source. No other setup needed.
        </p>

        <div className="overlay-url">
          <code className="url-editor">
            <span className="url-static">/chat?streamplace=</span>
            <input
              type="text"
              className="url-editable"
              value={streamplace}
              onChange={(e) => setStreamplace(e.target.value)}
              spellCheck={false}
              size={Math.max(streamplace.length, 1)}
            />
            <span className="url-static">&amp;twitch=</span>
            <input
              type="text"
              className="url-editable"
              value={twitch}
              onChange={(e) => setTwitch(e.target.value)}
              spellCheck={false}
              size={Math.max(twitch.length, 1)}
            />
          </code>
          <a href={overlayUrl} className="open-btn">
            open overlay
            <IconArrowRight size={16} />
          </a>
        </div>

        <div className="platforms">
          <span className="platform-badge">

            <StreamplaceLogo size={18} />
            Streamplace
          </span>
          <span className="platform-badge">
            <IconBrandTwitch size={18} />
            Twitch
          </span>
        </div>
      </main>

      <section className="features">
        <Feature
          icon={<IconMessage2 size={20} />}
          title="Unified timeline"
          desc="Messages from both platforms interleaved by timestamp."
        />
        <Feature
          icon={<IconShieldCheck size={20} />}
          title="Moderation aware"
          desc="Twitch CLEAR* and Streamplace delete requests remove messages in real time."
        />
        <Feature
          icon={<IconBolt size={20} />}
          title="Instant connect"
          desc="Anonymous IRC over Twitch and read-only Streamplace WebSocket. No oAuth or backend needed."
        />
        <Feature
          icon={<IconArrowsVertical size={20} />}
          title="Survives disconnects"
          desc="Independent reconnect with backoff and dedup, so no duplicate messages on reconnect."
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
