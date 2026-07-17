/**
 * Normalized multichat event model.
 *
 * Both Twitch IRC and Streamplace WebSocket payloads are converted into this
 * union. The renderer only ever sees ChatEvent objects — never raw protocol
 * data. This is the compatibility contract described in section 5 of the plan.
 */

export type Platform = "twitch" | "streamplace";

// ---------------------------------------------------------------------------
// Source state
// ---------------------------------------------------------------------------

export type SourceState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

// ---------------------------------------------------------------------------
// Author, badge, reply
// ---------------------------------------------------------------------------

export interface ChatAuthor {
  userId: string;
  handle: string;
  displayName: string;
  color?: string;
}

export interface Badge {
  id: string;
  /** "twitch" or "streamplace" — namespaces badge IDs so they never collide. */
  namespace: Platform;
  title?: string;
  imageUrl?: string;
}

export interface ReplyContext {
  rootId: string;
  parentId: string;
  parentAuthor?: string;
  parentText?: string;
}

// ---------------------------------------------------------------------------
// Fragments — pre-computed by the adapter so the renderer never does
// platform-specific range logic.
// ---------------------------------------------------------------------------

export type ChatFragment =
  | { type: "text"; text: string }
  | { type: "emote"; text: string; imageUrl: string; animatedUrl?: string }
  | { type: "mention"; text: string; userId?: string; handle?: string }
  | { type: "link"; text: string; url: string }
  | { type: "cheermote"; text: string; bits: number; imageUrl?: string };

// ---------------------------------------------------------------------------
// ChatEvent union
// ---------------------------------------------------------------------------

export interface NormalizedMessage {
  id: string;
  platform: Platform;
  channel: string;
  author: ChatAuthor;
  fragments: ChatFragment[];
  plainText: string;
  reply?: ReplyContext;
  badges?: Badge[];
}

export type ChatEvent =
  | {
      kind: "message";
      platform: Platform;
      channel: string;
      id: string;
      /** Upstream timestamp (ISO 8601). Not globally synchronized. */
      sourceTimestamp?: string;
      /** Aggregator-assigned timestamp (ISO 8601). Used for primary ordering. */
      receivedAt: string;
      /** True for Streamplace initial history; renderer may suppress animations. */
      historical?: boolean;
      author: ChatAuthor;
      fragments: ChatFragment[];
      plainText: string;
      reply?: ReplyContext;
      badges?: Badge[];
      /** Original upstream $type or IRC command, for debugging only. */
      rawType?: string;
    }
  | {
      kind: "delete-message";
      platform: Platform;
      channel: string;
      targetId: string;
    }
  | {
      kind: "clear-user";
      platform: Platform;
      channel: string;
      userId: string;
    }
  | {
      kind: "clear-channel";
      platform: Platform;
      channel: string;
    }
  | {
      kind: "pin";
      platform: "streamplace";
      channel: string;
      pinId: string;
      message?: NormalizedMessage;
      expiresAt?: string;
    }
  | {
      kind: "unpin";
      platform: "streamplace";
      channel: string;
    }
  | {
      kind: "source-status";
      platform: Platform;
      state: SourceState;
      /** Human-readable detail for debug mode. */
      detail?: string;
    };

// ---------------------------------------------------------------------------
// ID helpers (section 5.3)
// ---------------------------------------------------------------------------

/**
 * Twitch message key: `twitch:<channel>:<PRIVMSG id>`
 */
export function twitchMessageKey(channel: string, msgId: string): string {
  return `twitch:${channel}:${msgId}`;
}

/**
 * Streamplace message key: `streamplace:<AT URI>`
 */
export function streamplaceMessageKey(atUri: string): string {
  return `streamplace:${atUri}`;
}

// ---------------------------------------------------------------------------
// Envelope — the browser transport shape (section 2.3).
//
// In the server-aggregator architecture this was a WebSocket/SSE envelope.
// In the client-only architecture the adapters emit ChatEvent objects directly
// to the aggregator, but we keep the envelope type for potential future use
// and for the debug log.
// ---------------------------------------------------------------------------

export type OverlayEnvelope =
  | { type: "snapshot"; sessionId: string; events: ChatEvent[] }
  | { type: "events"; events: ChatEvent[] }
  | { type: "source-status"; platform: Platform; state: SourceState }
  | { type: "error"; platform?: Platform; code: string; message: string };

// ---------------------------------------------------------------------------
// Query parameters (section 1.1)
// ---------------------------------------------------------------------------

export interface ChatQueryParams {
  streamplace?: string;
  twitch?: string;
  layout?: "merged" | "columns";
  direction?: "down" | "up";
  hideAfter?: number;
  max?: number;
  theme?: "transparent" | "dark" | "light";
  fontSize?: number;
  showPlatform?: boolean;
  showBadges?: boolean;
}

export const DEFAULT_QUERY_PARAMS: Required<
  Omit<ChatQueryParams, "streamplace" | "twitch" | "hideAfter">
> & Pick<ChatQueryParams, "streamplace" | "twitch" | "hideAfter"> = {
  streamplace: undefined,
  twitch: undefined,
  layout: "merged",
  direction: "down",
  hideAfter: undefined,
  max: 100,
  theme: "transparent",
  fontSize: 14,
  showPlatform: true,
  showBadges: true,
};
