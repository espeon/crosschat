/**
 * Streamplace WebSocket fixture payloads.
 *
 * Each fixture is a raw JSON object as Streamplace would send over its
 * /api/websocket/{stream} connection, paired with the expected normalized
 * ChatEvent output.
 *
 * The wire sends each selected object directly as a top-level $type-
 * discriminated JSON object (section 4.4).
 */

import type { ChatEvent } from "../types/chat";

export interface StreamplaceFixture {
  name: string;
  /** Raw JSON object as received over WebSocket. */
  raw: object;
  /** Expected normalized ChatEvent(s). */
  expected: ChatEvent[];
  /**
   * If true, this fixture is part of the initial burst and the adapter
   * should mark resulting message events as historical.
   */
  historical?: boolean;
}

const BASE_URI =
  "at://did:plc:abcdef123456/place.stream.chat.message/tid-xyz123";
const STREAMER_DID = "did:plc:streamer456";

function spAuthor(did = "did:plc:abcdef123456", handle = "zeu.dev") {
  return { $type: "place.stream.chat.defs#messageAuthor", did, handle };
}

function spMessageView(opts: {
  uri?: string;
  cid?: string;
  did?: string;
  handle?: string;
  text: string;
  createdAt?: string;
  indexedAt?: string;
  streamer?: string;
  deleted?: boolean;
  facets?: unknown[];
  reply?: unknown;
  badges?: unknown[];
}) {
  return {
    $type: "place.stream.chat.defs#messageView",
    uri: opts.uri ?? BASE_URI,
    cid: opts.cid ?? "bafyrexample123",
    author: spAuthor(opts.did, opts.handle),
    record: {
      $type: "place.stream.chat.message",
      text: opts.text,
      createdAt: opts.createdAt ?? "2026-07-16T12:00:00.000Z",
      streamer: opts.streamer ?? STREAMER_DID,
      ...(opts.facets ? { facets: opts.facets } : {}),
      ...(opts.reply ? { reply: opts.reply } : {}),
    },
    indexedAt: opts.indexedAt ?? "2026-07-16T12:00:01.000Z",
    deleted: opts.deleted ?? false,
    badges: opts.badges ?? [],
  };
}

/** Normalized author used across most fixtures. */
const normAuthor = {
  userId: "did:plc:abcdef123456",
  handle: "zeu.dev",
  displayName: "zeu.dev",
};

const spMsgId = (uri = BASE_URI) => `streamplace:${uri}`;

