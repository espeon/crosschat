/**
 * Streamplace payload normalizer.
 *
 * Pure functions that convert a raw Streamplace JSON object (as received
 * over /api/websocket) into normalized ChatEvent(s).
 *
 * Separated from the WebSocket adapter for unit testing with fixtures.
 */

import type {
  ChatEvent,
  ChatFragment,
  ChatAuthor,
  Badge,
  NormalizedMessage,
} from "../types/chat";
import { streamplaceMessageKey } from "../types/chat";

// ---------------------------------------------------------------------------
// Type definitions for known Streamplace payloads
// ---------------------------------------------------------------------------

interface SpMessageAuthor {
  $type?: string;
  did: string;
  handle: string;
}

interface SpBadgeView {
  $type?: string;
  badgeType: string;
  issuer: string;
  recipient?: string;
  name?: string;
  description?: string;
  imageUrl?: string;
}

interface SpMessageView {
  $type: "place.stream.chat.defs#messageView";
  uri: string;
  cid: string;
  author: SpMessageAuthor;
  record: {
    $type: string;
    text: string;
    createdAt: string;
    streamer: string;
    facets?: SpFacet[];
    reply?: SpReplyRef;
  };
  indexedAt: string;
  chatProfile?: {
    name?: string;
    color?: { red: number; green: number; blue: number };
    badges?: SpBadgeView[];
  };
  replyTo?: SpMessageView;
  deleted?: boolean;
  badges?: SpBadgeView[];
}

interface SpFacet {
  index: { byteStart: number; byteEnd: number };
  features: SpFacetFeature[];
}

type SpFacetFeature =
  | { $type: "app.bsky.richtext.facet#link"; uri: string }
  | { $type: "app.bsky.richtext.facet#mention"; did: string };

interface SpReplyRef {
  root: { uri: string; cid: string };
  parent: { uri: string; cid: string };
}

interface SpPinnedRecordView {
  $type: "place.stream.chat.defs#pinnedRecordView";
  uri: string;
  cid: string;
  author: SpMessageAuthor;
  record: SpMessageView["record"];
  indexedAt: string;
  deleted?: boolean;
  badges?: SpBadgeView[];
}

interface SpGate {
  $type: "place.stream.chat.gate";
  streamer: string;
  hiddenMessage: SpMessageView;
}

interface SpBlockView {
  $type: "place.stream.defs#blockView";
  streamer: string;
  subject: string;
}

// ---------------------------------------------------------------------------
// Fragment conversion from AT Protocol facets
// ---------------------------------------------------------------------------

/**
 * Convert Streamplace message text + facets into ordered ChatFragment[].
 *
 * Facet byte offsets are into the UTF-8 encoded text, not UTF-16. We use
 * TextEncoder/TextDecoder to correctly map byte offsets to string positions.
 */
export function buildStreamplaceFragments(
  text: string,
  facets?: SpFacet[]
): ChatFragment[] {
  if (!facets || facets.length === 0) {
    return text ? [{ type: "text", text }] : [];
  }

  // Sort facets by byteStart
  const sorted = [...facets].sort(
    (a, b) => a.index.byteStart - b.index.byteStart
  );

  // Convert byte offsets to character offsets using UTF-8 encoding
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  const decoder = new TextDecoder();

  const fragments: ChatFragment[] = [];
  let byteCursor = 0;

  for (const facet of sorted) {
    // Text before this facet
    if (facet.index.byteStart > byteCursor) {
      const slice = bytes.slice(byteCursor, facet.index.byteStart);
      const textBefore = decoder.decode(slice);
      fragments.push({ type: "text", text: textBefore });
    }

    // The facet text itself
    const facetSlice = bytes.slice(
      facet.index.byteStart,
      facet.index.byteEnd
    );
    const facetText = decoder.decode(facetSlice);

    // Determine fragment type from features (use first feature)
    const feature = facet.features[0];
    if (!feature) {
      fragments.push({ type: "text", text: facetText });
    } else if (feature.$type === "app.bsky.richtext.facet#link") {
      fragments.push({
        type: "link",
        text: facetText,
        url: feature.uri,
      });
    } else if (feature.$type === "app.bsky.richtext.facet#mention") {
      fragments.push({
        type: "mention",
        text: facetText,
        userId: feature.did,
        handle: facetText.replace(/^@/, ""),
      });
    } else {
      fragments.push({ type: "text", text: facetText });
    }

    byteCursor = facet.index.byteEnd;
  }

  // Trailing text
  if (byteCursor < bytes.length) {
    const slice = bytes.slice(byteCursor);
    fragments.push({ type: "text", text: decoder.decode(slice) });
  }

  return fragments;
}

// ---------------------------------------------------------------------------
// Author normalization
// ---------------------------------------------------------------------------

function normalizeAuthor(view: SpMessageView): ChatAuthor {
  const colorObj = view.chatProfile?.color;
  const color = colorObj
    ? "#" + [colorObj.red, colorObj.green, colorObj.blue]
        .map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0"))
        .join("")
    : undefined;

  return {
    userId: view.author.did,
    handle: view.author.handle,
    displayName: view.chatProfile?.name ?? view.author.handle,
    ...(color ? { color } : {}),
  };
}

