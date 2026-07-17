/**
 * Client-side aggregator.
 *
 * Merges events from both adapters into a single bounded message store.
 * Handles deduplication, deletion memory, clear operations, and a short
 * reorder buffer.
 *
 * This replaces the server-side aggregator from the original plan. Because
 * both Twitch (anonymous IRC) and Streamplace (read-only WebSocket) connect
 * directly from the browser, the merge happens client-side.
 */

import type { ChatEvent, SourceState, Platform, NormalizedMessage } from "../types/chat";
import { TwitchAdapter } from "../adapters/twitch-adapter";
import { StreamplaceAdapter } from "../adapters/streamplace-adapter";

export interface SourceConfig {
  twitch?: string;
  streamplace?: string;
  streamplaceBaseUrl?: string;
}

export interface AggregatorCallbacks {
  onMessages: (messages: NormalizedMessage[]) => void;
  onPin: (message: NormalizedMessage | null) => void;
  onSourceStatus: (platform: Platform, state: SourceState, detail?: string) => void;
}

interface StoredMessage {
  msg: NormalizedMessage;
  receivedAt: number; // epoch ms
}

/** Maximum messages retained in the store. */
const DEFAULT_MAX_MESSAGES = 100;

/** Reorder buffer window in ms (section 5.4: 200-500ms). */
const REORDER_WINDOW_MS = 250;

/** Bounded LRU for recent message IDs to dedup reconnect/snapshot duplicates. */
const DEDUP_CACHE_SIZE = 5000;

/** How long to remember a deletion to suppress late duplicates (ms). */
const DELETION_MEMORY_MS = 30_000;

export class ChatAggregator {
  private twitchAdapter: TwitchAdapter | null = null;
  private streamplaceAdapter: StreamplaceAdapter | null = null;

  private messages: Map<string, StoredMessage> = new Map();
  private messageOrder: string[] = []; // IDs in insertion order

  private dedupCache: Map<string, number> = new Map(); // id → receivedAt
  private deletedIds: Map<string, number> = new Map(); // id → deletion time

  private reorderBuffer: ChatEvent[] = [];
  private reorderTimer: ReturnType<typeof setTimeout> | null = null;

  private currentPin: NormalizedMessage | null = null;

  private maxMessages: number;
  private config: SourceConfig;
  private callbacks: AggregatorCallbacks;

  constructor(
    config: SourceConfig,
    callbacks: AggregatorCallbacks,
    maxMessages: number = DEFAULT_MAX_MESSAGES
  ) {
    this.config = config;
    this.callbacks = callbacks;
    this.maxMessages = maxMessages;
  }

  start(): void {
    // Connect Twitch adapter if a channel is configured
    if (this.config.twitch) {
      this.twitchAdapter = new TwitchAdapter({
        channel: this.config.twitch,
        onEvent: (events) => this.handleEvents(events),
        onStatus: (state, detail) =>
          this.callbacks.onSourceStatus("twitch", state, detail),
      });
      this.twitchAdapter.connect();
    }

    // Connect Streamplace adapter if a stream is configured
    if (this.config.streamplace) {
      this.streamplaceAdapter = new StreamplaceAdapter({
        stream: this.config.streamplace,
        baseUrl: this.config.streamplaceBaseUrl,
        onEvent: (events) => this.handleEvents(events),
        onStatus: (state, detail) =>
          this.callbacks.onSourceStatus("streamplace", state, detail),
      });
      this.streamplaceAdapter.connect();
    }
  }

  dispose(): void {
    if (this.reorderTimer) {
      clearTimeout(this.reorderTimer);
      this.reorderTimer = null;
    }
    this.twitchAdapter?.dispose();
    this.streamplaceAdapter?.dispose();
    this.twitchAdapter = null;
    this.streamplaceAdapter = null;
  }

  // -------------------------------------------------------------------------
  // Event intake with reorder buffer
  // -------------------------------------------------------------------------

  private handleEvents(events: ChatEvent[]): void {
    this.reorderBuffer.push(...events);

    if (this.reorderTimer) {
      clearTimeout(this.reorderTimer);
    }

    this.reorderTimer = setTimeout(() => {
      this.flushReorderBuffer();
    }, REORDER_WINDOW_MS);
  }

  private flushReorderBuffer(): void {
    const events = this.reorderBuffer;
    this.reorderBuffer = [];
    this.reorderTimer = null;

    // Prune expired deletion memory
    this.pruneDeletionMemory();

    for (const event of events) {
      this.processEvent(event);
    }

    // Notify renderer of current state
    this.callbacks.onMessages(this.getOrderedMessages());

    // Update pin if changed
    // (pin events are processed in processEvent, which sets this.currentPin)
  }

  // -------------------------------------------------------------------------
  // Event processing
  // -------------------------------------------------------------------------

  private processEvent(event: ChatEvent): void {
    switch (event.kind) {
      case "message":
        this.handleMessage(event);
        break;
      case "delete-message":
        this.handleDeleteMessage(event);
        break;
      case "clear-user":
        this.handleClearUser(event);
        break;
      case "clear-channel":
        this.handleClearChannel(event);
        break;
      case "pin":
        this.handlePin(event);
        break;
      case "unpin":
        this.handleUnpin();
        break;
      case "source-status":
        // Status is handled directly by adapter callbacks
        break;
    }
  }

