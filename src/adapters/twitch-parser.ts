/**
 * Twitch IRC parser.
 *
 * Pure parsing functions — no WebSocket dependency. Splits raw IRC text into
 * lines, parses IRCv3 tags, and converts each IRC command into a normalized
 * ChatEvent.
 *
 * Separated from the WebSocket adapter so it can be unit-tested with fixtures.
 */

import type { ChatEvent, ChatFragment, Badge } from "../types/chat";
import { twitchMessageKey } from "../types/chat";

// ---------------------------------------------------------------------------
// IRCv3 tag unescaping
// ---------------------------------------------------------------------------

/**
 * IRCv3 tag values escape the following sequences:
 *   \s → space, \n → newline, \r → CR, \: → semicolon, \\ → backslash
 */
export function unescapeTagValue(value: string): string {
  return value
    .replace(/\\s/g, " ")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\:/g, ";")
    .replace(/\\\\/g, "\\");
}

// ---------------------------------------------------------------------------
// IRC line parsing
// ---------------------------------------------------------------------------

export interface ParsedIrcLine {
  tags: Record<string, string>;
  prefix?: string;
  command?: string;
  params: string[];
  trailing?: string;
}

/**
 * Parse a single IRC line.
 *
 * Format: [@tags] [:prefix] command [param1 param2 ...] [:trailing]
 */
export function parseIrcLine(line: string): ParsedIrcLine {
  const result: ParsedIrcLine = {
    tags: {},
    params: [],
  };

  let rest = line;

  // Tags
  if (rest.startsWith("@")) {
    const spaceIdx = rest.indexOf(" ");
    const tagStr = spaceIdx === -1 ? rest.slice(1) : rest.slice(1, spaceIdx);
    rest = spaceIdx === -1 ? "" : rest.slice(spaceIdx + 1);

    for (const pair of tagStr.split(";")) {
      if (!pair) continue;
      const eqIdx = pair.indexOf("=");
      if (eqIdx === -1) {
        result.tags[pair] = "";
      } else {
        const key = pair.slice(0, eqIdx);
        const val = pair.slice(eqIdx + 1);
        result.tags[key] = unescapeTagValue(val);
      }
    }
  }

  // Skip leading whitespace
  rest = rest.trimStart();

  // Prefix
  if (rest.startsWith(":")) {
    const spaceIdx = rest.indexOf(" ");
    result.prefix = spaceIdx === -1 ? rest.slice(1) : rest.slice(1, spaceIdx);
    rest = spaceIdx === -1 ? "" : rest.slice(spaceIdx + 1);
  }

  rest = rest.trimStart();

  // Command and params
  // Find the trailing parameter (starts with :)
  const trailingIdx = rest.indexOf(" :");
  let trailing: string | undefined;
  if (trailingIdx !== -1) {
    trailing = rest.slice(trailingIdx + 2);
    rest = rest.slice(0, trailingIdx);
  } else if (rest.startsWith(":")) {
    trailing = rest.slice(1);
    rest = "";
  }

  const parts = rest.split(" ").filter((p) => p.length > 0);
  if (parts.length > 0) {
    result.command = parts[0];
    result.params = parts.slice(1);
  }

  if (trailing !== undefined) {
    result.trailing = trailing;
  }

  return result;
}

/**
 * Split a WebSocket frame into individual IRC lines.
 *
 * One frame can contain multiple messages separated by CRLF.
 * A partial line at the end is returned for the caller to prepend to the
 * next frame.
 *
 * Returns { lines, remainder }.
 */
export function splitIrcLines(frame: string): {
  lines: string[];
  remainder: string;
} {
  // Normalize both \r\n and \n
  const normalized = frame.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n");

  // If the frame ends with \n, the last element is "" — that's a complete
  // line terminator, not a partial line.
  if (normalized.endsWith("\n")) {
    parts.pop();
    return { lines: parts, remainder: "" };
  }

  // Last element is a partial line
  const partial = parts.pop() ?? "";
  return { lines: parts, remainder: partial };
}

// ---------------------------------------------------------------------------
// Emote range parsing
// ---------------------------------------------------------------------------

/**
 * Twitch emotes tag format:
 *   emotes=25:0-4,12-16/1902:6-10
 *
 * Maps emote ID → list of char ranges (start-end) in the original message.
 */
interface EmoteRange {
  emoteId: string;
  start: number;
  end: number; // inclusive
}

