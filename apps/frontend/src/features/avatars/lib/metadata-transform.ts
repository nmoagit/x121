/**
 * Metadata transformation utilities.
 *
 * Pure functions that transform bio.json and tov.json source data
 * into the production metadata schema. Ported from the Python
 * batch_fix_metadata.py logic.
 */

/* --------------------------------------------------------------------------
   Emoji removal
   -------------------------------------------------------------------------- */

/** Regex matching common emoji Unicode ranges + variation selectors. */
const EMOJI_RE =
  /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu;

/** Phrases that reference emojis (e.g., "[blushing emoji]"). */
const EMOJI_PHRASE_RE = /\[?[\w\s]*emoji[\w\s]*\]?/gi;

/** Remove emojis and emoji reference phrases from text. */
export function removeEmojis(text: string): string {
  return text.replace(EMOJI_RE, "").replace(EMOJI_PHRASE_RE, "").trim();
}

/* --------------------------------------------------------------------------
   Bio extraction from ToV
   -------------------------------------------------------------------------- */

/**
 * Extract a biography string from a tone-of-voice JSON, replacing
 * `{bot_name}` placeholders with the avatar name.
 */
export function extractBioFromTov(
  tov: Record<string, unknown>,
  name: string,
): string | null {
  const desc =
    (tov.description as string) ??
    (tov.bio as string) ??
    (tov.backstory as string) ??
    null;

  if (!desc) return null;

  const cleaned = removeEmojis(
    desc.replace(/\{bot_name\}/gi, name).replace(/\{user_name\}/gi, "you"),
  );

  return cleaned || null;
}

/* --------------------------------------------------------------------------
   Schema mapping
   -------------------------------------------------------------------------- */

/** Known keys that map directly to top-level fields. */
const TOP_LEVEL_MAP: Record<string, string> = {
  voice_provider: "VoiceProvider",
  VoiceProvider: "VoiceProvider",
  voice_id: "VoiceID",
  VoiceID: "VoiceID",
  bio: "bio",
  biography: "bio",
  description: "bio",
  gender: "gender",
  sexual_orientation: "sexual_orientation",
  orientation: "sexual_orientation",
  age: "age",
  relationship_status: "relationship_status",
  relationship: "relationship_status",
  birthplace: "birthplace",
  birth_place: "birthplace",
  current_job: "current_job",
  job: "current_job",
  occupation: "current_job",
  ethnicity: "ethnicity",
  race: "ethnicity",
};

/** Known keys that map to nested appearance fields. */
const APPEARANCE_MAP: Record<string, string> = {
  hair: "hair",
  hair_color: "hair",
  hair_description: "hair",
  eye_color: "eye_color",
  eyes: "eye_color",
  body_type: "body_type",
  build: "body_type",
  body: "body_type",
};

/** Known keys that map to nested favorites fields. */
const FAVORITES_MAP: Record<string, string> = {
  favorite_color: "color",
  fav_color: "color",
  color: "color",
  favorite_food: "food",
  fav_food: "food",
  food: "food",
  favorite_beverage: "beverage",
  fav_beverage: "beverage",
  beverage: "beverage",
  drink: "beverage",
  favorite_movie: "movie",
  fav_movie: "movie",
  movie: "movie",
  favorite_tv_show: "tv_show",
  fav_tv_show: "tv_show",
  tv_show: "tv_show",
};

/** Known keys that map to nested sexual_preferences fields. */
const SEXUAL_PREFS_MAP: Record<string, string> = {
  positions: "positions",
  preferred_positions: "positions",
  kinks: "kinks",
  fetishes: "kinks",
};

/** Known keys for optional top-level fields. */
const OPTIONAL_MAP: Record<string, string> = {
  hobbies: "hobbies",
  hobby: "hobbies",
  dislikes: "dislikes",
  biggest_dream: "biggest_dream",
  dream: "biggest_dream",
  guilty_pleasure: "guilty_pleasure",
  love_language: "love_language",
  phobia: "phobia",
  fear: "phobia",
  habits: "habits",
  personality: "personality",
  backstory: "backstory",
  interesting_facts: "interesting_facts",
  facts: "interesting_facts",
  personal_experience: "personal_experience",
};

/**
 * Transform a flat bio JSON object into the nested production schema.
 */
export function transformToSchema(
  bio: Record<string, unknown>,
  tovBio: string | null,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const appearance: Record<string, unknown> = {};
  const favorites: Record<string, unknown> = {};
  const sexualPrefs: Record<string, unknown> = {};

  for (const [rawKey, rawValue] of Object.entries(bio)) {
    if (rawValue == null || rawValue === "") continue;

    const value =
      typeof rawValue === "string" ? removeEmojis(rawValue) : rawValue;
    const key = rawKey.toLowerCase().trim();

    // Top-level mapping
    const topKey = TOP_LEVEL_MAP[key];
    if (topKey) {
      result[topKey] = value;
      continue;
    }

    // Appearance mapping
    const appKey = APPEARANCE_MAP[key];
    if (appKey) {
      appearance[appKey] = value;
      continue;
    }

    // Favorites mapping
    const favKey = FAVORITES_MAP[key];
    if (favKey) {
      favorites[favKey] = value;
      continue;
    }

    // Sexual preferences mapping
    const sexKey = SEXUAL_PREFS_MAP[key];
    if (sexKey) {
      sexualPrefs[sexKey] = value;
      continue;
    }

    // Optional fields mapping
    const optKey = OPTIONAL_MAP[key];
    if (optKey) {
      result[optKey] = value;
      continue;
    }

    // Pass through unknown fields as-is
    result[rawKey] = value;
  }

  // Use ToV bio if no bio was found in the source
  if (!result.bio && tovBio) {
    result.bio = tovBio;
  }

  // Only set nested objects if they have content
  if (Object.keys(appearance).length > 0) {
    result.appearance = appearance;
  }
  if (Object.keys(favorites).length > 0) {
    result.favorites = favorites;
  }
  if (Object.keys(sexualPrefs).length > 0) {
    result.sexual_preferences = sexualPrefs;
  }

  return result;
}

/* --------------------------------------------------------------------------
   Orchestrator
   -------------------------------------------------------------------------- */

/**
 * Generate metadata from bio.json and/or tov.json source files.
 *
 * @param bio - Parsed bio.json content (avatar attributes)
 * @param tov - Parsed tov.json content (tone of voice / personality)
 * @param name - Avatar name for placeholder replacement
 * @returns Nested metadata object matching the production schema
 */
export function generateMetadata(
  bio: Record<string, unknown> | null,
  tov: Record<string, unknown> | null,
  name: string,
): Record<string, unknown> {
  const tovBio = tov ? extractBioFromTov(tov, name) : null;
  const source = bio ?? {};

  // If we have ToV data, merge ALL fields into source (not just optional).
  // Skip bio-extraction keys — those are handled by extractBioFromTov
  // which does {bot_name} placeholder replacement.
  if (tov) {
    const tovBioKeys = new Set(["description", "bio", "backstory"]);
    for (const [key, val] of Object.entries(tov)) {
      if (val != null && !source[key] && !tovBioKeys.has(key)) {
        source[key] = val;
      }
    }
  }

  return transformToSchema(source, tovBio);
}
