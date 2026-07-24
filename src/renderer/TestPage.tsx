/**
 * Test page — renders canned messages covering every render path.
 *
 * Visits /test in the browser to see all fragment types, badges, reply
 * context, pin, platform markers, author colors, and edge cases without
 * needing live Twitch or Streamplace connections.
 *
 * The page builds the same ParsedChatParams shape the real overlay uses,
 * then feeds NormalizedMessage objects to the same MessageRow component
 * the /chat route renders.
 */

import { useState } from "react";
import type {
  NormalizedMessage,
  ChatFragment,
  Badge,
} from "../types/chat";
import type { ParsedChatParams } from "./params";
import { MessageRow } from "./ChatOverlay";
import "./test.css";

// ---------------------------------------------------------------------------
// Shared params — all rendering toggles on
// ---------------------------------------------------------------------------

const testParams: ParsedChatParams = {
  streamplace: undefined,
  twitch: undefined,
  layout: "merged",
  direction: "down",
  hideAfter: 0,
  max: 100,
  theme: "dark",
  fontSize: 14,
  showPlatform: true,
  showBadges: true,
  debug: false,
};

// ---------------------------------------------------------------------------
// Fragment builders
// ---------------------------------------------------------------------------

const text = (t: string): ChatFragment => ({ type: "text", text: t });

const emote = (
  text: string,
  imageUrl: string,
  animatedUrl?: string,
): ChatFragment => ({ type: "emote", text, imageUrl, animatedUrl });

const mention = (
  text: string,
  handle?: string,
  userId?: string,
): ChatFragment => ({ type: "mention", text, handle, userId });

const link = (text: string, url: string): ChatFragment => ({
  type: "link",
  text,
  url,
});

const cheermote = (
  text: string,
  bits: number,
  imageUrl?: string,
): ChatFragment => ({ type: "cheermote", text, bits, imageUrl });

// ---------------------------------------------------------------------------
// Badge builders
// ---------------------------------------------------------------------------

const twBadge = (id: string, title: string): Badge => ({
  id,
  namespace: "twitch",
  title,
  imageUrl: `https://static-cdn.jtvnw.net/badges/v1/${id}/3`,
});

const spBadge = (id: string, title: string): Badge => ({
  id,
  namespace: "streamplace",
  title,
});

// ---------------------------------------------------------------------------
// Message builder
// ---------------------------------------------------------------------------

let msgCounter = 0;

function msg(opts: {
  platform: "twitch" | "streamplace";
  handle: string;
  displayName?: string;
  color?: string;
  fragments: ChatFragment[];
  badges?: Badge[];
  reply?: NormalizedMessage["reply"];
  channel?: string;
}): NormalizedMessage {
  const id = `test-${++msgCounter}`;
  const platform = opts.platform;
  return {
    id,
    platform,
    channel: opts.channel ?? (platform === "twitch" ? "test_channel" : "did:plc:test"),
    author: {
      userId: `user-${opts.handle}`,
      handle: opts.handle,
      displayName: opts.displayName ?? opts.handle,
      ...(opts.color ? { color: opts.color } : {}),
    },
    fragments: opts.fragments,
    plainText: opts.fragments.map((f) => f.text).join(""),
    ...(opts.badges ? { badges: opts.badges } : {}),
    ...(opts.reply ? { reply: opts.reply } : {}),
  };
}

// ---------------------------------------------------------------------------
// Test message sets
// ---------------------------------------------------------------------------

/** Basic messages — plain text from both platforms. */
const basicMessages: NormalizedMessage[] = [
  msg({
    platform: "twitch",
    handle: "zeu_dev",
    color: "#FF7F50",
    fragments: [text("hello world")],
  }),
  msg({
    platform: "streamplace",
    handle: "zeu.dev",
    fragments: [text("hey from streamplace")],
  }),
  msg({
    platform: "twitch",
    handle: "cool_user_42",
    color: "#00FF7F",
    fragments: [text("this is a test message with some normal text content")],
  }),
];

/** Emotes — Twitch emote fragments with CDN URLs. */
const emoteMessages: NormalizedMessage[] = [
  msg({
    platform: "twitch",
    handle: "emote_lover",
    color: "#BF77F6",
    fragments: [
      emote("Kappa", "https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0"),
      text(" hello "),
      emote("Kappa", "https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0"),
    ],
  }),
  msg({
    platform: "twitch",
    handle: "party_time",
    color: "#FF69B4",
    fragments: [
      emote("PartyHat", "https://static-cdn.jtvnw.net/emoticons/v2/135874/default/dark/1.0"),
      text(" let's goooo "),
      emote("PogChamp", "https://static-cdn.jtvnw.net/emoticons/v2/305954156/default/dark/1.0"),
    ],
  }),
  msg({
    platform: "twitch",
    handle: "emote_only",
    fragments: [
      emote("LUL", "https://static-cdn.jtvnw.net/emoticons/v2/425618/default/dark/1.0"),
      emote("LUL", "https://static-cdn.jtvnw.net/emoticons/v2/425618/default/dark/1.0"),
      emote("LUL", "https://static-cdn.jtvnw.net/emoticons/v2/425618/default/dark/1.0"),
    ],
  }),
];