export function parseEmotesTag(
  emotesTag: string,
  _message: string
): EmoteRange[] {
  if (!emotesTag) return [];

  const ranges: EmoteRange[] = [];

  for (const emoteGroup of emotesTag.split("/")) {
    if (!emoteGroup) continue;
    const colonIdx = emoteGroup.indexOf(":");
    if (colonIdx === -1) continue;

    const emoteId = emoteGroup.slice(0, colonIdx);
    const rangePart = emoteGroup.slice(colonIdx + 1);

    for (const rangeStr of rangePart.split(",")) {
      if (!rangeStr) continue;
      const dashIdx = rangeStr.indexOf("-");
      if (dashIdx === -1) continue;
      const start = parseInt(rangeStr.slice(0, dashIdx), 10);
      const end = parseInt(rangeStr.slice(dashIdx + 1), 10);
      if (isNaN(start) || isNaN(end)) continue;
      ranges.push({ emoteId, start, end });
    }
  }

  // Sort by position so we can build fragments sequentially
  ranges.sort((a, b) => a.start - b.start);
  return ranges;
}

/**
 * Convert a Twitch PRIVMSG message + emotes tag into ordered fragments.
 *
 * Emote ranges are character offsets into the original message text.
 * The conversion is Unicode-aware (operates on Array.from to handle
 * surrogate pairs / grapheme approximation).
 */
export function buildFragments(
  message: string,
  emotesTag: string
): ChatFragment[] {
  const ranges = parseEmotesTag(emotesTag, message);
  if (ranges.length === 0) {
    return message ? [{ type: "text", text: message }] : [];
  }

  // Convert to code point array for correct offset math
  const chars = Array.from(message);
  const fragments: ChatFragment[] = [];

  let cursor = 0;

  for (const range of ranges) {
    // Text before this emote
    if (range.start > cursor) {
      const text = chars.slice(cursor, range.start).join("");
      fragments.push({ type: "text", text });
    }

    // The emote itself
    const emoteText = chars.slice(range.start, range.end + 1).join("");
    fragments.push({
      type: "emote",
      text: emoteText,
      imageUrl: `https://static-cdn.jtvnw.net/emoticons/v2/${range.emoteId}/default/dark/1.0`,
    });

    cursor = range.end + 1;
  }

  // Trailing text after last emote
  if (cursor < chars.length) {
    const text = chars.slice(cursor).join("");
    fragments.push({ type: "text", text });
  }

  return fragments;
}

// ---------------------------------------------------------------------------
// Badge parsing
// ---------------------------------------------------------------------------

/**
 * Twitch badges tag format:
 *   badges=moderator/1,subscriber/12
 *
 * badge-info may carry additional metadata (e.g. subscriber months).
 */
export function parseBadges(
  badgesTag: string,
  _badgeInfoTag: string
): Badge[] {
  if (!badgesTag) return [];

  const badges: Badge[] = [];
  for (const pair of badgesTag.split(",")) {
    if (!pair) continue;
    const slashIdx = pair.indexOf("/");
    const id = slashIdx === -1 ? pair : pair.slice(0, slashIdx);
    if (!id) continue;

    badges.push({
      id: pair,
      namespace: "twitch",
      title: badgeTitle(id),
    });
  }
  return badges;
}

function badgeTitle(badgeId: string): string | undefined {
  const titles: Record<string, string> = {
    moderator: "Moderator",
    subscriber: "Subscriber",
    vip: "VIP",
    broadcaster: "Broadcaster",
    admin: "Admin",
    staff: "Staff",
    partner: "Partner",
    bits: "Bits",
    premium: "Prime",
    "no_audio": "No Audio",
    "no_video": "No Video",
  };
  return titles[badgeId];
}

// ---------------------------------------------------------------------------
// IRC command → ChatEvent normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a parsed IRC line into zero or more ChatEvents.
 *
 * Returns { events, shouldPong } — `shouldPong` indicates the adapter
 * must send a PONG with the trailing payload.
 */
