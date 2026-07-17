/**
 * Twitch IRC fixture lines.
 *
 * Each fixture is a raw IRC line (or set of lines) as Twitch would send over
 * WebSocket, paired with the expected normalized ChatEvent output.
 *
 * One WebSocket frame can contain multiple IRC messages separated by CRLF.
 */

export interface TwitchFixture {
  name: string;
  /** Raw IRC text as received over WebSocket (may contain multiple lines). */
  raw: string;
  /** Expected normalized ChatEvent(s). Empty array for ignorable commands. */
  expected: import("../types/chat").ChatEvent[];
  /** If true, the adapter should send a PONG in response. */
  expectsPong?: boolean;
}

const baseAuthor = {
  userId: "123456789",
  handle: "zeu_dev",
  displayName: "zeu_dev",
  color: "#FF7F50",
};

export const twitchFixtures: TwitchFixture[] = [
  // -------------------------------------------------------------------------
  // Basic PRIVMSG
  // -------------------------------------------------------------------------
  {
    name: "privmsg-basic",
    raw: "@id=abc-123;tmi-sent-ts=1721136000000;user-id=123456789;display-name=zeu_dev;color=#FF7F50;badges=;badge-info=;emotes=;first-msg=0;returning-chatter=0 :zeu_dev!zeu_dev@zeu_dev.tmi.twitch.tv PRIVMSG #zeu_dev :hello world",
    expected: [
      {
        kind: "message",
        platform: "twitch",
        channel: "zeu_dev",
        id: "twitch:zeu_dev:abc-123",
        sourceTimestamp: new Date(1721136000000).toISOString(),
        receivedAt: expectAnyReceivedAt(),
        author: { ...baseAuthor, badges: undefined },
        fragments: [{ type: "text", text: "hello world" }],
        plainText: "hello world",
        rawType: "PRIVMSG",
      },
    ],
  },

  // -------------------------------------------------------------------------
  // PRIVMSG with emotes
  // -------------------------------------------------------------------------
  {
    name: "privmsg-emotes",
    raw: "@id=def-456;tmi-sent-ts=1721136001000;user-id=123456789;display-name=zeu_dev;color=#FF7F50;badges=;badge-info=;emotes=25:0-4;first-msg=0;returning-chatter=0 :zeu_dev!zeu_dev@zeu_dev.tmi.twitch.tv PRIVMSG #zeu_dev :Kappa hello Kappa",
    expected: [
      {
        kind: "message",
        platform: "twitch",
        channel: "zeu_dev",
        id: "twitch:zeu_dev:def-456",
        sourceTimestamp: new Date(1721136001000).toISOString(),
        receivedAt: expectAnyReceivedAt(),
        author: baseAuthor,
        fragments: [
          {
            type: "emote",
            text: "Kappa",
            imageUrl:
              "https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0",
          },
          { type: "text", text: " hello " },
          {
            type: "emote",
            text: "Kappa",
            imageUrl:
              "https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0",
          },
        ],
        plainText: "Kappa hello Kappa",
        rawType: "PRIVMSG",
      },
    ],
  },

  // -------------------------------------------------------------------------
  // PRIVMSG with badges
  // -------------------------------------------------------------------------
  {
    name: "privmsg-badges",
    raw: "@id=ghi-789;tmi-sent-ts=1721136002000;user-id=123456789;display-name=zeu_dev;color=#FF7F50;badges=moderator/1,subscriber/12;badge-info=subscriber/12;emotes=;first-msg=0;returning-chatter=0 :zeu_dev!zeu_dev@zeu_dev.tmi.twitch.tv PRIVMSG #zeu_dev :modded message",
    expected: [
      {
        kind: "message",
        platform: "twitch",
        channel: "zeu_dev",
        id: "twitch:zeu_dev:ghi-789",
        sourceTimestamp: new Date(1721136002000).toISOString(),
        receivedAt: expectAnyReceivedAt(),
        author: baseAuthor,
        fragments: [{ type: "text", text: "modded message" }],
        plainText: "modded message",
        badges: [
          {
            id: "moderator/1",
            namespace: "twitch",
            title: "Moderator",
          },
          {
            id: "subscriber/12",
            namespace: "twitch",
            title: "Subscriber",
          },
        ],
        rawType: "PRIVMSG",
      },
    ],
  },

  // -------------------------------------------------------------------------
  // PRIVMSG with reply
  // -------------------------------------------------------------------------
  {
    name: "privmsg-reply",
    raw: "@id=rep-001;tmi-sent-ts=1721136003000;user-id=123456789;display-name=zeu_dev;color=#FF7F50;badges=;badge-info=;emotes=;first-msg=0;returning-chatter=0;reply-parent-msg-id=parent-001;reply-parent-user-id=987654321;reply-parent-display-name=other_user;reply-parent-msg-body=original message :zeu_dev!zeu_dev@zeu_dev.tmi.twitch.tv PRIVMSG #zeu_dev :@other_user reply text",
    expected: [
      {
        kind: "message",
        platform: "twitch",
        channel: "zeu_dev",
        id: "twitch:zeu_dev:rep-001",
        sourceTimestamp: new Date(1721136003000).toISOString(),
        receivedAt: expectAnyReceivedAt(),
        author: baseAuthor,
        fragments: [{ type: "text", text: "@other_user reply text" }],
        plainText: "@other_user reply text",
        reply: {
          rootId: "twitch:zeu_dev:parent-001",
          parentId: "twitch:zeu_dev:parent-001",
          parentAuthor: "other_user",
          parentText: "original message",
        },
        rawType: "PRIVMSG",
      },
    ],
  },

  // -------------------------------------------------------------------------
  // CLEARMSG — single message deletion
  // -------------------------------------------------------------------------
  {
    name: "clearmsg",
    raw: "@login=zeu_dev;target-msg-id=abc-123 :tmi.twitch.tv CLEARMSG #zeu_dev :hello world",
    expected: [
      {
        kind: "delete-message",
        platform: "twitch",
        channel: "zeu_dev",
        targetId: "twitch:zeu_dev:abc-123",
      },
    ],
  },

  // -------------------------------------------------------------------------
  // CLEARCHAT — clear entire channel
  // -------------------------------------------------------------------------
  {
    name: "clearchat-channel",
    raw: ":tmi.twitch.tv CLEARCHAT #zeu_dev",
    expected: [
      {
        kind: "clear-channel",
        platform: "twitch",
        channel: "zeu_dev",
      },
    ],
  },

  // -------------------------------------------------------------------------
  // CLEARCHAT — timeout/ban a specific user
  // -------------------------------------------------------------------------
  {
    name: "clearchat-user",
    raw: "@ban-duration=600;target-user-id=123456789 :tmi.twitch.tv CLEARCHAT #zeu_dev :zeu_dev",
    expected: [
      {
        kind: "clear-user",
        platform: "twitch",
        channel: "zeu_dev",
        userId: "123456789",
      },
    ],
  },

  // -------------------------------------------------------------------------
  // PING — adapter should respond with PONG
  // -------------------------------------------------------------------------
  {
    name: "ping",
    raw: "PING :tmi.twitch.tv",
    expected: [],
    expectsPong: true,
  },

  // -------------------------------------------------------------------------
  // Multi-line frame (two IRC messages in one WebSocket frame)
  // -------------------------------------------------------------------------
  {
    name: "multiline-frame",
    raw: "@id=msg-a;tmi-sent-ts=1721136004000;user-id=111;display-name=user_a;color=;badges=;badge-info=;emotes=;first-msg=0;returning-chatter=0 :user_a!user_a@user_a.tmi.twitch.tv PRIVMSG #zeu_dev :first\r\n@id=msg-b;tmi-sent-ts=1721136005000;user-id=222;display-name=user_b;color=;badges=;badge-info=;emotes=;first-msg=0;returning-chatter=0 :user_b!user_b@user_b.tmi.twitch.tv PRIVMSG #zeu_dev :second",
    expected: [
      {
        kind: "message",
        platform: "twitch",
        channel: "zeu_dev",
        id: "twitch:zeu_dev:msg-a",
        sourceTimestamp: new Date(1721136004000).toISOString(),
        receivedAt: expectAnyReceivedAt(),
        author: {
          userId: "111",
          handle: "user_a",
          displayName: "user_a",
          color: undefined,
        },
        fragments: [{ type: "text", text: "first" }],
        plainText: "first",
        rawType: "PRIVMSG",
      },
      {
        kind: "message",
        channel: "zeu_dev",
        id: "twitch:zeu_dev:msg-b",
        platform: "twitch",
        sourceTimestamp: new Date(1721136005000).toISOString(),
        receivedAt: expectAnyReceivedAt(),
        author: {
          userId: "222",
          handle: "user_b",
          displayName: "user_b",
          color: undefined,
        },
        fragments: [{ type: "text", text: "second" }],
        plainText: "second",
        rawType: "PRIVMSG",
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Unknown command — should be ignored gracefully
  // -------------------------------------------------------------------------
  {
    name: "unknown-command",
    raw: "@some-unknown-tag=value :tmi.twitch.tv UNKNOWNCOMMAND #zeu_dev :payload",
    expected: [],
  },

  // -------------------------------------------------------------------------
  // Malformed tags — should not crash, message still parsed
  // -------------------------------------------------------------------------
  {
    name: "malformed-tags",
    raw: "@id=malf-001;tmi-sent-ts=1721136006000;user-id=123456789;display-name=zeu_dev;color=#FF7F50;badges=;badge-info=;emotes=;;; :zeu_dev!zeu_dev@zeu_dev.tmi.twitch.tv PRIVMSG #zeu_dev :survives malformed tags",
    expected: [
      {
        key: "ignore-partial-expected",
      },
    ] as any,
    // This fixture tests that the parser doesn't crash on malformed input.
    // We verify only that a message event is produced, not exact fragments.
  },
];

// Helper for expected events: receivedAt is assigned at runtime, so fixtures
// use this sentinel. The test harness replaces it.
function expectAnyReceivedAt(): string {
  return "__EXPECT_RECEIVED_AT__";
}

/**
 * Sentinel value used in fixtures to indicate that the `receivedAt` field
 * should be checked for presence but not for an exact value, since it is
 * assigned by the normalizer at runtime.
 */
export const RECEIVED_AT_SENTINEL = "__EXPECT_RECEIVED_AT__";
