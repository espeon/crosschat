/**
 * Parse and validate query parameters for the /chat overlay route.
 * (Section 1.1 of the plan)
 */

import type { ChatQueryParams } from "../types/chat";
import { DEFAULT_QUERY_PARAMS } from "../types/chat";

// Valid Twitch login character set: [a-zA-Z0-9_]{4,25}
const TWITCH_LOGIN_RE = /^[a-z0-9_]{4,25}$/i;

export interface ParsedChatParams extends Required<Omit<ChatQueryParams, "streamplace" | "twitch" | "hideAfter">> {
  streamplace?: string;
  twitch?: string;
  hideAfter?: number;
  debug: boolean;
}

export function parseChatParams(search: string): ParsedChatParams {
  const params = new URLSearchParams(search);

  const streamplace = params.get("streamplace") || undefined;
  const twitch = params.get("twitch") || undefined;

  // Validate Twitch login
  let validatedTwitch = twitch;
  if (twitch && !TWITCH_LOGIN_RE.test(twitch)) {
    validatedTwitch = undefined;
  }

  // Validate Streamplace handle — basic non-empty check
  const validatedStreamplace = streamplace || undefined;

  const layout = params.get("layout") === "columns" ? "columns" : "merged";
  const direction = params.get("direction") === "up" ? "up" : "down";

  const hideAfterRaw = params.get("hideAfter");
  const hideAfter = hideAfterRaw ? parseFloat(hideAfterRaw) : undefined;

  const maxRaw = params.get("max");
  const max = maxRaw ? Math.max(10, Math.min(500, parseInt(maxRaw, 10))) : DEFAULT_QUERY_PARAMS.max;

  const themeRaw = params.get("theme");
  const theme =
    themeRaw === "dark" ? "dark" : themeRaw === "light" ? "light" : "transparent";

  const fontSizeRaw = params.get("fontSize");
  const fontSize = fontSizeRaw
    ? Math.max(10, Math.min(32, parseFloat(fontSizeRaw)))
    : DEFAULT_QUERY_PARAMS.fontSize;

  const showPlatform = params.get("showPlatform") !== "false";
  const showBadges = params.get("showBadges") !== "false";
  const debug = params.get("debug") === "true";

  return {
    streamplace: validatedStreamplace,
    twitch: validatedTwitch,
    layout,
    direction,
    hideAfter,
    max,
    theme,
    fontSize,
    showPlatform,
    showBadges,
    debug,
  };
}