export function normalizeIrcLine(
  parsed: ParsedIrcLine,
  channel: string
): { events: ChatEvent[]; shouldPong?: boolean } {
  const cmd = parsed.command;

  switch (cmd) {
    case "PRIVMSG": {
      // Channel from params: #zeu_dev → zeu_dev
      const msgChannel =
        parsed.params.length > 0
          ? parsed.params[0].replace(/^#/, "")
          : channel;
      const message = parsed.trailing ?? "";
      const tags = parsed.tags;

      const msgId = tags["id"];
      if (!msgId) break; // can't normalize without an ID

      const receivedAt = new Date().toISOString();
      const sourceTimestamp = tags["tmi-sent-ts"]
        ? new Date(parseInt(tags["tmi-sent-ts"], 10)).toISOString()
        : undefined;

      const fragments = buildFragments(message, tags["emotes"] ?? "");
      const badges = parseBadges(
        tags["badges"] ?? "",
        tags["badge-info"] ?? ""
      );

      // Author from prefix: nick!user@host → nick
      const prefixNick = parsed.prefix
        ? parsed.prefix.split("!")[0]
        : tags["display-name"] ?? "unknown";

      const author = {
        userId: tags["user-id"] ?? prefixNick,
        handle: prefixNick.toLowerCase(),
        displayName: tags["display-name"] ?? prefixNick,
        color: tags["color"] || undefined,
      };

      // Reply context
      let reply: import("../types/chat").ReplyContext | undefined;
      const parentId = tags["reply-parent-msg-id"];
      if (parentId) {
        reply = {
          rootId: twitchMessageKey(msgChannel, parentId),
          parentId: twitchMessageKey(msgChannel, parentId),
          parentAuthor: tags["reply-parent-display-name"],
          parentText: tags["reply-parent-msg-body"],
        };
      }

      return {
        events: [
          {
            kind: "message",
            platform: "twitch",
            channel: msgChannel,
            id: twitchMessageKey(msgChannel, msgId),
            sourceTimestamp,
            receivedAt,
            author,
            fragments,
            plainText: message,
            reply,
            ...(badges.length > 0 ? { badges } : {}),
            rawType: "PRIVMSG",
          },
        ],
      };
    }

    case "CLEARMSG": {
      const msgChannel =
        parsed.params.length > 0
          ? parsed.params[0].replace(/^#/, "")
          : channel;
      const targetMsgId = parsed.tags["target-msg-id"];
      if (!targetMsgId) break;

      return {
        events: [
          {
            kind: "delete-message",
            platform: "twitch",
            channel: msgChannel,
            targetId: twitchMessageKey(msgChannel, targetMsgId),
          },
        ],
      };
    }

    case "CLEARCHAT": {
      const msgChannel =
        parsed.params.length > 0
          ? parsed.params[0].replace(/^#/, "")
          : channel;

      // If there's a trailing param, it's a target user (timeout/ban)
      if (parsed.trailing) {
        // We need the user-id from tags if present, otherwise use the login
        const targetUserId = parsed.tags["target-user-id"] ?? parsed.trailing;
        return {
          events: [
            {
              kind: "clear-user",
              platform: "twitch",
              channel: msgChannel,
              userId: targetUserId,
            },
          ],
        };
      }

      return {
        events: [
          {
            kind: "clear-channel",
            platform: "twitch",
            channel: msgChannel,
          },
        ],
      };
    }

    case "PING": {
      return { events: [], shouldPong: true };
    }

    // ROOMSTATE, USERSTATE, NOTICE, USERNOTICE, JOIN, PART, etc.
    // are ignored in the MVP — they don't produce chat message events.
    default:
      break;
  }

  return { events: [] };
}

// ---------------------------------------------------------------------------
// Frame processing: split → parse → normalize
// ---------------------------------------------------------------------------

/**
 * Process a raw WebSocket frame text into ChatEvents.
 *
 * Returns { events, shouldPong, remainder }. The caller should store
 * `remainder` and prepend it to the next frame.
 */
export function processTwitchFrame(
  frame: string,
  channel: string,
  priorRemainder: string = ""
): {
  events: ChatEvent[];
  shouldPong: boolean;
  remainder: string;
} {
  const fullText = priorRemainder + frame;
  const { lines, remainder } = splitIrcLines(fullText);

  let events: ChatEvent[] = [];
  let shouldPong = false;

  for (const line of lines) {
    if (!line.trim()) continue;
    const parsed = parseIrcLine(line);
    const result = normalizeIrcLine(parsed, channel);
    if (result.events.length > 0) {
      events = events.concat(result.events);
    }
    if (result.shouldPong) {
      shouldPong = true;
    }
  }

  return { events, shouldPong, remainder };
}