/** Mentions and links — Streamplace facet rendering. */
const mentionLinkMessages: NormalizedMessage[] = [
  msg({
    platform: "streamplace",
    handle: "social_user",
    fragments: [
      text("check out "),
      link("https://example.com", "https://example.com"),
      text(" and say hi to "),
      mention("@bob.example", "bob.example", "did:plc:bob123"),
    ],
  }),
  msg({
    platform: "streamplace",
    handle: "news_bot",
    fragments: [
      mention("@stream.place", "stream.place", "did:plc:streamplace"),
      text(" new release is live at "),
      link("stream.place", "https://stream.place"),
    ],
  }),
  msg({
    platform: "twitch",
    handle: "link_sharer",
    color: "#5B9FDE",
    fragments: [
      text("great article: "),
      link("example.com/article", "https://example.com/article"),
    ],
  }),
];

/** Cheermotes — bits cheering with image + text. */
const cheermoteMessages: NormalizedMessage[] = [
  msg({
    platform: "twitch",
    handle: "generous_fan",
    color: "#FFD700",
    badges: [twBadge("5d3e5ce5-fa19-4b4e-a3a4-0e2f9e2b6e3a", "Bits Leader")],
    fragments: [
      text("Cheer100! "),
      cheermote("cheer100", 100, "https://d3aq9zkyjz5x9m.cloudfront.net/dark/animated/100/1.gif"),
      text(" Let's go!"),
    ],
  }),
  msg({
    platform: "twitch",
    handle: "big_spender",
    color: "#FF4500",
    fragments: [
      cheermote("cheer5000", 5000, "https://d3aq9zkyjz5x9m.cloudfront.net/dark/animated/5000/1.gif"),
      text(" HYPE"),
    ],
  }),
];

/** Badges — moderator, subscriber, VIP, broadcaster, and Streamplace badges. */
const badgeMessages: NormalizedMessage[] = [
  msg({
    platform: "twitch",
    handle: "mod_author",
    color: "#00AD03",
    badges: [twBadge("3267646d-33f0-4b17-8ae0-8bf69b5a4e36", "Moderator")],
    fragments: [text("modding the chat")],
  }),
  msg({
    platform: "twitch",
    handle: "sub_author",
    color: "#1E90FF",
    badges: [
      twBadge("5a97d7aa-3a6e-4e3f-b57c-0d4e2c2bd0d8", "VIP"),
      twBadge("88a6e0d5-facf-48c3-b916-a7b29e9b0c30", "Subscriber"),
    ],
    fragments: [text("subbed for 12 months!")],
  }),
  msg({
    platform: "twitch",
    handle: "the_streamer",
    color: "#FF0000",
    badges: [twBadge("5527c58c-fb7d-422d-b71b-f309dcb85c86", "Broadcaster")],
    fragments: [text("welcome to my stream")],
  }),
  msg({
    platform: "streamplace",
    handle: "sp_verified",
    fragments: [
      text("streamplace verified user"),
    ],
    badges: [
      spBadge("verified", "Verified"),
      spBadge("founder", "Founder"),
    ],
  }),
  msg({
    platform: "streamplace",
    handle: "sp_mod",
    fragments: [text("keeping things civil")],
    badges: [spBadge("moderator", "Moderator")],
  }),
];

/** Reply context — threaded messages. */
const replyMessages: NormalizedMessage[] = [
  msg({
    platform: "twitch",
    handle: "replier",
    color: "#9147FF",
    fragments: [text("yeah I agree with that")],
    reply: {
      rootId: "twitch:test_channel:root-001",
      parentId: "twitch:test_channel:root-001",
      parentAuthor: "original_poster",
      parentText: "what does everyone think about this game?",
    },
  }),
  msg({
    platform: "streamplace",
    handle: "threader",
    fragments: [text("following up on this")],
    reply: {
      rootId: "streamplace:at://did:plc:test/place.stream.chat.message/root-001",
      parentId: "streamplace:at://did:plc:test/place.stream.chat.message/parent-001",
      parentAuthor: "root_author",
      parentText: "starting a discussion thread",
    },
  }),
  msg({
    platform: "twitch",
    handle: "no_context_reply",
    color: "#FF6347",
    fragments: [text("reply with no parent text")],
    reply: {
      rootId: "twitch:test_channel:root-002",
      parentId: "twitch:test_channel:root-002",
      parentAuthor: "mystery_user",
    },
  }),
];

