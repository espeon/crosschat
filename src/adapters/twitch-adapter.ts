/**
 * Twitch IRC WebSocket adapter.
 *
 * Connects to wss://irc-ws.chat.twitch.tv:443 using anonymous authentication
 * (PASS SCHMOOPIIE, NICK justinfan<digits>) — no OAuth token required.
 *
 * Emits normalized ChatEvent objects to a callback. Handles PING/PONG
 * keepalive and reconnect with exponential backoff.
 */

import type { ChatEvent, SourceState } from "../types/chat";
import {
  processTwitchFrame,
  parseIrcLine,
} from "./twitch-parser";
import { TwitchBadgeResolver } from "./twitch-badges";

export interface TwitchAdapterOptions {
  /** Lowercase Twitch channel login, e.g. "zeu_dev". */
  channel: string;
  /** WebSocket URL. Defaults to the public Twitch IRC endpoint. */
  url?: string;
  /** Callback for normalized events. */
  onEvent: (events: ChatEvent[]) => void;
  /** Callback for source status changes. */
  onStatus: (state: SourceState, detail?: string) => void;
  /** Called when the adapter needs to send a PONG. */
  onPong?: (payload: string) => void;
}

const TWITCH_IRC_URL = "wss://irc-ws.chat.twitch.tv:443";

/** Base backoff in ms. Doubled each retry, capped at 30s. */
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;

/**
 * Generate an anonymous Twitch IRC nickname.
 *
 * Format: justinfan<5-digit-random>
 */
export function anonymousNick(): string {
  return `justinfan${Math.floor(10_000 + Math.random() * 90_000)}`;
}

export class TwitchAdapter {
  private ws: WebSocket | null = null;
  private remainder = "";
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private pongPayload = "tmi.twitch.tv";
  private opts: TwitchAdapterOptions;
  private badgeResolver: TwitchBadgeResolver;
  private channelId: string | null = null;

  constructor(opts: TwitchAdapterOptions) {
    this.opts = opts;
    this.badgeResolver = new TwitchBadgeResolver();
  }

  connect(): void {
    if (this.disposed) return;
    const url = this.opts.url ?? TWITCH_IRC_URL;
    this.opts.onStatus("connecting");

    try {
      this.ws = new WebSocket(url);
    } catch (err) {
      this.opts.onStatus("error", `WebSocket creation failed: ${err}`);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.remainder = "";

      const nick = anonymousNick();
      const channel = this.opts.channel.toLowerCase();

      const ws = this.ws;
      if (!ws) return;

      // IRC is line-oriented; send CRLF-terminated commands
      ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands\r\n");
      ws.send("PASS SCHMOOPIIE\r\n");
      ws.send("NICK " + nick + "\r\n");

      // Fetch global badge definitions before joining so badge image URLs
      // are available for the first messages. This adds a brief delay but
      // prevents text-fallback badges on early messages.
      this.badgeResolver.fetch().finally(() => {
        ws.send("JOIN #" + channel + "\r\n");
        this.opts.onStatus("connected");
      });
    };

    this.ws.onmessage = (event) => {
      const frame = typeof event.data === "string" ? event.data : "";
      if (!frame) return;

      const { events, shouldPong, remainder } = processTwitchFrame(
        frame,
        this.opts.channel,
        this.remainder
      );
      this.remainder = remainder;

      // Capture room-id from ROOMSTATE for channel badge fetch
      if (frame.includes("ROOMSTATE")) {
        this.tryCaptureRoomId(frame);
      }

      // Resolve badge image URLs on message events
      const resolvedEvents = events.map((e) => {
        if (e.kind === "message" && e.badges) {
          return {
            ...e,
            badges: e.badges.map((b) => this.badgeResolver.resolve(b.id)),
          };
        }
        return e;
      });

      if (resolvedEvents.length > 0) {
        this.opts.onEvent(resolvedEvents);
      }

      if (shouldPong) {
        this.ws?.send("PONG :" + this.pongPayload + "\r\n");
      }
    };

    this.ws.onerror = () => {
      this.opts.onStatus("error", "WebSocket error");
    };

    this.ws.onclose = () => {
      if (this.disposed) return;
      this.opts.onStatus("disconnected");
      this.scheduleReconnect();
    };
  }

  private tryCaptureRoomId(frame: string): void {
    const lines = frame.split(/\r?\n/);
    for (const line of lines) {
      if (!line.includes("ROOMSTATE")) continue;
      const parsed = parseIrcLine(line);
      const roomId = parsed.tags["room-id"];
      if (roomId && roomId !== this.channelId) {
        this.channelId = roomId;
        // Fetch channel-specific badges now that we have the room-id
        this.badgeResolver.fetch(roomId);
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.disposed) return;
    this.reconnectAttempts++;
    const backoff = Math.min(
      BASE_BACKOFF_MS * Math.pow(2, this.reconnectAttempts - 1),
      MAX_BACKOFF_MS
    );
    this.opts.onStatus("reconnecting", "attempt " + this.reconnectAttempts);
    this.reconnectTimer = setTimeout(() => this.connect(), backoff);
  }

  dispose(): void {
    this.disposed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }
  }
}
