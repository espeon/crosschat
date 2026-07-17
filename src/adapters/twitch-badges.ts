/**
 * Twitch badge resolver.
 *
 * Twitch IRC sends badges as "set/version" pairs (e.g. "moderator/1").
 * To get image URLs we fetch the Twitch badges API which maps set/version
 * to a UUID, then construct the image URL:
 *   https://static-cdn.jtvnw.net/badges/v1/{uuid}/1
 *
 * Two endpoints:
 *   Global:  https://badges.twitch.tv/v1/badges/global/display
 *   Channel: https://badges.twitch.tv/v1/badges/channels/{channelId}/display
 *
 * Channel badges override global badges with the same set name.
 */

import type { Badge } from "../types/chat";

interface TwitchBadgeSet {
  versions: Record<string, {
    image_url_1x: string;
    image_url_2x: string;
    image_url_4x: string;
    title?: string;
    description?: string;
  }>;
}

interface TwitchBadgesResponse {
  badge_sets: Record<string, TwitchBadgeSet>;
}

export class TwitchBadgeResolver {
  private badgeSets: Record<string, Record<string, { imageUrl: string; title?: string }>> = {};
  private channelBadgeSets: Record<string, Record<string, { imageUrl: string; title?: string }>> = {};
  private fetched = false;
  private fetching: Promise<void> | null = null;

  /**
   * Fetch global badges (and optionally channel badges) from the Twitch API.
   * Safe to call multiple times — returns cached result after first fetch.
   */
  async fetch(channelId?: string): Promise<void> {
    if (this.fetched) return;
    if (this.fetching) return this.fetching;

    this.fetching = this.doFetch(channelId);
    try {
      await this.fetching;
    } finally {
      this.fetching = null;
    }
  }

  private async doFetch(channelId?: string): Promise<void> {
    // Fetch global badges
    try {
      const resp = await fetch("https://badges.twitch.tv/v1/badges/global/display");
      if (resp.ok) {
        const data = (await resp.json()) as TwitchBadgesResponse;
        this.badgeSets = this.parseBadgeSets(data);
      }
    } catch {
      // Network error — badges will fall back to text
    }

    // Fetch channel badges if we have a channel ID
    if (channelId) {
      try {
        const resp = await fetch(
          "https://badges.twitch.tv/v1/badges/channels/" + channelId + "/display"
        );
        if (resp.ok) {
          const data = (await resp.json()) as TwitchBadgesResponse;
          this.channelBadgeSets = this.parseBadgeSets(data);
        }
      } catch {
        // Channel badges are optional — fall back to global only
      }
    }

    this.fetched = true;
  }

  private parseBadgeSets(data: TwitchBadgesResponse): Record<string, Record<string, { imageUrl: string; title?: string }>> {
    const result: Record<string, Record<string, { imageUrl: string; title?: string }>> = {};
    for (const [setName, setData] of Object.entries(data.badge_sets)) {
      result[setName] = {};
      for (const [version, versionData] of Object.entries(setData.versions)) {
        result[setName][version] = {
          imageUrl: versionData.image_url_1x,
          title: versionData.title,
        };
      }
    }
    return result;
  }

  /**
   * Resolve a Twitch badge "set/version" string to a Badge with imageUrl.
   * Returns undefined if the badge set isn't known yet.
   */
  resolve(badgeId: string): Badge {
    const slashIdx = badgeId.indexOf("/");
    const setName = slashIdx === -1 ? badgeId : badgeId.slice(0, slashIdx);
    const version = slashIdx === -1 ? "1" : badgeId.slice(slashIdx + 1);

    // Channel badges override global
    const sets = this.channelBadgeSets[setName] ?? this.badgeSets[setName];
    if (!sets) {
      return {
        id: badgeId,
        namespace: "twitch",
        title: badgeTitle(setName),
      };
    }

    const resolved = sets[version] ?? sets["1"];
    if (!resolved) {
      return {
        id: badgeId,
        namespace: "twitch",
        title: badgeTitle(setName),
      };
    }

    return {
      id: badgeId,
      namespace: "twitch",
      title: resolved.title ?? badgeTitle(setName),
      imageUrl: resolved.imageUrl,
    };
  }

  /**
   * Resolve an array of badge "set/version" strings.
   */
  resolveAll(badgeIds: string[]): Badge[] {
    return badgeIds.map((id) => this.resolve(id));
  }

  get isReady(): boolean {
    return this.fetched;
  }
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
    predictions: "Predictions",
    bits_leader: "Bits Leader",
    sub_gift_leader: "Sub Gift Leader",
    founder: "Founder",
    hype_train: "Hype Train",
  };
  return titles[badgeId];
}