// ---------------------------------------------------------------------------
// Badge normalization
// ---------------------------------------------------------------------------

function normalizeBadges(view: SpMessageView): Badge[] | undefined {
  const rawBadges = view.badges ?? view.chatProfile?.badges;
  if (!rawBadges || rawBadges.length === 0) return undefined;

  const badges: Badge[] = [];
  for (const b of rawBadges) {
    if (!b || typeof b !== "object") continue;
    const bv = b as SpBadgeView;
    if (!bv.badgeType) continue;

    badges.push({
      id: bv.issuer + ":" + bv.badgeType,
      namespace: "streamplace",
      title: bv.name ?? bv.description ?? bv.badgeType,
      ...(bv.imageUrl ? { imageUrl: bv.imageUrl } : {}),
    });
  }

  return badges.length > 0 ? badges : undefined;
}

// ---------------------------------------------------------------------------
// NormalizedMessage from a messageView
// ---------------------------------------------------------------------------

function messageViewToNormalized(view: SpMessageView): NormalizedMessage {
  const id = streamplaceMessageKey(view.uri);
  const author = normalizeAuthor(view);
  const fragments = buildStreamplaceFragments(
    view.record.text,
    view.record.facets
  );
  const plainText = view.record.text;
  const badges = normalizeBadges(view);

  let reply: NormalizedMessage["reply"];
  if (view.record.reply) {
    reply = {
      rootId: streamplaceMessageKey(view.record.reply.root.uri),
      parentId: streamplaceMessageKey(view.record.reply.parent.uri),
    };
  }

  return {
    id,
    platform: "streamplace",
    channel: view.record.streamer,
    author,
    fragments,
    plainText,
    ...(reply ? { reply } : {}),
    ...(badges ? { badges } : {}),
  };
}

// ---------------------------------------------------------------------------
// Main normalization entry point
// ---------------------------------------------------------------------------

/**
 * Normalize a raw Streamplace JSON payload into zero or more ChatEvents.
 *
 * @param payload  Raw JSON object from the WebSocket
 * @param historical  True if this is part of the initial burst
 */
export function normalizeStreamplacePayload(
  payload: unknown,
  historical: boolean = false
): ChatEvent[] {
  if (!payload || typeof payload !== "object") return [];
  const obj = payload as Record<string, unknown>;
  const $type = obj.$type as string | undefined;

  if (!$type) return [];

  const receivedAt = new Date().toISOString();

  switch ($type) {
    case "place.stream.chat.defs#messageView": {
      const view = obj as unknown as SpMessageView;

      // Deleted message view = delete instruction
      if (view.deleted) {
        return [
          {
            kind: "delete-message",
            platform: "streamplace",
            channel: view.record.streamer,
            targetId: streamplaceMessageKey(view.uri),
          },
        ];
      }

      const msg = messageViewToNormalized(view);
      return [
        {
          kind: "message",
          platform: "streamplace",
          channel: msg.channel,
          id: msg.id,
          sourceTimestamp: view.indexedAt,
          receivedAt,
          historical,
          author: msg.author,
          fragments: msg.fragments,
          plainText: msg.plainText,
          ...(msg.reply ? { reply: msg.reply } : {}),
          ...(msg.badges ? { badges: msg.badges } : {}),
          rawType: $type,
        },
      ];
    }

    case "place.stream.chat.gate": {
      const gate = obj as unknown as SpGate;
      if (!gate.hiddenMessage) return [];
      return [
        {
          kind: "delete-message",
          platform: "streamplace",
          channel: gate.streamer,
          targetId: streamplaceMessageKey(gate.hiddenMessage.uri),
        },
      ];
    }

    case "place.stream.defs#blockView": {
      const block = obj as unknown as SpBlockView;
      return [
        {
          kind: "clear-user",
          platform: "streamplace",
          channel: block.streamer,
          userId: block.subject,
        },
      ];
    }

    case "place.stream.chat.defs#pinnedRecordView": {
      const pin = obj as unknown as SpPinnedRecordView;

      // Deleted pin = unpin
      if (pin.deleted) {
        return [
          {
            kind: "unpin",
            platform: "streamplace",
            channel: pin.record.streamer,
          },
        ];
      }

      // Build a normalized message for the pinned content
      const viewLike: SpMessageView = {
        $type: "place.stream.chat.defs#messageView",
        uri: pin.uri,
        cid: pin.cid,
        author: pin.author,
        record: pin.record,
        indexedAt: pin.indexedAt,
        deleted: false,
        badges: pin.badges ?? [],
      };
      const msg = messageViewToNormalized(viewLike);

      return [
        {
          kind: "pin",
          platform: "streamplace",
          channel: msg.channel,
          pinId: msg.id,
          message: msg,
        },
      ];
    }

    // Ignored payloads for the MVP renderer:
    //   place.stream.livestream#viewerCount
    //   place.stream.livestream#livestreamView
    //   place.stream.livestream#teleport
    //   app.bsky.actor.defs#profileViewBasic
    //   place.stream.error (handled by adapter for status, not normalized)
    //   segments, renditions
    default:
      return [];
  }
}
