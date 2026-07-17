/**
 * Streamplace WebSocket adapter.
 *
 * Connects to /api/websocket/{stream} on a Streamplace node, receives
 * $type-discriminated JSON objects, normalizes them to ChatEvents, and
 * handles the initial history burst.
 *
 * The initial burst on connect includes recent history (up to 100 messages)
 * plus profile, livestream, media and viewer state. Because these producers
 * are concurrent, cross-type initial ordering is unspecified (section 4.5).
 *
 * The adapter marks messages received during the initial burst as historical,
 * then switches to live mode after a short delay once the burst settles.
 */

import type { ChatEvent, SourceState } from "../types/chat";
import { normalizeStreamplacePayload } from "./streamplace-parser";

export interface StreamplaceAdapterOptions {
  /**
   * Stream identifier — handle or DID. Example: "zeu.dev" or "did:plc:...".
   */
  stream: string;
  /**
   * Base URL of the Streamplace node. Defaults to https://stream.place.
   * Can be set to a proxy URL for CORS relief.
   */
  baseUrl?: string;
  /** If true (default), suppress message events from the initial burst. */
  skipHistory?: boolean;
  /** Callback for normalized events. */
  onEvent: (events: ChatEvent[]) => void;
  /** Callback for source status changes. */
  onStatus: (state: SourceState, detail?: string) => void;
}

const DEFAULT_BASE_URL = "https://stream.place";

/** How long after connect to treat messages as historical (initial burst). */
const HISTORY_WINDOW_MS = 2000;

/** Base backoff in ms. */
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;

export class StreamplaceAdapter {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private historicalMode = true;
  private skipHistory: boolean;
  private historyTimer: ReturnType<typeof setTimeout> | null = null;
  private opts: StreamplaceAdapterOptions;

  constructor(opts: StreamplaceAdapterOptions) {
    this.opts = opts;
    this.skipHistory = opts.skipHistory ?? true;
  }

  connect(): void {
    if (this.disposed) return;
    const base = this.opts.baseUrl ?? DEFAULT_BASE_URL;
    const wsUrl = this.buildWebSocketUrl(base, this.opts.stream);

    this.opts.onStatus("connecting");
    this.historicalMode = true;

    try {
      this.ws = new WebSocket(wsUrl);
    } catch (err) {
      this.opts.onStatus("error", "WebSocket creation failed: " + err);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.opts.onStatus("connected");

      // After the initial burst window, switch to live mode
      this.historyTimer = setTimeout(() => {
        this.historicalMode = false;
      }, HISTORY_WINDOW_MS);
    };

    this.ws.onmessage = (event) => {
      if (typeof event.data !== "string") return;

      let payload: unknown;
      try {
        payload = JSON.parse(event.data);
      } catch {
        // Ignore non-JSON frames
        return;
      }

      // Handle Streamplace error payloads for status
      if (
        payload &&
        typeof payload === "object" &&
        (payload as Record<string, unknown>).$type === "place.stream.error"
      ) {
        const msg =
          (payload as Record<string, unknown>).message as string ??
          "Streamplace error";
        this.opts.onStatus("error", msg);
        return;
      }

      let events = normalizeStreamplacePayload(
        payload,
        this.historicalMode
      );

      // When skipHistory is on, suppress message events during the initial burst.
      // Non-message events (pins, deletes, etc.) still pass through.
      if (this.skipHistory && this.historicalMode) {
        events = events.filter((e) => e.kind !== "message");
      }

      if (events.length > 0) {
        this.opts.onEvent(events);
      }
    };

    this.ws.onerror = () => {
      this.opts.onStatus("error", "WebSocket error");
    };

    this.ws.onclose = () => {
      if (this.disposed) return;
      this.opts.onStatus("disconnected");
      this.cleanupTimers();
      this.historicalMode = true; // reset for next connect
      this.scheduleReconnect();
    };
  }

  private buildWebSocketUrl(base: string, stream: string): string {
    // Convert http(s):// to ws(s)://
    const wsBase = base
      .replace(/^https:\/\//, "wss://")
      .replace(/^http:\/\//, "ws://");
    return wsBase + "/api/websocket/" + encodeURIComponent(stream);
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

  private cleanupTimers(): void {
    if (this.historyTimer) {
      clearTimeout(this.historyTimer);
      this.historyTimer = null;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.cleanupTimers();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      ) {
        this.ws.close();
      }
      this.ws = null;
    }
  }
}