/** Edge cases — empty fragments, very long text, special characters, unicode. */
const edgeCaseMessages: NormalizedMessage[] = [
  msg({
    platform: "twitch",
    handle: "long_text",
    color: "#CCCCCC",
    fragments: [
      text(
        "This is a very long message that should test word wrapping and overflow behavior in the overlay. ".repeat(3),
      ),
    ],
  }),
  msg({
    platform: "twitch",
    handle: "unicode_user",
    color: "#FF1493",
    fragments: [text(" emojis 🎉🚀✨, unicode: 日本語 émoji, symbols ©®™")],
  }),
  msg({
    platform: "streamplace",
    handle: "special_chars",
    fragments: [text("<script>alert('xss')</script> & <b>bold</b> & \"quotes\" & 'apostrophes'")],
  }),
  msg({
    platform: "twitch",
    handle: "newlines_user",
    color: "#32CD32",
    fragments: [text("line one\nline two\nline three")],
  }),
  msg({
    platform: "twitch",
    handle: "empty_msg",
    fragments: [],
  }),
];

/** Pinned message — rendered in the pin region. */
const pinnedMessage: NormalizedMessage = msg({
  platform: "streamplace",
  handle: "important_user",
  fragments: [text("This is a pinned message! It stays at the top.")],
  badges: [spBadge("moderator", "Moderator")],
});

// ---------------------------------------------------------------------------
// Section configuration
// ---------------------------------------------------------------------------

interface TestSection {
  title: string;
  description: string;
  messages: NormalizedMessage[];
}

const sections: TestSection[] = [
  {
    title: "Basic Messages",
    description: "Plain text from both platforms",
    messages: basicMessages,
  },
  {
    title: "Emotes",
    description: "Twitch emote fragments with CDN image URLs",
    messages: emoteMessages,
  },
  {
    title: "Mentions & Links",
    description: "Streamplace mentions and link facets, Twitch links",
    messages: mentionLinkMessages,
  },
  {
    title: "Cheermotes",
    description: "Bits cheering with animated images",
    messages: cheermoteMessages,
  },
  {
    title: "Badges",
    description: "Moderator, subscriber, VIP, broadcaster, Streamplace badges",
    messages: badgeMessages,
  },
  {
    title: "Reply Context",
    description: "Threaded messages with parent author and text",
    messages: replyMessages,
  },
  {
    title: "Edge Cases",
    description: "Long text, unicode, special characters, newlines, empty",
    messages: edgeCaseMessages,
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TestPage() {
  const [showPin, setShowPin] = useState(true);
  const [theme, setTheme] = useState<"dark" | "light" | "transparent">("dark");

  const params: ParsedChatParams = {
    ...testParams,
    theme,
    hideAfter: 0, // no fade on test page
  };

  return (
    <div className={`test-page theme-${theme}`}>
      <div className="test-header">
        <h1>crosschat — test page</h1>
        <p>
          Renders canned messages through the same <code>MessageRow</code> component
          used by <code>/chat</code>. No live connections needed.
        </p>
        <div className="test-controls">
          <label>
            <input
              type="checkbox"
              checked={showPin}
              onChange={(e) => setShowPin(e.target.checked)}
            />
            Show pinned message
          </label>
          <label>
            Theme:
            <select
              value={theme}
              onChange={(e) =>
                setTheme(e.target.value as "dark" | "light" | "transparent")
              }
            >
              <option value="dark">dark</option>
              <option value="light">light</option>
              <option value="transparent">transparent</option>
            </select>
          </label>
          <a href="/chat?streamplace=zeu.dev&twitch=zeu_dev&debug=true">
            → live overlay
          </a>
        </div>
      </div>

      {showPin && (
        <div className="test-pin">
          <span className="pin-label">📌 PIN</span>
          <MessageRow message={pinnedMessage} params={params} />
        </div>
      )}

      <div className="test-sections">
        {sections.map((section) => (
          <div key={section.title} className="test-section">
            <div className="test-section-header">
              <h2>{section.title}</h2>
              <span className="test-section-desc">{section.description}</span>
            </div>
            <div className="test-message-list">
              {section.messages.map((m) => (
                <MessageRow key={m.id} message={m} params={params} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
