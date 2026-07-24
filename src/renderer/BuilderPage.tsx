/**
 * URL builder page — configure all /chat query params visually
 * and get a ready-to-use URL for OBS or the browser.
 */

import { useState, useMemo } from "react";
import {
  IconBrandTwitch,
  IconArrowRight,
  IconCopy,
  IconCheck,
  IconLayoutGrid,
  IconPalette,
  IconEye,
  IconEyeOff,
  IconMessage2,
  IconBell,
} from "@tabler/icons-react";
import "./builder.css";

interface BuilderState {
  twitch: string;
  streamplace: string;
  layout: "merged" | "columns";
  direction: "down" | "up";
  hideAfter: number;
  max: number;
  theme: "transparent" | "dark" | "light";
  fontSize: number;
  showPlatform: boolean;
  showBadges: boolean;
  debug: boolean;
}

const DEFAULTS: BuilderState = {
  twitch: "zeu_dev",
  streamplace: "zeu.dev",
  layout: "merged",
  direction: "down",
  hideAfter: 60,
  max: 100,
  theme: "transparent",
  fontSize: 14,
  showPlatform: true,
  showBadges: true,
  debug: false,
};

export default function BuilderPage() {
  const [s, setS] = useState<BuilderState>(DEFAULTS);
  const [copied, setCopied] = useState(false);

  const set = <K extends keyof BuilderState>(key: K, val: BuilderState[K]) =>
    setS((prev) => ({ ...prev, [key]: val }));

  const url = useMemo(() => {
    const params = new URLSearchParams();
    if (s.streamplace) params.set("streamplace", s.streamplace);
    if (s.twitch) params.set("twitch", s.twitch);
    if (s.layout !== "merged") params.set("layout", s.layout);
    if (s.direction !== "down") params.set("direction", s.direction);
    if (s.hideAfter !== 60) params.set("hideAfter", String(s.hideAfter));
    if (s.max !== 100) params.set("max", String(s.max));
    if (s.theme !== "transparent") params.set("theme", s.theme);
    if (s.fontSize !== 14) params.set("fontSize", String(s.fontSize));
    if (!s.showPlatform) params.set("showPlatform", "false");
    if (!s.showBadges) params.set("showBadges", "false");
    if (s.debug) params.set("debug", "true");
    const qs = params.toString();
    return `/chat${qs ? "?" + qs : ""}`;
  }, [s]);

  const fullUrl = typeof window !== "undefined" ? window.location.origin + url : url;

  const copy = () => {
    navigator.clipboard?.writeText(fullUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="builder">
      <header className="builder-nav">
        <a href="/" className="brand">
          <span className="brand-mark">⌥</span>
          <span className="brand-name">crosschat</span>
        </a>
        <span className="builder-title">URL builder</span>
      </header>

      <main className="builder-main">
        {/* Sources */}
        <Section icon={<IconBrandTwitch size={16} />} title="Sources">
          <Field label="Twitch">
            <input
              type="text"
              value={s.twitch}
              onChange={(e) => set("twitch", e.target.value)}
              placeholder="channel"
              spellCheck={false}
            />
          </Field>
          <Field label="Streamplace">
            <input
              type="text"
              value={s.streamplace}
              onChange={(e) => set("streamplace", e.target.value)}
              placeholder="handle"
              spellCheck={false}
            />
          </Field>
        </Section>

        {/* Layout */}
        <Section icon={<IconLayoutGrid size={16} />} title="Layout">
          <Field label="Layout">
            <SegGroup>
              <Seg active={s.layout === "merged"} onClick={() => set("layout", "merged")}>merged</Seg>
              <Seg active={s.layout === "columns"} onClick={() => set("layout", "columns")}>columns</Seg>
            </SegGroup>
          </Field>
          <Field label="Direction">
            <SegGroup>
              <Seg active={s.direction === "down"} onClick={() => set("direction", "down")}>↓ down</Seg>
              <Seg active={s.direction === "up"} onClick={() => set("direction", "up")}>↑ up</Seg>
            </SegGroup>
          </Field>
        </Section>

        {/* Appearance */}
        <Section icon={<IconPalette size={16} />} title="Appearance">
          <Field label="Theme">
            <SegGroup>
              {(["transparent", "dark", "light"] as const).map((t) => (
                <Seg key={t} active={s.theme === t} onClick={() => set("theme", t)}>{t}</Seg>
              ))}
            </SegGroup>
          </Field>
          <Field label={`Font ${s.fontSize}px`}>
            <input
              type="range"
              min={10}
              max={32}
              value={s.fontSize}
              onChange={(e) => set("fontSize", Number(e.target.value))}
            />
          </Field>
          <Field label="Max">
            <input
              type="number"
              min={10}
              max={500}
              value={s.max}
              onChange={(e) => set("max", Number(e.target.value))}
            />
          </Field>
          <Field label={`Fade ${s.hideAfter === 0 ? "off" : s.hideAfter + "s"}`}>
            <input
              type="range"
              min={0}
              max={300}
              step={5}
              value={s.hideAfter}
              onChange={(e) => set("hideAfter", Number(e.target.value))}
            />
          </Field>
        </Section>

        {/* Visibility */}
        <Section icon={<IconEye size={16} />} title="Visibility">
          <Field label="Platform logos">
            <Toggle
              checked={s.showPlatform}
              onChange={(v) => set("showPlatform", v)}
              icon={s.showPlatform ? <IconEye size={14} /> : <IconEyeOff size={14} />}
            />
          </Field>
          <Field label="Badges">
            <Toggle
              checked={s.showBadges}
              onChange={(v) => set("showBadges", v)}
              icon={s.showBadges ? <IconEye size={14} /> : <IconEyeOff size={14} />}
            />
          </Field>
          <Field label="Debug status">
            <Toggle
              checked={s.debug}
              onChange={(v) => set("debug", v)}
              icon={<IconMessage2 size={14} />}
            />
          </Field>
        </Section>

        {/* URL preview */}
        <div className="url-preview">
          <div className="url-preview-label">
            <IconBell size={14} />
            overlay URL
          </div>
          <code className="url-preview-code">{fullUrl}</code>
          <div className="url-preview-actions">
            <button className="copy-btn" onClick={copy}>
              {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
              {copied ? "copied!" : "copy"}
            </button>
            <a href={url} className="open-btn">
              open overlay
              <IconArrowRight size={14} />
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Section({
  icon,
  title,
  children,
}: {
  icon: import("react").ReactNode;
  title: string;
  children: import("react").ReactNode;
}) {
  return (
    <div className="builder-section">
      <div className="builder-section-header">
        <span className="builder-section-icon">{icon}</span>
        <h2>{title}</h2>
      </div>
      <div className="builder-section-body">{children}</div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: import("react").ReactNode;
}) {
  return (
    <div className="builder-field">
      <span className="builder-field-label">{label}</span>
      <div className="builder-field-control">{children}</div>
    </div>
  );
}

function SegGroup({ children }: { children: import("react").ReactNode }) {
  return <div className="seg-group">{children}</div>;
}

function Seg({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: import("react").ReactNode;
}) {
  return (
    <button
      className={`seg${active ? " seg-active" : ""}`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function Toggle({
  checked,
  onChange,
  icon,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  icon: import("react").ReactNode;
}) {
  return (
    <button
      type="button"
      className={`toggle${checked ? " toggle-on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-icon">{icon}</span>
      <span className="toggle-track">
        <span className="toggle-thumb" />
      </span>
    </button>
  );
}