  private handleMessage(event: Extract<ChatEvent, { kind: "message" }>): void {
    // Check if this message was recently deleted — suppress late duplicates
    if (this.deletedIds.has(event.id)) {
      return;
    }

    // Dedup: if we already have this message, optionally merge richer metadata
    const existing = this.messages.get(event.id);
    if (existing) {
      // Merge: update author/badges/reply if the new version is richer
      const merged = this.mergeMessage(existing.msg, event);
      this.messages.set(event.id, {
        msg: merged,
        receivedAt: existing.receivedAt,
      });
      return;
    }

    // Add to dedup cache
    this.dedupCache.set(event.id, Date.now());
    this.pruneDedupCache();

    // Add to store
    const receivedAtMs = event.receivedAt
      ? new Date(event.receivedAt).getTime()
      : Date.now();

    this.messages.set(event.id, { msg: this.eventToMessage(event), receivedAt: receivedAtMs });
    this.messageOrder.push(event.id);

    // Enforce max messages bound
    this.enforceMaxMessages();
  }

  private handleDeleteMessage(
    event: Extract<ChatEvent, { kind: "delete-message" }>
  ): void {
    // Remove from store
    this.messages.delete(event.targetId);
    this.messageOrder = this.messageOrder.filter((id) => id !== event.targetId);

    // Remember deletion to suppress late duplicates
    this.deletedIds.set(event.targetId, Date.now());
  }

  private handleClearUser(
    event: Extract<ChatEvent, { kind: "clear-user" }>
  ): void {
    // Remove all messages from this user
    const toRemove: string[] = [];
    for (const [id, stored] of this.messages) {
      if (stored.msg.author.userId === event.userId) {
        toRemove.push(id);
        this.deletedIds.set(id, Date.now());
      }
    }
    for (const id of toRemove) {
      this.messages.delete(id);
    }
    this.messageOrder = this.messageOrder.filter((id) => !toRemove.includes(id));
  }

  private handleClearChannel(
    event: Extract<ChatEvent, { kind: "clear-channel" }>
  ): void {
    // Remove all messages for this channel
    const toRemove: string[] = [];
    for (const [id, stored] of this.messages) {
      if (stored.msg.channel === event.channel) {
        toRemove.push(id);
      }
    }
    for (const id of toRemove) {
      this.messages.delete(id);
      this.deletedIds.set(id, Date.now());
    }
    this.messageOrder = this.messageOrder.filter((id) => !toRemove.includes(id));
  }

  private handlePin(event: Extract<ChatEvent, { kind: "pin" }>): void {
    if (event.message) {
      this.currentPin = event.message;
      this.callbacks.onPin(this.currentPin);
    }
  }

  private handleUnpin(): void {
    this.currentPin = null;
    this.callbacks.onPin(null);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private eventToMessage(
    event: Extract<ChatEvent, { kind: "message" }>
  ): NormalizedMessage {
    return {
      id: event.id,
      platform: event.platform,
      channel: event.channel,
      author: event.author,
      fragments: event.fragments,
      plainText: event.plainText,
      ...(event.reply ? { reply: event.reply } : {}),
      ...(event.badges ? { badges: event.badges } : {}),
    };
  }

  private mergeMessage(
    existing: NormalizedMessage,
    incoming: Extract<ChatEvent, { kind: "message" }>
  ): NormalizedMessage {
    // Keep existing, but enrich with incoming fields if they're richer
    return {
      ...existing,
      // Prefer incoming author if it has color/displayName that existing lacks
      author: {
        ...existing.author,
        ...incoming.author,
        color: incoming.author.color ?? existing.author.color,
        displayName:
          incoming.author.displayName ?? existing.author.displayName,
      },
      // Prefer incoming badges if present
      ...(incoming.badges ? { badges: incoming.badges } : {}),
      // Prefer incoming reply if present and existing lacks it
      ...(incoming.reply && !existing.reply
        ? { reply: incoming.reply }
        : {}),
      // Prefer incoming fragments if they seem richer (emotes vs text-only)
      fragments:
        incoming.fragments.length >= existing.fragments.length
          ? incoming.fragments
          : existing.fragments,
    };
  }

  private getOrderedMessages(): NormalizedMessage[] {
    return this.messageOrder.map((id) => this.messages.get(id)?.msg).filter(
      Boolean
    ) as NormalizedMessage[];
  }

  private enforceMaxMessages(): void {
    while (this.messageOrder.length > this.maxMessages) {
      const oldestId = this.messageOrder.shift();
      if (oldestId) {
        this.messages.delete(oldestId);
      }
    }
  }

  private pruneDedupCache(): void {
    if (this.dedupCache.size <= DEDUP_CACHE_SIZE) return;
    // Remove oldest entries
    const sorted = [...this.dedupCache.entries()].sort(
      (a, b) => a[1] - b[1]
    );
    const toRemove = sorted.length - DEDUP_CACHE_SIZE;
    for (let i = 0; i < toRemove; i++) {
      this.dedupCache.delete(sorted[i][0]);
    }
  }

  private pruneDeletionMemory(): void {
    const now = Date.now();
    for (const [id, time] of this.deletedIds) {
      if (now - time > DELETION_MEMORY_MS) {
        this.deletedIds.delete(id);
      }
    }
  }
}
