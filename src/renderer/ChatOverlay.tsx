/**
 * Chat overlay renderer component.
 *
 * Renders normalized ChatEvents as a transparent OBS browser source.
 * Uses textContent and created DOM nodes — never innerHTML — for all
 * upstream content (section 6.1, 7.2).
 */

import { useEffect, useRef, useState } from "react";
import type {
  NormalizedMessage,
  ChatFragment,
  Badge,
  SourceState,
} from "../types/chat";
import { ChatAggregator } from "../aggregator/chat-aggregator";
import { parseChatParams, type ParsedChatParams } from "./params";
import { StreamplaceLogo, TwitchLogo } from "./PlatformLogos";
import "./overlay.css";

interface SourceStatus {
  twitch?: SourceState;
  streamplace?: SourceState;
}

export function ChatOverlay() {
  const [messages, setMessages] = useState<NormalizedMessage[]>([]);
  const [pin, setPin] = useState<NormalizedMessage | null>(null);
  const [status, setStatus] = useState<SourceStatus>({});
  const [params, setParams] = useState<ParsedChatParams | null>(null);
  const aggregatorRef = useRef<ChatAggregator | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Parse query params on mount
  useEffect(() => {
    const parsed = parseChatParams(window.location.search);
    setParams(parsed);

    if (!parsed.twitch && !parsed.streamplace) {
      return;
    }

    const aggregator = new ChatAggregator(
      {
        twitch: parsed.twitch,
        streamplace: parsed.streamplace,
      },
      {
        onMessages: (msgs) => setMessages(msgs),
        onPin: (msg) => setPin(msg),
        onSourceStatus: (platform, state) => {
          setStatus((prev) => ({ ...prev, [platform]: state }));
        },
      },
      parsed.max
    );

    aggregatorRef.current = aggregator;
    aggregator.start();

    return () => {
      aggregator.dispose();
      aggregatorRef.current = null;
    };
  }, []);

  // Auto-scroll to keep newest messages visible.
  // direction=down → stick to bottom; direction=up → stick to top.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (params?.direction === "up") {
      el.scrollTop = 0;
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, params?.direction]);

  // Apply font size to root element
  useEffect(() => {
    if (params) {
      document.documentElement.style.fontSize = `${params.fontSize}px`;
    }
  }, [params]);

  if (!params) return null;

  const hasSources = params.twitch || params.streamplace;

  return (
    <div
      className={`chat-overlay theme-${params.theme} direction-${params.direction}`}
      style={
        params.theme === "transparent"
          ? { background: "transparent" }
          : undefined
      }
    >
      {/* Pinned message region (section 6.3) */}
      {pin && (
        <div className="chat-pin-region">
          <span className="pin-label">📌 PIN</span>
          <MessageRow
            message={pin}
            params={params}
          />
        </div>
      )}

      {/* Debug status */}
      {params.debug && (
        <div className="chat-debug">
          {hasSources ? (
            <div className="debug-status">
              {params.twitch && (
                <span className={`status-twitch status-${status.twitch ?? "connecting"}`}>
                  TW: {status.twitch ?? "connecting"}
                </span>
              )}
              {params.streamplace && (
                <span className={`status-sp status-${status.streamplace ?? "connecting"}`}>
                  SP: {status.streamplace ?? "connecting"}
                </span>
              )}
            </div>
          ) : (
            <span className="debug-error">No sources configured. Use ?twitch=...&streamplace=...</span>
          )}
        </div>
      )}

      {/* Message list */}
      {hasSources ? (
        <div className="chat-messages" ref={scrollRef}>
          {messages.map((msg) => (
            <MessageRow
              key={msg.id}
              message={msg}
              params={params}
            />
          ))}
        </div>
      ) : (
        !params.debug && (
          <div className="chat-empty">
            <span>No sources configured</span>
          </div>
        )
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message row
// ---------------------------------------------------------------------------

function MessageRow({
  message,
  params,
}: {
  message: NormalizedMessage;
  params: ParsedChatParams;
}) {
  return (
    <div className={`chat-row platform-${message.platform}`}>
      {params.showPlatform && (
        <span className={`platform-marker platform-${message.platform}`}>
          {message.platform === "twitch" ? <TwitchLogo /> : <StreamplaceLogo />}
        </span>
      )}
      {params.showBadges && message.badges && message.badges.length > 0 && (
        <span className="badge-row">
          {message.badges.map((badge, i) => (
            <BadgeIcon key={`${badge.id}-${i}`} badge={badge} />
          ))}
        </span>
      )}
      <span
        className="author-name"
        style={
          message.author.color
            ? { color: adjustColorForTheme(message.author.color, params.theme) }
            : undefined
        }
      >
        {message.author.displayName}:
      </span>
      <span className="message-fragments">
        {message.fragments.map((fragment, i) => (
          <FragmentRenderer key={i} fragment={fragment} />
        ))}
      </span>
      {message.reply && (
        <span className="reply-context">
          ↳ {message.reply.parentAuthor ? `${message.reply.parentAuthor}: ` : ""}
          {message.reply.parentText}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fragment renderer
// ---------------------------------------------------------------------------

function FragmentRenderer({ fragment }: { fragment: ChatFragment }) {
  switch (fragment.type) {
    case "text":
      return <span className="frag-text">{fragment.text}</span>;

    case "emote":
      return (
        <img
          className="frag-emote"
          src={fragment.imageUrl}
          alt={fragment.text}
          loading="lazy"
        />
      );

    case "mention":
      return <span className="frag-mention">{fragment.text}</span>;

    case "link":
      return (
        <span className="frag-link">{fragment.text}</span>
      );

    case "cheermote":
      return (
        <span className="frag-cheermote">
          {fragment.imageUrl && (
            <img src={fragment.imageUrl} alt="" loading="lazy" />
          )}
          {fragment.text}
        </span>
      );

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Badge renderer
// ---------------------------------------------------------------------------

function BadgeIcon({ badge }: { badge: Badge }) {
  if (badge.imageUrl) {
    return (
      <img
        className="badge-icon"
        src={badge.imageUrl}
        alt={badge.title ?? ""}
        loading="lazy"
      />
    );
  }
  // Text-based badge fallback (no remote asset dependency, section 6.2)
  const letter = badge.id.split("/")[0]?.charAt(0)?.toUpperCase() ?? "?";
  return (
    <span className={`badge-text badge-${badge.namespace}`} title={badge.title ?? badge.id}>
      {letter}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Color contrast adjustment (section 6.2)
// ---------------------------------------------------------------------------

function adjustColorForTheme(color: string | undefined, theme: string): string | undefined {
  if (!color || typeof color !== "string" || !color.startsWith("#")) return color;
  if (theme === "dark" || theme === "transparent") {
    return lightenIfDark(color);
  }
  return darkenIfLight(color);
}

function lightenIfDark(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  // If luminance is too low for dark background, lighten it
  const luminance = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
  if (luminance < 80) {
    return rgbToHex(
      Math.min(255, rgb.r + 100),
      Math.min(255, rgb.g + 100),
      Math.min(255, rgb.b + 100)
    );
  }
  return hex;
}

function darkenIfLight(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const luminance = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
  if (luminance > 175) {
    return rgbToHex(
      Math.max(0, rgb.r - 80),
      Math.max(0, rgb.g - 80),
      Math.max(0, rgb.b - 80)
    );
  }
  return hex;
}

function hexToRgb(hex: unknown): { r: number; g: number; b: number } | null {
  if (typeof hex !== "string") return null;
  const match = hex.match(/^#?([a-f0-9]{2})([a-f0-9]{2})([a-f0-9]{2})$/i);
  if (!match) return null;
  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${r.toString(16).padStart(2, "0")}${g
    .toString(16)
    .padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}