export const streamplaceFixtures: StreamplaceFixture[] = [
  // -------------------------------------------------------------------------
  // Live messageView — basic text message
  // -------------------------------------------------------------------------
  {
    name: "messageview-basic",
    raw: spMessageView({ text: "hello from streamplace" }),
    expected: [
      {
        kind: "message",
        platform: "streamplace",
        channel: STREAMER_DID,
        id: spMsgId(),
        sourceTimestamp: "2026-07-16T12:00:01.000Z",
        receivedAt: "__EXPECT_RECEIVED_AT__",
        historical: false,
        author: normAuthor,
        fragments: [{ type: "text", text: "hello from streamplace" }],
        plainText: "hello from streamplace",
        rawType: "place.stream.chat.defs#messageView",
      },
    ],
  },

  // -------------------------------------------------------------------------
  // messageView with facets (link + mention)
  // -------------------------------------------------------------------------
  {
    name: "messageview-facets",
    raw: spMessageView({
      text: "check out https://example.com and @bob.example",
      facets: [
        {
          index: { byteStart: 10, byteEnd: 29 },
          features: [
            { $type: "app.bsky.richtext.facet#link", uri: "https://example.com" },
          ],
        },
        {
          index: { byteStart: 34, byteEnd: 47 },
          features: [
            { $type: "app.bsky.richtext.facet#mention", did: "did:plc:bob123" },
          ],
        },
      ],
      indexedAt: "2026-07-16T12:00:03.000Z",
    }),
    expected: [
      {
        kind: "message",
        platform: "streamplace",
        channel: STREAMER_DID,
        id: spMsgId(),
        sourceTimestamp: "2026-07-16T12:00:03.000Z",
        receivedAt: "__EXPECT_RECEIVED_AT__",
        historical: false,
        author: normAuthor,
        fragments: [
          { type: "text", text: "check out " },
          { type: "link", text: "https://example.com", url: "https://example.com" },
          { type: "text", text: " and " },
          { type: "mention", text: "@bob.example", userId: "did:plc:bob123", handle: "bob.example" },
          { type: "text", text: "" },
        ],
        plainText: "check out https://example.com and @bob.example",
        rawType: "place.stream.chat.defs#messageView",
      },
    ],
  },

  // -------------------------------------------------------------------------
  // messageView with reply
  // -------------------------------------------------------------------------
  {
    name: "messageview-reply",
    raw: spMessageView({
      text: "a reply",
      reply: {
        root: {
          uri: "at://did:plc:abcdef123456/place.stream.chat.message/root-tid",
          cid: "bafyroot",
        },
        parent: {
          uri: "at://did:plc:bob123/place.stream.chat.message/parent-tid",
          cid: "bafyparent",
        },
      },
      indexedAt: "2026-07-16T12:00:05.000Z",
    }),
    expected: [
      {
        kind: "message",
        platform: "streamplace",
        channel: STREAMER_DID,
        id: spMsgId(),
        sourceTimestamp: "2026-07-16T12:00:05.000Z",
        receivedAt: "__EXPECT_RECEIVED_AT__",
        historical: false,
        author: normAuthor,
        fragments: [{ type: "text", text: "a reply" }],
        plainText: "a reply",
        reply: {
          rootId:
            "streamplace:at://did:plc:abcdef123456/place.stream.chat.message/root-tid",
          parentId:
            "streamplace:at://did:plc:bob123/place.stream.chat.message/parent-tid",
        },
        rawType: "place.stream.chat.defs#messageView",
      },
    ],
  },

  // -------------------------------------------------------------------------
  // messageView deleted=true — delete instruction
  // -------------------------------------------------------------------------
  {
    name: "messageview-deleted",
    raw: spMessageView({
      text: "",
      did: "moderator-did",
      handle: "mod.example",
      deleted: true,
      indexedAt: "2026-07-16T12:00:06.000Z",
    }),
    expected: [
      {
        kind: "delete-message",
        platform: "streamplace",
        channel: STREAMER_DID,
        targetId: spMsgId(),
      },
    ],
  },

  // -------------------------------------------------------------------------
  // chat.gate — hidden message removal
  // -------------------------------------------------------------------------
  {
    name: "chat-gate",
    raw: {
      $type: "place.stream.chat.gate",
      streamer: STREAMER_DID,
      hiddenMessage: spMessageView({ text: "gated message" }),
    },
    expected: [
      {
        kind: "delete-message",
        platform: "streamplace",
        channel: STREAMER_DID,
        targetId: spMsgId(),
      },
    ],
  },

  // -------------------------------------------------------------------------
  // pinnedRecordView — pin a message
  // -------------------------------------------------------------------------
  {
    name: "pinned-record-view",
    raw: {
      $type: "place.stream.chat.defs#pinnedRecordView",
      uri: BASE_URI,
      cid: "bafyrexample111",
      author: spAuthor(),
      record: {
        $type: "place.stream.chat.message",
        text: "important pinned message",
        createdAt: "2026-07-16T12:00:00.000Z",
        streamer: STREAMER_DID,
      },
      indexedAt: "2026-07-16T12:00:08.000Z",
      deleted: false,
      badges: [],
    },
    expected: [
      {
        kind: "pin",
        platform: "streamplace",
        channel: STREAMER_DID,
        pinId: spMsgId(),
        message: {
          id: spMsgId(),
          platform: "streamplace",
          channel: STREAMER_DID,
          author: normAuthor,
          fragments: [{ type: "text", text: "important pinned message" }],
          plainText: "important pinned message",
        },
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Deleted pinned record — unpin
  // -------------------------------------------------------------------------
  {
    name: "deleted-pin-unpin",
    raw: {
      $type: "place.stream.chat.defs#pinnedRecordView",
      uri: BASE_URI,
      cid: "bafyrexample222",
      author: spAuthor("moderator-did", "mod.example"),
      record: {
        $type: "place.stream.chat.message",
        text: "",
        createdAt: "2026-07-16T12:00:00.000Z",
        streamer: "did:plc:streamplace-streamer",
      },
      indexedAt: "2026-07-16T12:00:09.000Z",
      deleted: true,
      badges: [],
    },
    expected: [
      {
        kind: "unpin",
        platform: "streamplace",
        channel: "did:plc:streamplace-streamer",
      },
    ],
  },

  // -------------------------------------------------------------------------
  // blockView — clear user messages
  // -------------------------------------------------------------------------
  {
    name: "block-view",
    raw: {
      $type: "place.stream.defs#blockView",
      streamer: STREAMER_DID,
      subject: "did:plc:blockeduser789",
    },
    expected: [
      {
        kind: "clear-user",
        platform: "streamplace",
        channel: STREAMER_DID,
        userId: "did:plc:blockeduser789",
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Historical message from initial burst
  // -------------------------------------------------------------------------
  {
    name: "messageview-historical",
    historical: true,
    raw: spMessageView({
      uri: "at://did:plc:abcdef123456/place.stream.chat.message/hist-tid",
      cid: "bafyhistexample",
      text: "old message from history",
      createdAt: "2026-07-16T11:00:00.000Z",
      indexedAt: "2026-07-16T11:00:01.000Z",
    }),
    expected: [
      {
        kind: "message",
        platform: "streamplace",
        channel: STREAMER_DID,
        id: spMsgId(
          "at://did:plc:abcdef123456/place.stream.chat.message/hist-tid"
        ),
        sourceTimestamp: "2026-07-16T11:00:01.000Z",
        receivedAt: "__EXPECT_RECEIVED_AT__",
        historical: true,
        author: normAuthor,
        fragments: [{ type: "text", text: "old message from history" }],
        plainText: "old message from history",
        rawType: "place.stream.chat.defs#messageView",
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Unknown $type — should be ignored gracefully
  // -------------------------------------------------------------------------
  {
    name: "unknown-type",
    raw: { $type: "some.unknown.type", foo: "bar" },
    expected: [],
  },

  // -------------------------------------------------------------------------
  // viewerCount — ignored for chat rendering
  // -------------------------------------------------------------------------
  {
    name: "viewer-count",
    raw: {
      $type: "place.stream.livestream#viewerCount",
      streamer: STREAMER_DID,
      count: 42,
    },
    expected: [],
  },

  // -------------------------------------------------------------------------
  // place.stream.error — source error
  // -------------------------------------------------------------------------
  {
    name: "stream-error",
    raw: { $type: "place.stream.error", message: "Internal server error" },
    expected: [],
    // The adapter should emit a source-status event with state "error",
    // but no ChatEvent is produced from the payload itself.
  },
];

/**
 * Sentinel value used in fixtures to indicate that `receivedAt` should be
 * checked for presence but not for exact value, since it is assigned at runtime.
 */
export const RECEIVED_AT_SENTINEL = "__EXPECT_RECEIVED_AT__";
