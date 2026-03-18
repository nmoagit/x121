#!/usr/bin/env python3
"""
Fix malformed metadata JSON files in the bios directory.

Issues addressed:
1. Arrays containing mixed category values (e.g., favorite_color with "food pizza")
2. Trailing commas in keys
3. Split key-values where key ends early and first array item completes it
4. Redundant category prefixes in array values
5. Mega-keys with multiple fields mashed together
"""

import json
import re
import sys
from pathlib import Path
from collections import defaultdict


# ---------------------------------------------------------------------------
# Emoji removal (ported from batch_fix_metadata.py)
# ---------------------------------------------------------------------------

_EMOJI_RE = re.compile(
    "["
    "\U0001F600-\U0001F64F"   # emoticons
    "\U0001F300-\U0001F5FF"   # symbols & pictographs
    "\U0001F680-\U0001F6FF"   # transport & map symbols
    "\U0001F1E0-\U0001F1FF"   # flags
    "\U00002702-\U000027B0"   # dingbats
    "\U000024C2-\U0001F251"   # enclosed characters
    "\U0001F900-\U0001F9FF"   # supplemental symbols
    "\U0001FA00-\U0001FA6F"   # chess symbols
    "\U0001FA70-\U0001FAFF"   # symbols and pictographs extended-a
    "\U00002600-\U000026FF"   # misc symbols
    "\U0001F700-\U0001F77F"   # alchemical symbols
    "]+",
    flags=re.UNICODE,
)


def remove_emojis(text: str) -> str:
    """Remove emojis and emoji-related text from a string."""
    text = _EMOJI_RE.sub("", text)

    # Remove emoji reference phrases and everything after them.
    # Order matters: more specific patterns (with "Her") first, then bare patterns.
    # All patterns include optional leading "and" and "her" to avoid orphaned words.

    # "Her fav/favorite emojis are/is" patterns
    text = re.sub(r",?\s*(?:and\s+)?Her\s+fav\s+emoji[s]?\s*(is|are|:)?.*$", "", text, flags=re.IGNORECASE)
    text = re.sub(r",?\s*(?:and\s+)?Her\s+favorite\s+emoji[s]?\s*(is|are|:)?.*$", "", text, flags=re.IGNORECASE)

    # Bare "Fav/Favorite emoji(s):" patterns (with optional "her" to avoid orphaning)
    text = re.sub(r",?\s*(?:and\s+)?(?:her\s+)?Fav\s+emoji[s]?[:\s].*$", "", text, flags=re.IGNORECASE)
    text = re.sub(r",?\s*(?:and\s+)?(?:her\s+)?Favorite\s+emoji[s]?[:\s].*$", "", text, flags=re.IGNORECASE)

    # Remove standalone "Fav emojis" at end (if emojis were removed leaving just the phrase)
    text = re.sub(r"\s*Fav\s+emoji[s]?\s*$", "", text, flags=re.IGNORECASE)

    # Remove trailing "Her" that might be left over from partial cleanup
    text = re.sub(r"\s+Her\s*$", "", text, flags=re.IGNORECASE)

    # Clean up any trailing whitespace or comma artifacts (preserve periods as valid endings)
    text = text.rstrip(" ,")
    # Remove orphaned conjunction comma before closing quote
    text = re.sub(r""",['"'\u2018\u2019\u201c\u201d]\s*$""", lambda m: m.group(0)[1:], text)
    # Remove variation selectors (U+FE0F) that survive emoji removal
    text = text.replace("\uFE0F", "").strip()

    return text


def _strip_emojis_deep(value):
    """Recursively strip emojis from all string values in a JSON structure."""
    if isinstance(value, str):
        return remove_emojis(value)
    if isinstance(value, list):
        return [_strip_emojis_deep(item) for item in value]
    if isinstance(value, dict):
        return {k: _strip_emojis_deep(v) for k, v in value.items()}
    return value


# Categories that should be extracted from mixed arrays
# These are all "favorites" categories that need the favorite_ prefix
FAVORITE_CATEGORIES = [
    "food", "beverage", "book", "movie", "cartoon", "tvshow", "tv show", "tv_show",
    "singer", "song", "movie genre", "movie_genre", "music genre", "music_genre",
    "celebrity", "pornstar", "flowers", "sports", "sport", "game", "brand",
    "holiday", "travel destination", "travel_destination", "place to go",
    "place_to_go", "animal", "music", "author", "band"
]

# Categories that are NOT favorites (keep original names)
NON_FAVORITE_CATEGORIES = [
    "sex position", "position", "sex toy", "porn genre", "kink", "sex fantasy"
]

# Hair/eye attribute patterns to extract into separate fields
HAIR_ATTRIBUTES = {
    "length": "hair_length",
    "style": "hair_style",
    "signature style": "hair_style",
}

EYE_ATTRIBUTES = {
    "description": "eye_description",
    # Values that are clearly descriptions, not colors
}

# Known hair styles/textures (to detect style without prefix)
KNOWN_HAIR_STYLES = ["straight", "curly", "wavy"]
# Known hair lengths
KNOWN_HAIR_LENGTHS = ["short", "long", "medium"]

# Known eye descriptors (not colors)
KNOWN_EYE_DESCRIPTORS = ["sexy", "sultry", "piercing", "bright", "dark", "deep"]

KNOWN_CATEGORIES = FAVORITE_CATEGORIES + NON_FAVORITE_CATEGORIES


_CATEGORY_ALIASES = {
    "musician": "singer",
}

def parse_category_value(item: str) -> tuple[str | None, str]:
    """
    Parse an item like "food pizza" into ("favorite_food", "pizza").
    Returns (None, item) if no category prefix found.
    Adds 'favorite_' prefix for favorite categories.
    """
    item_lower = item.lower()
    for category in sorted(KNOWN_CATEGORIES, key=len, reverse=True):
        if item_lower.startswith(category + " "):
            value = item[len(category) + 1:].strip()
            # Add favorite_ prefix for favorite categories
            if category in FAVORITE_CATEGORIES:
                return f"favorite_{category}", value
            return category, value
    # Check category aliases (e.g., "musician X" → "singer X")
    for alias, canonical in _CATEGORY_ALIASES.items():
        if item_lower.startswith(alias + " "):
            value = item[len(alias) + 1:].strip()
            if canonical in FAVORITE_CATEGORIES:
                return f"favorite_{canonical}", value
            return canonical, value
    return None, item


def normalize_key(key: str) -> str:
    """Remove trailing commas, normalize underscores and smart quotes."""
    key = key.rstrip(",")
    # Replace multiple underscores with single
    key = re.sub(r"_+", "_", key)
    # Normalize smart quotes to ASCII
    key = key.replace("\u2018", "'").replace("\u2019", "'")  # ' '
    key = key.replace("\u201c", '"').replace("\u201d", '"')  # " "
    return key


# All categories that can appear as key prefixes (for generic matching)
# This includes favorites, non-favorites, and consolidation categories
# Categories that have dedicated consolidation code in fix_json post-processing.
# These must NOT be in ALL_PREFIX_CATEGORIES to avoid early interception.
CONSOLIDATION_CATEGORIES = {"dislikes", "habits", "hobbies", "kink", "kinks", "phobia", "phobias"}

ALL_PREFIX_CATEGORIES = (
    set(FAVORITE_CATEGORIES + NON_FAVORITE_CATEGORIES + [
        "likes",
        "lives", "hometown", "birthplace",
        "masturbation",
    ])
    - CONSOLIDATION_CATEGORIES
)

# Plural-to-singular mappings for category prefix matching
PLURAL_TO_SINGULAR = {
    "movies": "movie",
    "books": "book",
    "singers": "singer",
    "sports": "sports",  # sports stays as-is (it's the canonical form)
    "celebrities": "celebrity",
    "cartoons": "cartoon",
    "holidays": "holiday",
    "brands": "brand",
    "games": "game",
    "pornstars": "pornstar",
    "positions": "position",
}

# Standard field names that should NOT be treated as category_value patterns
# (e.g., "hair_color" is a real field name, not "hair" category with "color" value)
STANDARD_FIELD_NAMES = {
    "hair_color", "hair_length", "hair_style", "hair_texture", "hair_description",
    "eye_color", "eyes_color", "eye_description",
    "body_type", "age", "ethnicity", "personality_traits",
    "height", "personality", "education", "occupation", "residence",
    "birthplace", "siblings", "kids", "pets", "backstory",
    "relationship_status", "current_job", "cup_size", "dress_size",
    "shoe_size", "tv_show", "movie_genre", "music_genre", "book_genre", "travel_destination",
    "place_to_go", "sex_position", "sex_toy", "porn_genre", "sex_fantasy",
    "biggest_dream", "guilty_pleasure", "love_language", "sexual_orientation",
    "interesting_facts", "personal_experience",
}


def _is_gerund(word: str) -> bool:
    """Check if a word looks like a gerund/present participle (ending in -ing, >4 chars)."""
    return len(word) > 4 and word.lower().endswith("ing")


# Minor words that stay lowercase in title case (unless first word)
_TITLE_CASE_MINOR = {
    "a", "an", "the", "and", "but", "or", "nor", "for", "yet", "so",
    "in", "on", "at", "to", "by", "of", "up", "as", "if", "is",
    "with", "from", "into", "than", "vs",
}

# Known acronyms that should always be uppercased
_KNOWN_ACRONYMS = {"gta", "nfl", "nba", "bdsm", "dj", "ufc", "wwe", "rbd", "svj", "pvc", "mma"}

# Known place abbreviations that should be uppercased in location fields
# Note: "la" omitted — it's the Spanish/French article (La Jolla), not LA abbreviation
_KNOWN_PLACE_ABBREVIATIONS = {"ny", "nyc", "dc", "sf", "nj", "uk"}


def normalize_location(text: str) -> str:
    """Uppercase known place abbreviations and handle '/' separators in locations."""
    if not text:
        return text
    # Split on "/" to title-case each location part independently
    if "/" in text:
        parts = text.split("/")
        return "/".join(normalize_location(smart_title_case(p.strip())) for p in parts)
    words = text.split()
    result = []
    for word in words:
        if word.lower() in _KNOWN_PLACE_ABBREVIATIONS:
            result.append(word.upper())
        else:
            result.append(word)
    return " ".join(result)


def smart_title_case(s: str) -> str:
    """
    Title case that keeps minor words (of, by, with, and, etc.) lowercase,
    fixes apostrophe overcapitalization, and preserves all-caps words (acronyms).
    First word is always capitalized.
    """
    words = s.split()
    result = []
    after_open_paren = False
    for i, word in enumerate(words):
        # Track open parenthesis — next word is first of a new clause
        is_first = i == 0 or after_open_paren
        after_open_paren = word.endswith("(") or word == "("
        # Capitalize words that start with punctuation (e.g., "(mark" → "(Mark")
        leading_punct = ""
        bare_word = word
        if word and not word[0].isalpha():
            for j, ch in enumerate(word):
                if ch.isalpha():
                    leading_punct = word[:j]
                    bare_word = word[j:]
                    break
        # Preserve all-caps words (acronyms like BDSM, WWE, GTA)
        if bare_word.isupper() and len(bare_word) > 1:
            result.append(word)
        # Force known acronyms to uppercase
        elif bare_word.lower() in _KNOWN_ACRONYMS:
            result.append(leading_punct + bare_word.upper())
        # First word (or first after open paren) always capitalized
        elif is_first:
            result.append(leading_punct + bare_word.capitalize())
        # Minor words stay lowercase
        elif bare_word.lower() in _TITLE_CASE_MINOR:
            result.append(leading_punct + bare_word.lower())
        else:
            result.append(leading_punct + bare_word.capitalize())
    text = " ".join(result)
    # Fix apostrophe overcapitalization (Bowser'S → Bowser's)
    text = re.sub(r"(\w)(['\u2019])([A-Z])", lambda m: f"{m.group(1)}{m.group(2)}{m.group(3).lower()}", text)
    # Fix Mc/Mac surname prefixes (Mcqueen → McQueen, Macarthur → MacArthur)
    text = re.sub(r"\bMc([a-z])", lambda m: f"Mc{m.group(1).upper()}", text)
    # Mac prefix — only apply when not a common "mac" word
    _mac_not_surnames = {"machine", "macaroni", "macro", "macabre", "mace", "mach", "macho", "mackerel"}
    def _fix_mac(m):
        full_word = m.group(0)
        if full_word.lower() in _mac_not_surnames:
            return full_word
        return f"Mac{m.group(1).upper()}{m.group(2)}"
    text = re.sub(r"\bMac([a-z])([a-z]{2,})", _fix_mac, text)
    return text


def match_category_prefix(key: str) -> tuple[str, str] | None:
    """
    Generic category prefix detection.
    For any key like 'food_xyz', if 'food' is a known category, return (category, 'xyz').
    Handles plural forms (movies_ -> movie category) and trailing commas.

    Returns (base_category, embedded_suffix) or None.
    """
    norm_key = normalize_key(key)  # strips trailing commas
    key_lower = norm_key.lower()

    # Skip standard field names
    if key_lower in STANDARD_FIELD_NAMES:
        return None

    # Try each known category prefix
    for category in sorted(ALL_PREFIX_CATEGORIES, key=len, reverse=True):
        cat_under = category.replace(" ", "_")
        prefix = cat_under + "_"

        if key_lower.startswith(prefix):
            suffix = norm_key[len(prefix):]
            if suffix:  # must have something after the prefix
                return category, suffix.replace("_", " ").strip()

    # Try plural forms: movies_X -> movie category
    for plural, singular in PLURAL_TO_SINGULAR.items():
        prefix = plural + "_"
        if key_lower.startswith(prefix):
            suffix = norm_key[len(prefix):]
            if suffix:
                return singular, suffix.replace("_", " ").strip()

    return None


def extract_key_embedded_value(key: str, value) -> tuple[str, any] | None:
    """
    Extract value embedded in key using generic category prefix matching.
    e.g., "singer_drake,": "Latto" -> "favorite_singer": ["drake", "Latto"]
    e.g., "food_italian": "" -> "favorite_food": "italian"
    e.g., "movie_dirty": "Dancing" -> "favorite_movie": "Dirty Dancing" (joined)
    e.g., "book_none": "" -> "favorite_book": "" (empty, not "none")
    e.g., "game_not": "into gaming" -> "favorite_game": "" (empty, indicates no preference)
    """
    norm_key = normalize_key(key)

    # Special handling for "none" and "not" patterns that indicate no preference
    none_patterns = {
        "none": True,   # X_none -> empty
        "not": True,    # X_not -> empty (e.g., game_not: "into gaming")
    }

    # Try generic category prefix matching
    match = match_category_prefix(key)
    if not match:
        return None

    base_category, embedded = match

    # Determine output key (add favorite_ prefix if applicable)
    if base_category in FAVORITE_CATEGORIES:
        output_key = f"favorite_{base_category}"
    else:
        output_key = base_category

    # Check for "none"/"not" patterns -> empty value
    emb_lower = embedded.lower()
    if emb_lower in ("none", "not specified", "n/a", "irrelevant"):
        return output_key, ""
    if emb_lower == "not":
        no_pref_words = ("into", "specified", "provided", "really", "a ")
        if isinstance(value, str) and any(value.lower().startswith(w) for w in no_pref_words):
            return output_key, ""
        if isinstance(value, list) and value:
            first = value[0] if isinstance(value[0], str) else ""
            if first.lower() in ("specified", "provided", "really", "into gaming"):
                return output_key, ""
    # "celebrity_none" or "brand_not specified" -> empty
    if emb_lower.startswith("none") or emb_lower == "too many":
        return output_key, ""
    # "movie_too: many to list" = no preference
    if emb_lower == "too" and isinstance(value, str) and value.lower().startswith("many"):
        return output_key, ""
    # "game_yes" -> handle specially (means they like games, value has details)
    if emb_lower == "yes" and isinstance(value, str):
        return output_key, value if value else ""
    if emb_lower == "yes" and isinstance(value, list):
        return output_key, value

    # Generic/descriptive embeddings — skip the prefix, use value only
    # (e.g., "sports_plays": ["tennis",...] → use ["tennis",...],
    #  "singer_all": "music" → use "music", "singer_anything": [...] → use [...])
    SKIP_EMBEDDED = {"plays", "all", "anything", "enjoys", "likes"}
    if emb_lower in SKIP_EMBEDDED:
        if isinstance(value, str) and value:
            return output_key, value
        if isinstance(value, list):
            return output_key, value
        return output_key, ""

    # Detect if original key had trailing comma (signals separate items, not compound name)
    has_trailing_comma = key.rstrip().endswith(",")

    # Handle empty value - just use embedded (capitalize for favorites)
    if value == "" or value is None:
        if base_category in FAVORITE_CATEGORIES:
            return output_key, smart_title_case(embedded)
        return output_key, embedded

    # Compound patterns where embedded+value form a single proper name
    # These remain explicit because they require specific joining logic
    compound_patterns = [
        # Movies
        ("dirty", "Dancing"),
        ("kill", "BIll"),
        ("kill", "Bill"),
        ("harry", "Potter"),
        ("ron's", "Gone"),
        ("coming", "to America"),
        ("rush", "Hour"),
        ("texas", "Chainsaw"),
        ("young", "Frankenstein"),
        ("mean", "Girls"),
        ("tombstone", "with"),       # Ryan Connor mega-key
        # Cartoons
        ("looney", "Tunes"),
        ("big", "Mouth"),
        ("regular", "Show"),
        ("adventure", "Time"),
        ("family", "Guy"),
        ("strawberry", "Shortcake"),
        ("ren", "and Stimpy"),
        ("south", "Park"),
        ("tom", "and Jerry"),
        ("the", "Simpsons"),
        # Singers
        ("ariana", "Grande"),
        ("no", "Doubt"),
        ("sada", "Baby"),
        ("motley", "Crue"),
        ("gorgon", "City"),
        ("lil", "Durk"),
        ("lamb", "of God"),
        ("juice", "WRLD"),
        ("michael", "Jackson"),
        ("chris", "Brown"),
        # Celebrities
        ("megan", "Fox"),
        ("kim", "Kardashian"),
        ("henry", "Cavill"),
        ("pamela", "Anderson"),
        ("post", "Malone"),
        ("tom", "Cruise"),
        ("mac", "Miller"),
        ("lana", "Rhoades"),
        # Brands
        ("fashion", "Nova"),
        ("urban", "Outfitters"),
        ("chrome", "Hearts"),
        ("nike", "and"),
        # Games
        ("cult", "of"),
        ("the", "Legend"),
        ("animal", "Crossings"),
        ("mortal", "Kombat"),
        ("world", "of Warcraft"),
        ("super", "Mario"),
        # Beverages/food
        ("sparkling", "water"),
        ("cold", "brew"),
        ("matcha", "tea"),
        ("pornstar", "martini"),
        ("dr.", "Pepper"),
        ("pellegrino", "with"),
        ("tuna", "tataki"),
        ("mac", "and"),            # Mac and Cheese
        # Books
        ("milk", "and"),             # Milk and Honey
        ("edgar", "Allan"),          # Edgar Allan Poe
        # Flowers
        ("tiger", "lilies"),
        ("calla", "lily"),
        ("white", "lilies"),
        ("black", "orchids"),
        ("pink", "roses"),
        ("red", "roses"),
        # Location joins
        ("new", "York"),
        ("los", "Angeles"),
        ("las", "Vegas"),
        ("portland", "OR"),
        ("wales", "UK"),
        ("sherman", "Oaks"),
        # Other compound joins
        ("rainy", "weather"),
        ("math", "problems"),
        ("content", "creation"),
        ("blowjob/deep", "throating"),
        ("your", "Dreams"),
        # Sentence starters (habits, masturbation, etc.)
        ("a", "few"),
        ("two", "times"),
        ("more", "than"),
        ("taking", "on"),
        ("eating", "a"),
        ("i", "don't"),
        ("i'm", "a"),
        ("i", "love"),
    ]

    # Patterns that should be title-cased when joined
    TITLE_CASE_EMBEDDED = {
        "dirty", "looney", "tiger", "calla", "kill", "harry", "big", "ariana",
        "megan", "cult", "the", "mac", "adventure", "family", "strawberry",
        "ren", "south", "tom", "no", "sada", "lil", "lamb", "juice", "michael",
        "chris", "kim", "henry", "pamela", "post", "lana", "fashion", "urban",
        "chrome", "animal", "mortal", "world", "super", "coming", "rush",
        "texas", "young", "regular", "ron's", "gorgon", "motley",
        "milk", "edgar", "mean",
    }

    def _normalize_for_compare(s: str) -> str:
        """Normalize smart quotes for comparison."""
        return s.replace("\u2018", "'").replace("\u2019", "'").replace("\u201c", '"').replace("\u201d", '"')

    def _fix_title_apostrophe(s: str) -> str:
        """Fix Python title() overcapitalizing after apostrophes (Bowser'S → Bowser's)."""
        # Match both ASCII and smart quote apostrophes, preserve which one was used
        return re.sub(r"(\w)(['\u2019])([A-Z])", lambda m: f"{m.group(1)}{m.group(2)}{m.group(3).lower()}", s)

    # Handle string value - check if it should be joined or arrayed
    if isinstance(value, str) and value:
        value_norm = _normalize_for_compare(value.lower())
        for emb_pat, val_pat in compound_patterns:
            if embedded.lower() == emb_pat.lower() and value_norm.startswith(val_pat.lower()):
                joined = f"{embedded} {value}"
                if emb_pat.lower() in TITLE_CASE_EMBEDDED:
                    joined = smart_title_case(joined)
                # Special case: "your Dreams" is a placeholder, return empty
                if emb_pat.lower() == "your" and val_pat.lower() == "dreams":
                    return output_key, ""
                return output_key, joined

        # For location fields, always join instead of making array
        location_fields = ("hometown", "birthplace", "residence", "lives")
        if base_category in location_fields:
            # Birthplace/hometown use comma (city, country), residence uses space (city parts)
            if base_category in ("hometown", "birthplace"):
                joined = f"{embedded}, {value}".strip()
            else:
                joined = f"{embedded} {value}".strip()
            return output_key, joined

        # Articles/numbers always join with value (e.g., "the" + "Dirt" → "The Dirt")
        ARTICLE_EMBEDDINGS = {"the", "a", "an"}
        if emb_lower in ARTICLE_EMBEDDINGS:
            return output_key, smart_title_case(f"{embedded} {value}")
        # Numeric embedded values join (e.g., "48" + "Laws of Power" → "48 Laws of Power")
        if embedded.isdigit():
            return output_key, f"{embedded} {value}"

        # For favorite categories, join embedded+value as a compound name
        # (e.g., "beverage_coke": "Zero" → "Coke Zero", "singer_lana": "Del Rey" → "Lana Del Rey")
        # But if the original key had a trailing comma (e.g., "food_steak,": "Italian"),
        # the comma signals separate items, not a compound name
        if base_category in FAVORITE_CATEGORIES and "," not in embedded and not has_trailing_comma:
            return output_key, smart_title_case(f"{embedded} {value}")

        # Otherwise make it an array (separate items, capitalize embedded from key)
        return output_key, [smart_title_case(embedded), value]

    # Handle list value - check if first element completes embedded
    if isinstance(value, list) and value:
        first_val = value[0] if isinstance(value[0], str) else ""

        # Check compound patterns (same list, used for list values too)
        list_compound_patterns = compound_patterns + [
            # Additional patterns seen only with list values
            ("dirty", "talk"),
            ("foot", "fetish"),
            ("people", "watching"),
            ("sword", "fighting"),
            ("keeping", "a list"),
            ("working", "out"),
            ("good", "work ethic"),
            ("type", "A"),
            ("biting", "my"),
            ("drinking", "coffee"),
            ("doing", "yoga"),
            ("going", "to"),
            ("waking", "up"),
            ("bad", "attitude"),
            ("bad", "jokes"),
            ("bad", "hygiene"),
            ("waiting", "in"),
            ("half-assed", "effort"),
            ("rising", "at"),
            ("eating", "a lot"),
            # Batch3 additional
            ("mindfulness", "meditation"),
            ("slow-burn", "seduction"),
            ("subtle", "dominance"),
            ("verbal", "teasing"),
            ("confident", "assertive"),
            ("cuckold", "fetish"),
        ]

        first_val_norm = _normalize_for_compare(first_val.lower())
        for emb_pat, val_pat in list_compound_patterns:
            if embedded.lower() == emb_pat.lower() and first_val_norm.startswith(val_pat.lower()):
                joined = f"{embedded} {first_val}"
                if emb_pat.lower() in TITLE_CASE_EMBEDDED:
                    joined = smart_title_case(joined)
                # Keep remaining values as-is (no category prefix stripping in
                # single-category arrays - prevents "Animal Crossing" → "Crossing")
                return output_key, [joined] + list(value[1:])

        # Articles/numbers always join with first value for lists too
        ARTICLE_EMBEDDINGS = {"the", "a", "an"}
        if emb_lower in ARTICLE_EMBEDDINGS and first_val:
            joined = smart_title_case(f"{embedded} {first_val}")
            return output_key, [joined] + list(value[1:])
        if embedded.isdigit() and first_val:
            joined = f"{embedded} {first_val}"
            return output_key, [joined] + list(value[1:])

        # For favorite categories without trailing comma, join embedded with first value
        # (e.g., "singer_mr": ["Probz", "Aaliyah"] → ["Mr Probz", "Aaliyah"])
        if base_category in FAVORITE_CATEGORIES and not has_trailing_comma and first_val:
            joined = smart_title_case(f"{embedded} {first_val}")
            return output_key, [joined] + list(value[1:])

        # No compound match - just prepend embedded (capitalized from key) and keep values as-is
        return output_key, [smart_title_case(embedded)] + list(value)

    return output_key, embedded


def fix_split_key_value(key: str, values: list) -> tuple[str, list]:
    """
    Fix cases where key ends early and first array item completes it.
    e.g., "hobbies_working": ["out", ...] -> "hobbies": ["working out", ...]
    """
    if not values:
        return key, values

    # Common patterns where first element should join with key suffix
    split_patterns = [
        # (key_pattern, first_value, new_key, combined_first_value)
        (r"_working$", "out", None, "working out"),
        (r"_keeping$", "a list", None, "keeping a list"),
        (r"_sword$", "fighting", None, "sword fighting"),
        (r"_people$", "watching", None, "people watching"),
        (r"_cold$", "plunges", None, "cold plunges"),
        (r"_taking$", "risks", None, "taking risks"),
        (r"_needy$", "people", None, "needy people"),
        (r"_foot$", "fetish", None, "foot fetish"),
        (r"_dirty$", "talk", None, "dirty talk"),
        (r"_rainy$", "weather", None, "rainy weather"),
        (r"_unfunny$", "people", None, "unfunny people"),
    ]

    first_val = values[0].lower() if values else ""

    for pattern, expected_first, new_key_suffix, combined in split_patterns:
        if re.search(pattern, key, re.IGNORECASE) and first_val == expected_first.lower():
            # Remove the suffix from key and add combined value
            base_key = re.sub(pattern, "", key, flags=re.IGNORECASE)
            new_values = [combined] + values[1:]
            return base_key, new_values

    return key, values


def fix_mega_key(key: str, values: list) -> dict:
    """
    Handle mega-keys like:
    "favorite_color_seafoam_green,_food_sushi,_beverage_monster_rehab,..."

    Also handles physical_features mega-keys with embedded tattoo descriptions:
    "physical_features_sunflower_tattoo,_music_note_tattoos,..."
    """
    result = {}

    # Special handling for physical_features mega-keys (contain tattoo descriptions)
    if key.lower().startswith("physical_features_"):
        # Extract tattoo descriptions from the key
        key_content = key[len("physical_features_"):]
        # Split on comma patterns
        key_parts = re.split(r",_|,\s*", key_content)

        tattoos = []
        other_features = []

        for part in key_parts:
            part = part.strip("_").strip()
            if not part:
                continue
            # Convert underscores to spaces
            desc = part.replace("_", " ")
            # Check if this is a tattoo description
            if "tattoo" in desc.lower():
                tattoos.append(desc)
            elif len(desc) <= 3:
                # Short items like "11" are likely fragments, skip
                continue
            else:
                other_features.append(desc)

        # Add array values as additional tattoos
        for item in values:
            if isinstance(item, str):
                item = item.strip()
                # Clean up items like "and her husband's name tattooed"
                if item.lower().startswith("and "):
                    item = item[4:].strip()
                if not item or len(item) <= 2:
                    continue
                # Check if this is a tattoo description
                if "tattoo" in item.lower():
                    tattoos.append(item)
                else:
                    other_features.append(item)

        if tattoos:
            result["tattoos"] = tattoos
        if other_features:
            result["physical_features"] = other_features
        return result

    # Parse the mega key
    # Pattern: field_value,_field_value,_field_value
    # Or: field_value, field_value
    parts = re.split(r",_|,\s*", key)

    last_key = None
    for part in parts:
        part = part.strip("_").strip()
        if not part:
            continue

        # Try to extract field_value pattern
        # e.g., "favorite_color_seafoam_green" -> "favorite_color": "seafoam green"
        # e.g., "food_sushi" -> "favorite_food": "sushi"

        # Look for known category prefixes
        for category in sorted(KNOWN_CATEGORIES, key=len, reverse=True):
            cat_pattern = category.replace(" ", "_")
            if part.lower().startswith(cat_pattern + "_"):
                value = part[len(cat_pattern) + 1:].replace("_", " ")
                cat_key = category.replace(" ", "_")
                # Add favorite_ prefix for favorite categories
                if category in FAVORITE_CATEGORIES:
                    last_key = f"favorite_{cat_key}"
                    result[last_key] = smart_title_case(value)
                else:
                    last_key = cat_key
                    result[last_key] = value
                break
        else:
            # Check for favorite_color pattern
            if part.lower().startswith("favorite_color_"):
                last_key = "favorite_color"
                result[last_key] = smart_title_case(part[15:].replace("_", " "))
            elif "_" in part:
                # Generic field_value pattern
                field, _, value = part.partition("_")
                value = value.replace("_", " ")
                if field and value:
                    last_key = field
                    result[last_key] = value

    # Now process the array values - parse_category_value already adds favorite_ prefix
    for item in values:
        category, value = parse_category_value(item)
        if category:
            key_name = category.replace(" ", "_")
            if key_name in result:
                # Convert to list if multiple values
                existing = result[key_name]
                if isinstance(existing, list):
                    existing.append(value)
                else:
                    result[key_name] = [existing, value]
            else:
                result[key_name] = value
            last_key = key_name
        elif last_key and last_key in result:
            # Orphan value — continuation of last extracted field
            existing = result[last_key]
            if isinstance(existing, str):
                result[last_key] = f"{existing}: {item}"
            elif isinstance(existing, list):
                # Append as continuation of last list item
                if existing:
                    existing[-1] = f"{existing[-1]}: {item}"
                else:
                    existing.append(item)

    return result


def extract_fields_from_array(key: str, values: list) -> dict:
    """
    Extract properly structured fields from a mixed array.
    e.g., ["black", "food pizza", "sex toy vibrator", "sex toy dildo"]
    becomes:
    {
        "favorite_color": "black",
        "food": "pizza",
        "sex_toy": ["vibrator", "dildo"]
    }

    For favorite_sex arrays, orphan items (no prefix) are treated as kinks.

    For favorite_body arrays, items like "part eyes" become "body_part": "eyes".
    """
    result = defaultdict(list)
    base_key = normalize_key(key)
    last_category = None

    # For favorite_sex arrays, orphan items should become kinks
    is_sex_array = base_key.lower() == "favorite_sex"
    # For favorite_body arrays, parse "part X", "color X" etc.
    is_body_array = base_key.lower() == "favorite_body"
    # For favorite_porn arrays, "genre X" should become porn_genre
    is_porn_array = base_key.lower() == "favorite_porn"

    # Prefixes in favorite_body arrays that map to favorite categories
    body_array_prefixes = {
        "part": "favorite_body_part",
        "color": "favorite_color",
        "food": "favorite_food",
        "beverage": "favorite_beverage",
        "book": "favorite_book",
        "movie": "favorite_movie",
        "cartoon": "favorite_cartoon",
        "tv show": "favorite_tv_show",
        "band": "favorite_singer",  # band -> singer category
        "singer": "favorite_singer",
        "movie genre": "favorite_movie_genre",
        "flowers": "favorite_flowers",
        "sports": "favorite_sports",
        "game": "favorite_game",
        "holiday": "favorite_holiday",
        "travel destination": "favorite_travel_destination",
        "sex position": "sex_position",
        "sex toy": "sex_toy",
        "porn genre": "porn_genre",
        "kink": "kink",
        "pornstar": "favorite_pornstar",
    }

    for item in values:
        # First check for body array prefixes if this is a favorite_body array
        if is_body_array and isinstance(item, str):
            matched = False
            item_lower = item.lower()
            for prefix, target_key in sorted(body_array_prefixes.items(), key=lambda x: -len(x[0])):
                if item_lower.startswith(prefix + " "):
                    value = item[len(prefix) + 1:].strip()
                    result[target_key].append(value)
                    matched = True
                    break
            if matched:
                continue

        # For favorite_sex arrays, handle "positions" prefix (plural alias)
        if is_sex_array and isinstance(item, str) and item.lower().startswith("positions "):
            result["sex_position"].append(item[10:].strip())
            continue

        # For favorite_porn arrays, bare "genre X" -> porn_genre
        if is_porn_array and isinstance(item, str) and item.lower().startswith("genre "):
            result["porn_genre"].append(item[6:].strip())
            continue

        category, value = parse_category_value(item)
        if category:
            norm_category = category.replace(" ", "_")
            result[norm_category].append(value)
            last_category = norm_category
        else:
            # This is an orphan value (no category prefix)
            # Check if this is a location continuation (e.g., "CA", "TX")
            is_state = isinstance(item, str) and len(item) == 2 and item.isupper()
            if is_state and last_category in ("favorite_travel_destination", "birthplace", "residence"):
                if result[last_category]:
                    result[last_category][-1] = f"{result[last_category][-1]}, {item}"
                    continue

            if is_sex_array:
                # Known position names route to sex_position, not kink
                known_positions = {
                    "cowgirl", "reverse cowgirl", "missionary", "doggy style",
                    "spooning", "69", "standing", "prone bone",
                }
                if isinstance(item, str) and item.lower().strip() in known_positions:
                    result["sex_position"].append(item)
                else:
                    result["kink"].append(item)
            else:
                # For other arrays, add to base key
                result[base_key].append(item)

    # Convert single-item lists to scalars
    final = {}
    for k, v in result.items():
        if len(v) == 1:
            final[k] = v[0]
        else:
            final[k] = v

    return final


def is_mega_key(key: str) -> bool:
    """Check if a key is a mega-key with multiple fields."""
    # Count underscored field patterns
    field_count = len(re.findall(r"(?:^|,_?)(\w+)_\w+", key))
    return field_count >= 3 or ",_" in key


# Keys that should be renamed to favorite_ version (standalone keys that don't go through patterns)
RENAME_TO_FAVORITE = {
    "movie_genre": "favorite_movie_genre",
    "tv_show": "favorite_tv_show",
    "tvshow": "favorite_tvshow",
    "travel_destination": "favorite_travel_destination",
    "music_genre": "favorite_music_genre",
    "book_genre": "favorite_book_genre",
    # Bare category names that should be prefixed
    "color": "favorite_color",
    "food": "favorite_food",
    "beverage": "favorite_beverage",
    "book": "favorite_book",
    "movie": "favorite_movie",
    "cartoon": "favorite_cartoon",
    "singer": "favorite_singer",
    "celebrity": "favorite_celebrity",
    "flowers": "favorite_flowers",
    "sport": "favorite_sport",
    "sports": "favorite_sports",
    "game": "favorite_game",
    "brand": "favorite_brand",
    "holiday": "favorite_holiday",
    "pornstar": "favorite_pornstar",
    "animal": "favorite_animal",
    "clothing_brand": "favorite_brand",
}

# Other key renames
KEY_RENAMES = {
    "eyes_color": "eye_color",
    "lives": "residence",
    "hometown": "birthplace",
    "sexual_position": "sex_position",
    "personality_traits": "personality",
}

# Keys where the value contains part of the key name that got split off
# Format: (partial_key, expected_value_prefix, full_key_name)
# Note: These are sexual preference fields, not favorites, so don't use favorite_ prefix
SPLIT_KEY_VALUE_FIXES = [
    ("favorite_place", "to have sex", "favorite_place_to_have_sex"),
    ("favorite_place", "", "favorite_place_to_have_sex"),
    ("most_surprising_place", "", "wildest_place"),
    ("wildest_or", "most surprising place", "wildest_place"),
    ("one_favorite", "sexual fantasy", "one_favorite_sexual_fantasy"),
]

# Sexual preference fields that should NOT be nested under favorites
SEXUAL_PREFERENCE_KEYS = {
    "favorite_place_to_have_sex",
    "wildest_place",
    "one_favorite_sexual_fantasy",
}

# Patterns for keys where value is embedded in key name (beaterix-kiddo style)
# Format: (key_prefix, output_key) - extracts value after prefix
EMBEDDED_VALUE_KEYS = [
    ("age_", "age"),
    # ("born_", "birthplace"),  # Don't use - born_in handled specially in fix_json
    ("lives_", "residence"),
    ("occupation_", "occupation"),
    ("education_", "education"),
    ("siblings_", "siblings"),
    ("kids_", "kids"),
    ("pets_", "pets"),
    ("hair_", "hair_color"),  # Will be processed specially for hair attributes
    ("eyes_", "eye_color"),
    ("ethnicity_", "ethnicity"),
    ("height_", "height"),
    ("body_", "body_type"),
    ("personality_", "personality"),
    ("once_", "backstory"),
]


def process_embedded_key(key: str, value) -> tuple[str, any] | None:
    """
    Process keys where the value is embedded in the key name.
    e.g., "age_28": "" -> "age": "28"
    e.g., "occupation_assassin": "" -> "occupation": "assassin"
    e.g., "hair_blonde": ["short", "straight"] -> handled specially
    """
    # Trailing comma in original key signals comma-separated location (city, country)
    orig_had_comma = key.rstrip().endswith(",")
    norm_key = normalize_key(key)

    # Skip keys that are standard field names (not embedded values)
    if norm_key.lower() in STANDARD_FIELD_NAMES:
        return None

    # Skip keys that look like sentence fragments (xena-style schema)
    # These have underscores but are descriptive, not field_value patterns
    descriptive_patterns = [
        "dominant_and", "emotionally_", "former_", "highly_", "drawn_to",
        "physically_", "athletic_and", "carries_", "known_for", "values_",
        "enjoys_", "prefers_", "forms_", "protective_", "past_", "present_",
        "interesting_", "fluent_", "learned_", "keeps_", "rarely_", "finds_",
        "distrusts_", "collects_", "avoids_", "has_a", "known_to"
    ]
    for pattern in descriptive_patterns:
        if norm_key.lower().startswith(pattern.lower()):
            return None

    # Special handling for born_into (backstory, not birthplace)
    if norm_key.lower() == "born_into":
        return None  # Let it pass through as-is, will be handled as backstory later

    for prefix, output_key in EMBEDDED_VALUE_KEYS:
        if norm_key.lower().startswith(prefix.lower()):
            embedded = norm_key[len(prefix):]
            embedded = embedded.replace("_", " ").strip()

            # Handle empty value - just use embedded (capitalize for location/ethnicity)
            if value == "" or value is None:
                if output_key in ("residence", "birthplace", "ethnicity"):
                    return output_key, smart_title_case(embedded)
                return output_key, embedded

            # Handle string value - combine embedded with value
            if isinstance(value, str) and value:
                # Special case for residence: use space not comma, title case
                if output_key == "residence":
                    if embedded.lower() in ("on", "in"):
                        # "lives_on: Earth" or "lives_in: Texas" -> just use value
                        combined = value
                    elif embedded.lower() in ("la", "le", "el", "de"):
                        # "lives_la: Jolla" -> "La Jolla" (Spanish/French article)
                        combined = smart_title_case(f"{embedded} {value}")
                    elif len(embedded) <= 2:
                        # "lives_la: California" -> "LA, California" (city abbreviation)
                        combined = f"{embedded.upper()}, {value}"
                    elif orig_had_comma:
                        # "lives_valencia,: Spain" -> "Valencia, Spain" (trailing comma = city, country)
                        combined = smart_title_case(f"{embedded}, {value}")
                    else:
                        # "lives_los: Angeles" -> "Los Angeles"
                        combined = smart_title_case(f"{embedded} {value}")
                # Special case for education: "psychology at NYU"
                elif output_key == "education":
                    combined = f"{embedded} {value}"
                # Special case for birthplace: "Omaha, Nebraska"
                elif output_key == "birthplace":
                    combined = smart_title_case(f"{embedded}, {value}")
                # Special case for eye_color: embedded might be "color" from eyes_color key
                elif output_key == "eye_color" and embedded.lower() == "color":
                    combined = value
                # Special case for ethnicity: "native American" not "native, American"
                elif output_key == "ethnicity":
                    combined = smart_title_case(f"{embedded} {value}")
                else:
                    combined = f"{embedded}, {value}" if embedded else value
                return output_key, combined

            # Handle list value - prepend embedded
            if isinstance(value, list):
                # For hair/eyes, return as dict with attributes
                if output_key == "hair_color":
                    return output_key, {"color": embedded, "attributes": value}
                elif output_key == "eye_color":
                    return output_key, {"color": embedded, "attributes": value}
                # For personality, prepend to list
                elif output_key == "personality":
                    return output_key, [embedded] + value
                # For backstory, join into single string
                elif output_key == "backstory":
                    full_text = f"{embedded} " + ", ".join(value)
                    return output_key, full_text
                # For residence, join
                elif output_key == "residence":
                    full_text = f"{embedded} " + " ".join(value)
                    return output_key, full_text
                else:
                    return output_key, [embedded] + value

            return output_key, embedded

    return None


def is_narrative_key(key: str) -> bool:
    """
    Detect if a key is a narrative paragraph stored as a key name.
    These are very long keys (100+ chars) with underscores instead of spaces,
    like Arvida Byström's bio.json format.
    """
    # Must be very long and mostly underscores with words
    if len(key) < 100:
        return False
    # Mega-keys use ",_" separators — not narrative
    if ",_" in key:
        return False
    # Count word-like segments separated by underscores
    segments = key.split("_")
    if len(segments) < 20:
        return False
    # Most segments should be regular words (2-15 chars)
    word_like = sum(1 for s in segments if 2 <= len(s) <= 15 and s.isalpha())
    return word_like / len(segments) > 0.7


def extract_narrative_bio(key: str, value: list) -> dict:
    """
    Extract a narrative bio from a paragraph-as-key format.
    The key contains underscore-separated words forming sentences,
    and the value is a list of continuation text fragments.
    """
    result = {}

    # Convert underscores to spaces and clean up
    narrative = key.replace("_", " ")
    # Clean up comma spacing
    narrative = narrative.replace(" ,", ",").replace("  ", " ")

    # Join with array values if present
    if isinstance(value, list) and value:
        # Array values continue the narrative
        continuation = " ".join(str(v) for v in value if v)
        if continuation:
            narrative = narrative.rstrip(".") + ", " + continuation

    result["backstory"] = narrative.strip()
    return result


def fix_json(data: dict) -> dict:
    """Fix all issues in a JSON metadata dict."""
    result = {}

    # Check for narrative-as-key format (like Arvida Byström's bio)
    for key, value in data.items():
        if is_narrative_key(key):
            # This is a narrative paragraph stored as a key
            narrative_data = extract_narrative_bio(key, value)
            result.update(narrative_data)
            # Skip this key in normal processing
            data = {k: v for k, v in data.items() if k != key}
            break

    for key, value in data.items():
        # Normalize key (remove trailing commas)
        # But preserve trailing comma as a signal for consolidation categories
        # (e.g., "phobia_fire," means "fire" is separate, not compound with next item)
        orig_had_comma = key.rstrip().endswith(",")
        norm_key = normalize_key(key)
        if orig_had_comma:
            norm_lower = norm_key.lower()
            for cat in CONSOLIDATION_CATEGORIES:
                if norm_lower.startswith(cat + "_"):
                    norm_key = norm_key + ","
                    break

        # Handle born_in directly - just use the value as birthplace
        if norm_key.lower() == "born_in":
            if isinstance(value, str) and value:
                result["birthplace"] = value
            elif isinstance(value, list) and value:
                result["birthplace"] = ", ".join(str(v) for v in value)
            continue

        # --- Batch3 new field type handling ---

        # "female_elf" -> female=true (ignore fantasy species)
        if norm_key.lower() == "female_elf":
            result["female"] = True
            continue

        # "heterosexual" -> straight=true
        if norm_key.lower() == "heterosexual":
            result["straight"] = True
            continue

        # "extravert" -> extrovert=true (spelling variant)
        if norm_key.lower() == "extravert":
            result["extrovert"] = True
            continue

        # "extroverted_with" / "introverted_with" -> personality description
        if norm_key.lower() in ("extroverted_with", "introverted_with"):
            prefix = norm_key.lower().split("_")[0]  # "extroverted" or "introverted"
            if isinstance(value, str) and value:
                result["personality"] = f"{prefix} with {value}"
            else:
                result["personality"] = prefix
            continue

        # "has_kids" with descriptive value -> kids field
        if norm_key.lower() == "has_kids":
            result["kids"] = True
            continue

        # Orphan "good" key (kimberdee) -> merge into habits
        if norm_key.lower() == "good" and isinstance(value, list):
            existing_habits = result.get("habits", [])
            if isinstance(existing_habits, str):
                existing_habits = [existing_habits]
            for v in value:
                if isinstance(v, str):
                    existing_habits.append(f"good {v}" if not v.lower().startswith("good") else v)
                else:
                    existing_habits.append(v)
            result["habits"] = existing_habits
            continue

        # "sexual_fantasy" or "favorite_sexual" -> sexual preference fantasy
        if norm_key.lower() in ("sexual_fantasy", "favorite_sexual", "favorite_sexual_fantasy"):
            result["sex_fantasy"] = value
            continue

        # "wildest_place" -> wildest_place
        if norm_key.lower() == "wildest_place":
            result["wildest_place"] = value
            continue

        # "sex_toys" (plural) -> normalize to sex_toy
        if norm_key.lower() == "sex_toys":
            result["sex_toy"] = value
            continue

        # "porn_genres" (plural) -> normalize to porn_genre
        if norm_key.lower() == "porn_genres":
            result["porn_genre"] = value
            continue

        # "masturbates_at" -> masturbation frequency
        if norm_key.lower().startswith("masturbates_"):
            freq = norm_key[len("masturbates_"):].replace("_", " ")
            if isinstance(value, str) and value:
                freq = f"{freq} {value}"
            result["masturbation"] = freq
            continue

        # "favorite_travel" with "destination X" value -> favorite_travel_destination
        if norm_key.lower() == "favorite_travel":
            if isinstance(value, str) and value.lower().startswith("destination"):
                dest = value[len("destination"):].strip()
                result["favorite_travel_destination"] = dest
            else:
                result["favorite_travel_destination"] = value
            continue

        # "place_of" with "living X" -> residence
        if norm_key.lower() == "place_of":
            if isinstance(value, str) and value:
                val_lower = value.lower()
                if val_lower.startswith("living "):
                    result["residence"] = value[len("living "):].strip()
                elif val_lower.startswith("birth "):
                    result["birthplace"] = value[len("birth "):].strip()
                else:
                    result["residence"] = value
            elif isinstance(value, list) and value:
                # Join list items and parse (e.g., ["living Coral Springs", "Florida"])
                joined = ", ".join(str(v) for v in value)
                if joined.lower().startswith("living "):
                    result["residence"] = joined[len("living "):].strip()
                elif joined.lower().startswith("birth "):
                    result["birthplace"] = joined[len("birth "):].strip()
                else:
                    result["residence"] = joined
            continue

        # Ryan Connor movie mega-key: "movie_tombstone_with_kurt_russell,_also_top_gun"
        if norm_key.lower().startswith("movie_tombstone_with"):
            # Extract "Tombstone" and look for "top_gun" pattern
            movies = ["Tombstone"]
            # Check if key contains "top_gun"
            if "top_gun" in norm_key.lower():
                if isinstance(value, str) and value:
                    movies.append(f"Top Gun: {value}")
                else:
                    movies.append("Top Gun")
            result["favorite_movie"] = movies
            continue

        # Brittrix: "personal_experience_that_deeply_impacted_me" -> personal_experience
        if norm_key.lower().startswith("personal_experience_"):
            result["personal_experience"] = value
            continue

        # Brittrix: "career_experience" -> pass through as extra field
        if norm_key.lower() == "career_experience":
            result["career_experience"] = value
            continue

        # "wildest_or_most_surprising_place_to_have_sex" -> already handled field name
        if norm_key.lower() == "wildest_or_most_surprising_place_to_have_sex":
            result["wildest_place"] = value
            continue

        # Stray ")" key (June Berri malformed bio) -> skip
        if norm_key.strip() in (")", "("):
            continue

        # Check for embedded value keys (e.g., "age_28", "occupation_assassin")
        embedded_result = process_embedded_key(key, value)
        if embedded_result:
            out_key, out_value = embedded_result
            # Special handling for hair_color with attributes dict
            if out_key == "hair_color" and isinstance(out_value, dict):
                result["hair_color"] = out_value["color"]
                attrs = out_value["attributes"]
                for attr in attrs:
                    attr_lower = attr.lower()
                    if attr_lower in KNOWN_HAIR_LENGTHS:
                        result["hair_length"] = attr
                    elif attr_lower in KNOWN_HAIR_STYLES:
                        result["hair_style"] = attr
                    else:
                        # Unknown attribute - could be length description or style
                        if "hair_length" not in result:
                            result["hair_length"] = attr
                        elif "hair_style" not in result:
                            result["hair_style"] = attr
                continue
            # Special handling for eye_color with attributes dict
            elif out_key == "eye_color" and isinstance(out_value, dict):
                result["eye_color"] = out_value["color"]
                attrs = out_value["attributes"]
                if attrs:
                    result["eye_description"] = ", ".join(attrs) if len(attrs) > 1 else attrs[0]
                continue
            else:
                result[out_key] = out_value
                continue

        # Handle mega-keys
        if is_mega_key(key) and isinstance(value, list):
            extracted = fix_mega_key(key, value)
            result.update(extracted)
            continue

        # Check for key-embedded values (e.g., "singer_drake,": "Latto")
        embedded_result = extract_key_embedded_value(key, value)
        if embedded_result:
            cat_key, cat_value = embedded_result
            # Merge with existing if category already exists
            if cat_key in result:
                existing = result[cat_key]
                if isinstance(existing, list) and isinstance(cat_value, list):
                    result[cat_key] = existing + cat_value
                elif isinstance(existing, list):
                    result[cat_key] = existing + [cat_value]
                elif isinstance(cat_value, list):
                    result[cat_key] = [existing] + cat_value
                else:
                    result[cat_key] = [existing, cat_value]
            else:
                result[cat_key] = cat_value
            continue

        # Handle arrays with mixed category values
        if isinstance(value, list):
            # favorite_sex and favorite_body arrays always go through extraction
            always_extract = norm_key.lower() in ("favorite_sex", "favorite_body")

            # Check if array contains category-prefixed values
            has_categories = any(
                parse_category_value(str(v))[0] is not None
                for v in value if isinstance(v, str)
            )

            if (has_categories or always_extract) and norm_key.startswith("favorite"):
                # Extract into separate fields
                extracted = extract_fields_from_array(norm_key, value)
                result.update(extracted)
                continue

            # Fix split key-value patterns
            norm_key, value = fix_split_key_value(norm_key, value)

            # Clean redundant prefixes from remaining array items
            # Only clean category-like keys (sex_position, porn_genre, etc.)
            # Skip standard fields like physical_features where "flowers on left foot" is valid
            skip_clean = norm_key.lower() in STANDARD_FIELD_NAMES or norm_key.lower() in (
                "physical_features", "personal_experience", "dislikes", "habits",
                "hobbies", "phobia", "guilty_pleasure", "biggest_dream",
            )
            cleaned_values = []
            for v in value:
                if isinstance(v, str) and not skip_clean:
                    _, clean_val = parse_category_value(v)
                    cleaned_values.append(clean_val)
                else:
                    cleaned_values.append(v)

            # Store as single value if only one item
            if len(cleaned_values) == 1:
                result[norm_key] = cleaned_values[0]
            else:
                result[norm_key] = cleaned_values
        else:
            result[norm_key] = value

    # Handle special cases before final pass
    # born_into is backstory, not birthplace
    if "born_into" in result:
        val = result.pop("born_into")
        if isinstance(val, list):
            result["backstory"] = "Born into " + ", ".join(str(v) for v in val)
        else:
            result["backstory"] = f"Born into {val}"

    # born_orange with array ["County", "California"] should be "Orange County, California"
    if "born_orange" in result:
        val = result.pop("born_orange")
        if isinstance(val, list):
            result["birthplace"] = "Orange " + " ".join(str(v) for v in val)
        else:
            result["birthplace"] = f"Orange {val}"

    # born_in: "Romania" -> birthplace: "Romania" (not "In, Romania")
    if "born_in" in result:
        val = result.pop("born_in")
        if isinstance(val, str) and val:
            result["birthplace"] = val
        elif isinstance(val, list) and val:
            result["birthplace"] = ", ".join(str(v) for v in val)

    # Handle numeric keys that are age verification flags (e.g., "21": true means "over 21")
    # or actual age values (e.g., "40": true means age is 40)
    for key in list(result.keys()):
        if key.isdigit():
            age_val = int(key)
            if age_val in (18, 21):
                result["over_" + key] = result.pop(key)
            elif 18 <= age_val <= 70:
                # This is likely the actual age
                result["age"] = age_val
                del result[key]

    # Consolidate phobia_X and phobias_X keys into a single phobia array
    phobias = []
    for key in list(result.keys()):
        if key.startswith("phobia_") or key.startswith("phobias_"):
            # Remove "phobia_" or "phobias_" prefix
            prefix_len = 7 if key.startswith("phobia_") else 8
            raw_suffix = key[prefix_len:]
            has_trailing_comma = raw_suffix.endswith(",")
            phobia_name = raw_suffix.rstrip(",")
            val = result.pop(key)

            # Handle compound patterns where embedded should join with first array item
            # e.g., phobia_the: ["dark", "roaches"] -> ["the dark", "roaches"]
            # BUT: trailing comma signals separate items, e.g. phobia_fire,: ["insects"] -> ["fire", "insects"]
            compound_prefixes = ["the", "being", "getting", "poor", "deep", "small", "loud", "crunchy", "fire", "giant", "confined", "enclosed", "losing"]
            if phobia_name.lower() in compound_prefixes and not has_trailing_comma:
                if isinstance(val, list) and val:
                    first_item = val[0]
                    phobias.append(f"{phobia_name} {first_item}")
                    phobias.extend(val[1:])
                elif isinstance(val, str) and val:
                    phobias.append(f"{phobia_name} {val}")
                else:
                    phobias.append(phobia_name)
            elif phobia_name and phobia_name.lower() != "missing":
                phobias.append(phobia_name)
                # If value is a list, add those too
                if isinstance(val, list):
                    phobias.extend(val)
                elif val and val != "":
                    phobias.append(val)
            else:
                # If value is a list, add those too
                if isinstance(val, list):
                    phobias.extend(val)
                elif val and val != "":
                    phobias.append(val)
    if phobias:
        result["phobia"] = phobias

    # Consolidate habits_X keys into a single habits array
    habits = result.get("habits", [])
    if isinstance(habits, str):
        habits = [habits]
    habits = list(habits)  # Make a copy
    for key in list(result.keys()):
        if (key.startswith("habits_") or key.startswith("habit_")) and key != "habits":
            prefix_len = 7 if key.startswith("habits_") else 6  # len("habits_") or len("habit_")
            raw_suffix = key[prefix_len:]
            has_trailing_comma = raw_suffix.endswith(",")
            habit_name = raw_suffix.rstrip(",")
            val = result.pop(key)

            # Compound prefixes that should join with value (NOT mindfulness - it's a category, not a verb)
            compound_habits = (
                "waking", "eating", "drinking", "going", "doing", "rising", "being",
                "always", "staying", "practicing", "watching", "maintaining", "i'm", "i",
                "early", "type", "saving", "daily", "giggles", "sleeping",
                "not", "jokes", "oversleeping", "partying",
                "working", "biting", "weaving", "cleaning", "reading",
            )

            # Label words that are section headers, not actual habit prefixes
            # (e.g., habits_good: ["focused",...] → just use array values)
            habit_labels = ("good", "bad")

            # Label words are section headers — skip the label, use values directly
            if habit_name.lower() in habit_labels:
                if isinstance(val, list):
                    habits.extend(val)
                elif isinstance(val, str) and val:
                    habits.append(val)
                continue

            # Handle string value (gerund check: eating+drinking = separate)
            # Trailing comma signals separate items, not compound joining
            if isinstance(val, str) and val:
                first_word = val.split()[0] if val else ""
                is_both_gerunds = _is_gerund(habit_name) and _is_gerund(first_word)
                if habit_name.lower() in compound_habits and not is_both_gerunds and not has_trailing_comma:
                    habits.append(f"{habit_name} {val}")
                else:
                    habits.append(habit_name)
                    habits.append(val)
            # Handle list value - join embedded with first item if compound (gerund check)
            elif isinstance(val, list) and val:
                first_item = val[0]
                first_word = first_item.split()[0] if isinstance(first_item, str) and first_item else ""
                is_both_gerunds = _is_gerund(habit_name) and _is_gerund(first_word)
                if habit_name.lower() in compound_habits and isinstance(first_item, str) and not is_both_gerunds and not has_trailing_comma:
                    habits.append(f"{habit_name} {first_item}")
                    habits.extend(val[1:])
                else:
                    habits.append(habit_name)
                    habits.extend(val)
            elif habit_name:
                habits.append(habit_name)
    # Merge top-level "bad" key into habits (bad habits section label)
    if "bad" in result:
        bad_val = result.pop("bad")
        if isinstance(bad_val, list):
            habits.extend(bad_val)
        elif isinstance(bad_val, str) and bad_val:
            habits.append(bad_val)

    # Re-route habits items with wrong-category prefix to correct array
    if habits:
        clean_habits = []
        rerouted_hobbies = []
        for item in habits:
            if isinstance(item, str) and item.lower().startswith("hobbies "):
                rerouted_hobbies.append(item[8:].strip())
            elif isinstance(item, str) and item.lower().startswith("dislikes "):
                # Silently drop — will be caught by dislikes consolidation
                pass
            else:
                clean_habits.append(item)
        habits = clean_habits
        if rerouted_hobbies:
            existing_hobbies = result.get("hobbies", [])
            if isinstance(existing_hobbies, str):
                existing_hobbies = [existing_hobbies]
            existing_hobbies.extend(rerouted_hobbies)
            result["hobbies"] = existing_hobbies

    if habits:
        result["habits"] = habits

    # Consolidate hobbies_X keys into a single hobbies array
    hobbies = result.get("hobbies", [])
    if isinstance(hobbies, str):
        hobbies = [hobbies]
    hobbies = list(hobbies)  # Make a copy
    # Compound verb prefixes that should join with value
    compound_hobbies = (
        "working", "sword", "people", "content", "doing", "running",
        "trying", "shooting", "witchcraft",
        "exploring", "paddleboarding", "eating", "building",
        "caring", "skiing", "going", "skating", "traveling",
        "being", "relaxing", "walking", "watching",
        "water", "shopping", "spending", "fashion",
    )
    # Transitive verbs that always need an object — bypass gerund check
    always_join_hobbies = ("watching", "doing", "going", "trying", "building", "caring", "exploring", "walking", "spending")
    for key in list(result.keys()):
        if key.startswith("hobbies_") and key != "hobbies":
            prefix_len = 8  # len("hobbies_")
            raw_suffix = key[prefix_len:]
            has_trailing_comma = raw_suffix.endswith(",")
            hobby_name = raw_suffix.rstrip(",")
            val = result.pop(key)

            # Handle string value (gerund check: hiking+surfing = separate)
            # Trailing comma signals separate items, not compound joining
            if isinstance(val, str) and val:
                first_word = val.split()[0] if val else ""
                is_both_gerunds = _is_gerund(hobby_name) and _is_gerund(first_word)
                force_join = hobby_name.lower() in always_join_hobbies
                if hobby_name.lower() in compound_hobbies and (force_join or not is_both_gerunds) and not has_trailing_comma:
                    hobbies.append(f"{hobby_name} {val}")
                else:
                    hobbies.append(hobby_name)
                    hobbies.append(val)
            # Handle list value - join if compound (but not gerund+gerund = separate activities)
            elif isinstance(val, list) and val:
                first_item = val[0]
                first_word = first_item.split()[0] if isinstance(first_item, str) and first_item else ""
                is_both_gerunds = _is_gerund(hobby_name) and _is_gerund(first_word)
                force_join = hobby_name.lower() in always_join_hobbies
                if hobby_name.lower() in compound_hobbies and isinstance(first_item, str) and (force_join or not is_both_gerunds) and not has_trailing_comma:
                    hobbies.append(f"{hobby_name} {first_item}")
                    hobbies.extend(val[1:])
                else:
                    hobbies.append(hobby_name)
                    hobbies.extend(val)
            elif hobby_name:
                hobbies.append(hobby_name)
    if hobbies:
        result["hobbies"] = hobbies

    # Consolidate dislikes_X keys into a single dislikes array
    dislikes = result.get("dislikes", [])
    if isinstance(dislikes, str):
        dislikes = [dislikes]
    dislikes = list(dislikes)  # Make a copy
    for key in list(result.keys()):
        if (key.startswith("dislikes_") or key.startswith("dislike_")) and key != "dislikes":
            prefix_len = 9 if key.startswith("dislikes_") else 8  # len("dislikes_") or len("dislike_")
            raw_suffix = key[prefix_len:]
            has_trailing_comma = raw_suffix.endswith(",")
            dislike_name = raw_suffix.rstrip(",")
            val = result.pop(key)

            # Compound prefixes where embedded should join with first value
            compound_prefixes = (
                "bad", "waiting", "half-assed", "rainy", "washing", "math",
                "loud", "slow", "cold", "unsolicited", "when", "men", "repeating",
                "folding", "people", "ungenerous", "being", "cleaning",
                "waking", "getting", "early",
            )

            # Handle string value (gerund check for safety)
            # Trailing comma signals separate items, not compound joining
            if isinstance(val, str) and val:
                first_word = val.split()[0] if val else ""
                is_both_gerunds = _is_gerund(dislike_name) and _is_gerund(first_word)
                if dislike_name.lower() in compound_prefixes and not is_both_gerunds and not has_trailing_comma:
                    dislikes.append(f"{dislike_name} {val}")
                else:
                    dislikes.append(dislike_name)
                    dislikes.append(val)
            # Handle list value - join embedded with first item if compound (gerund check)
            elif isinstance(val, list) and val:
                first_item = val[0]
                first_word = first_item.split()[0] if isinstance(first_item, str) and first_item else ""
                is_both_gerunds = _is_gerund(dislike_name) and _is_gerund(first_word)
                if dislike_name.lower() in compound_prefixes and isinstance(first_item, str) and not is_both_gerunds and not has_trailing_comma:
                    dislikes.append(f"{dislike_name} {first_item}")
                    dislikes.extend(val[1:])
                else:
                    dislikes.append(dislike_name)
                    dislikes.extend(val)
            elif dislike_name:
                dislikes.append(dislike_name)
    if dislikes:
        result["dislikes"] = dislikes

    # Consolidate kink_X and kinks_X keys and "kinks" (plural) into singular "kink" array
    kinks = result.get("kink", [])
    if isinstance(kinks, str):
        kinks = [kinks]
    kinks = list(kinks)  # Make a copy
    # Merge "kinks" (plural) key if present
    if "kinks" in result and result["kinks"] != kinks:
        plural_val = result.pop("kinks")
        if isinstance(plural_val, list):
            kinks.extend(plural_val)
        elif isinstance(plural_val, str) and plural_val:
            kinks.append(plural_val)
    # Compound prefixes where embedded should join with first value
    compound_kinks = ("being", "dirty", "slow-burn", "subtle", "verbal", "role", "public", "blowjob/deep", "orgasm")
    for key in list(result.keys()):
        if (key.startswith("kink_") or key.startswith("kinks_")) and key not in ("kink", "kinks"):
            prefix_len = 5 if key.startswith("kink_") else 6  # len("kink_") or len("kinks_")
            raw_suffix = key[prefix_len:]
            has_trailing_comma = raw_suffix.endswith(",")
            kink_name = raw_suffix.rstrip(",")
            val = result.pop(key)

            # Handle string value
            # Trailing comma signals separate items, not compound joining
            if isinstance(val, str) and val:
                if kink_name.lower() in compound_kinks and not has_trailing_comma:
                    kinks.append(f"{kink_name} {val}")
                else:
                    kinks.append(kink_name)
                    kinks.append(val)
            # Handle list value - join embedded with first item if compound
            elif isinstance(val, list) and val:
                first_item = val[0]
                if kink_name.lower() in compound_kinks and isinstance(first_item, str) and not has_trailing_comma:
                    kinks.append(f"{kink_name} {first_item}")
                    # Strip "kink " prefix from remaining array values
                    for v in val[1:]:
                        if isinstance(v, str) and v.lower() in ("kink", "kinks"):
                            continue  # Skip bare category name
                        elif isinstance(v, str) and v.lower().startswith("kink "):
                            kinks.append(v[5:].strip())
                        else:
                            kinks.append(v)
                else:
                    kinks.append(kink_name)
                    for v in val:
                        if isinstance(v, str) and v.lower() in ("kink", "kinks"):
                            continue  # Skip bare category name
                        elif isinstance(v, str) and v.lower().startswith("kink "):
                            kinks.append(v[5:].strip())
                        else:
                            kinks.append(v)
            elif kink_name:
                kinks.append(kink_name)
    if kinks:
        result["kink"] = kinks

    # Join continuation words ("but ...", "though ...") with the preceding item
    _continuation_prefixes = ("but ", "though ", "however ", "even though ", "yet ")
    for key in ("habits", "dislikes", "hobbies", "phobia"):
        arr = result.get(key, [])
        if not isinstance(arr, list) or len(arr) < 2:
            continue
        merged = [arr[0]]
        for item in arr[1:]:
            if isinstance(item, str) and any(item.lower().startswith(p) for p in _continuation_prefixes):
                if merged and isinstance(merged[-1], str):
                    merged[-1] = f"{merged[-1]} {item}"
                    continue
            merged.append(item)
        result[key] = merged

    # Merge current_job and occupation into just occupation
    if "current_job" in result and "occupation" in result:
        # Prefer non-empty value
        if result["occupation"] == "" and result["current_job"] != "":
            result["occupation"] = result["current_job"]
        del result["current_job"]
    elif "current_job" in result:
        result["occupation"] = result.pop("current_job")

    # Join list-valued occupation/current_job into string
    if isinstance(result.get("occupation"), list):
        # Strip leading "and" from items to avoid "dancer and entertainer and and pornstar"
        cleaned = [re.sub(r"^and\s+", "", item.strip()) for item in result["occupation"]]
        result["occupation"] = " and ".join(cleaned)

    # Handle boolean-style keys like "no_kids": "" or "kids_no": "" → "kids": false
    # Also handle values that are "no" → false
    for key in list(result.keys()):
        val = result[key]
        # Convert "no" string values to false for certain fields
        if val == "no" and key in ("kids", "siblings", "pets"):
            result[key] = False
        elif val == "" or val is None:
            # Pattern: no_X → X: false
            if key.startswith("no_"):
                field = key[3:]
                result[field] = False
                del result[key]
            # Pattern: X_no → X: false
            elif key.endswith("_no"):
                field = key[:-3]
                result[field] = False
                del result[key]

    # Fix split key-value fields where part of the key ended up in the value
    # e.g., "favorite_place": "to have sex in bed" -> "favorite_place_to_have_sex": "bed"
    for partial_key, value_prefix, full_key in SPLIT_KEY_VALUE_FIXES:
        if partial_key in result:
            val = result[partial_key]
            # Handle string value
            if isinstance(val, str):
                val_lower = val.lower()
                prefix_lower = value_prefix.lower()
                if val_lower.startswith(prefix_lower):
                    # Extract the actual value after the prefix
                    actual_value = val[len(value_prefix):].strip()
                    # Remove leading "in" or similar words
                    for word in ["in ", "is ", "a ", "an "]:
                        if actual_value.lower().startswith(word):
                            actual_value = actual_value[len(word):]
                            break
                    result[full_key] = actual_value
                    del result[partial_key]
                elif val == "":
                    # Empty value, just rename the key
                    result[full_key] = ""
                    del result[partial_key]
            # Handle array value
            elif isinstance(val, list) and val:
                first_val = str(val[0]).lower() if val else ""
                prefix_lower = value_prefix.lower()
                if first_val.startswith(prefix_lower):
                    # First element has the prefix, rest is the value
                    remaining = str(val[0])[len(value_prefix):].strip()
                    # Join with rest of array
                    full_value = remaining
                    if len(val) > 1:
                        full_value = remaining + " " + " ".join(str(v) for v in val[1:])
                    result[full_key] = full_value.strip()
                    del result[partial_key]

    # Clean up array fields that should be strings
    # birthplace array should be joined
    if "birthplace" in result and isinstance(result["birthplace"], list):
        parts = result["birthplace"]
        # Title case and join: ["orange", "County", "California"] -> "Orange County, California"
        if len(parts) >= 2:
            result["birthplace"] = " ".join(str(p).title() for p in parts[:2]) + ", " + ", ".join(str(p) for p in parts[2:]) if len(parts) > 2 else " ".join(str(p).title() for p in parts)
        else:
            result["birthplace"] = " ".join(str(p).title() for p in parts)

    # backstory array should be joined into a single string
    if "backstory" in result and isinstance(result["backstory"], list):
        result["backstory"] = " ".join(str(v) for v in result["backstory"])

    # residence array should be joined
    if "residence" in result and isinstance(result["residence"], list):
        result["residence"] = " ".join(str(v) for v in result["residence"])

    # personal_experience array should be joined into a single string
    if "personal_experience" in result and isinstance(result["personal_experience"], list):
        result["personal_experience"] = " ".join(str(v) for v in result["personal_experience"])

    # biggest_dream array should be joined into a single string
    if "biggest_dream" in result and isinstance(result["biggest_dream"], list):
        result["biggest_dream"] = " ".join(str(v) for v in result["biggest_dream"])

    # Final pass: rename standalone keys that need favorite_ prefix and other renames
    final_result = {}
    for key, val in result.items():
        # Apply other renames first
        if key in KEY_RENAMES:
            key = KEY_RENAMES[key]
        # Then apply favorite_ prefix
        if key in RENAME_TO_FAVORITE:
            final_result[RENAME_TO_FAVORITE[key]] = val
        else:
            final_result[key] = val

    # Process hair_color and eye_color arrays to extract separate attributes
    if "hair_color" in final_result and isinstance(final_result["hair_color"], list):
        hair_vals = final_result["hair_color"]
        hair_color = None
        hair_length = None
        hair_style = None

        for item in hair_vals:
            if not isinstance(item, str):
                continue
            item_lower = item.lower()

            # Check for explicit prefixes first
            if item_lower.startswith("length "):
                hair_length = item[7:].strip()
            elif item_lower.startswith("signature style "):
                hair_style = item[16:].strip()
            elif item_lower.startswith("style "):
                hair_style = item[6:].strip()
            # Check for known lengths without prefix
            elif item_lower in KNOWN_HAIR_LENGTHS:
                hair_length = item
            # Check for known styles without prefix
            elif item_lower in KNOWN_HAIR_STYLES:
                hair_style = item
            # Check if it's a length description (contains length-related words)
            elif any(word in item_lower for word in ["past", "shoulder", "long", "short", "medium"]) and hair_length is None:
                hair_length = item
            # Otherwise assume it's the color
            elif hair_color is None:
                hair_color = item
            # If we already have color and it's not a recognized attribute, might be style
            elif hair_style is None:
                hair_style = item

        # Update the result
        if hair_color:
            final_result["hair_color"] = hair_color
        else:
            del final_result["hair_color"]
        if hair_length:
            final_result["hair_length"] = hair_length
        if hair_style:
            final_result["hair_style"] = hair_style

    if "eye_color" in final_result and isinstance(final_result["eye_color"], list):
        eye_vals = final_result["eye_color"]
        eye_color = None
        eye_description = None

        for item in eye_vals:
            if not isinstance(item, str):
                continue
            item_lower = item.lower()

            # Check if it contains known descriptors
            if any(desc in item_lower for desc in KNOWN_EYE_DESCRIPTORS):
                eye_description = item
            elif eye_color is None:
                eye_color = item
            else:
                # Additional value - treat as description
                if eye_description:
                    eye_description = f"{eye_description}, {item}"
                else:
                    eye_description = item

        # Update the result
        if eye_color:
            final_result["eye_color"] = eye_color
        else:
            del final_result["eye_color"]
        if eye_description:
            final_result["eye_description"] = eye_description

    # Split values containing "/" into separate array items
    # Skip fields where "/" is part of a meaningful description
    skip_slash_split_keys = (
        "kink", "backstory", "bio", "biggest_dream", "personal_experience",
        "physical_features", "tattoos",  # Tattoo locations like "butt/hip" should stay together
        "ethnicity",  # "african/african-american" should stay as one value
        "phobia",  # "mice/rats" should stay as one item
        "residence",  # "NY/Miami" should stay together
    )
    for key, val in final_result.items():
        if key in skip_slash_split_keys:
            continue  # Don't split these fields
        if isinstance(val, list):
            expanded = []
            for item in val:
                if isinstance(item, str) and "/" in item:
                    # Split on "/" and strip whitespace
                    parts = [p.strip() for p in item.split("/")]
                    expanded.extend(parts)
                else:
                    expanded.append(item)
            final_result[key] = expanded
        elif isinstance(val, str) and "/" in val:
            # Don't split certain fields
            # - kink: "blowjob/deep throating" is one item
            # - backstory: contains prose with slashes
            # - bio: contains prose
            # - ethnicity: "african/african-american" is one value
            skip_slash_split = ("kink", "backstory", "bio", "biggest_dream", "personal_experience", "ethnicity")
            if key not in skip_slash_split and val.count("/") >= 1:
                parts = [p.strip() for p in val.split("/")]
                # Only convert to array if we got multiple meaningful parts
                if len(parts) > 1 and all(len(p) > 2 for p in parts):
                    final_result[key] = parts

    # Strip leading conjunctions ("and ", "or ") from array items
    # These are artifacts from comma-separated source lists (e.g., "or golf", "and bugs")
    skip_conjunction_strip = ("bio", "backstory", "biggest_dream", "personal_experience", "sexual_fantasy")
    for key, val in final_result.items():
        if key in skip_conjunction_strip:
            continue
        if isinstance(val, list):
            cleaned = []
            for item in val:
                if isinstance(item, str):
                    stripped = re.sub(r"^(?:and|or)\s+", "", item)
                    cleaned.append(stripped if stripped else item)
                else:
                    cleaned.append(item)
            final_result[key] = cleaned

    # Move favorite_kink to kink (sexual preference, not a favorite)
    if "favorite_kink" in final_result:
        fk_val = final_result.pop("favorite_kink")
        existing_kink = final_result.get("kink", [])
        if isinstance(existing_kink, str):
            existing_kink = [existing_kink]
        if isinstance(fk_val, list):
            existing_kink.extend(fk_val)
        elif isinstance(fk_val, str) and fk_val:
            existing_kink.append(fk_val)
        final_result["kink"] = existing_kink

    # Nest keys with common prefixes (do this last after all other processing)
    prefixes_to_nest = ["favorite_", "hair_", "eye_", "sex_", "porn_"]
    nested = {}
    keys_to_remove = []

    for prefix in prefixes_to_nest:
        prefix_name = prefix.rstrip("_")
        nested_obj = {}
        for key, val in final_result.items():
            # Skip sexual preference keys - they go in sexual_preferences, not favorites
            if key in SEXUAL_PREFERENCE_KEYS:
                continue
            if key.startswith(prefix):
                subkey = key[len(prefix):]
                nested_obj[subkey] = val
                keys_to_remove.append(key)
        if nested_obj:
            nested[prefix_name] = nested_obj

    # Remove nested keys and add nested objects
    for key in keys_to_remove:
        del final_result[key]
    final_result.update(nested)

    return final_result


def process_file(filepath: Path, base_dir: Path = None) -> dict:
    """Process a single JSON file and create fixed version. Returns the fixed data."""
    display_path = filepath.relative_to(base_dir) if base_dir else filepath.name
    print(f"\nProcessing: {display_path}")

    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    fixed = fix_json(data)

    # Show what changed
    orig_keys = set(data.keys())
    new_keys = set(fixed.keys())

    removed = orig_keys - new_keys
    added = new_keys - orig_keys

    if removed:
        print(f"  Removed keys: {', '.join(sorted(removed)[:5])}{'...' if len(removed) > 5 else ''}")
    if added:
        print(f"  Added keys: {', '.join(sorted(added)[:10])}{'...' if len(added) > 10 else ''}")

    return fixed


def get_default_value(key: str) -> any:
    """Get appropriate default value for a missing key."""
    # Special case for age
    if key == "age":
        return "Prefer not to say"
    # Boolean fields
    if key in ("introvert", "ambivert", "extrovert", "single", "kids", "siblings", "pets"):
        return False
    # Fields that should be empty strings
    if key in ("VoiceProvider", "VoiceID", "bio", "gender", "sexual_orientation",
               "ethnicity", "height", "biggest_dream", "relationship_status",
               "current_job", "education", "birthplace", "residence", "backstory",
               "guilty_pleasure", "love_language"):
        return ""
    # Fields that should be empty arrays
    if key in ("personality", "likes", "dislikes", "habits", "hobbies", "phobia"):
        return []
    # Default to empty string
    return ""


# Master schema defining all standardized keys with default empty values.
# Dict insertion order defines output field ordering (Python 3.7+).
# order_dict() deep-merges actual data onto this template so every output
# has the same key structure regardless of what source data is available.
MASTER_SCHEMA = {
    "VoiceProvider": "ElevenLabs",
    "VoiceID": "",
    "bio": "",
    "gender": "",
    "sexual_orientation": "",
    "age": "",
    "relationship_status": "",
    "birthplace": "",
    "residence": "",
    "current_job": "",
    "ethnicity": "",
    "personality": "",
    "appearance": {
        "hair": {
            "color": "",
            "length": "",
            "style": "",
        },
        "eye_color": "",
        "physical_features": [],
        "tattoos": [],
        "body_type": "",
        "cup_size": "",
        "dress_size": "",
        "shoe_size": "",
    },
    "favorites": {
        "color": "",
        "food": "",
        "beverage": "",
        "book": "",
        "book_genre": "",
        "author": "",
        "movie": "",
        "cartoon": "",
        "tv_show": "",
        "singer": "",
        "song": "",
        "movie_genre": "",
        "celebrity": "",
        "pornstar": "",
        "flowers": "",
        "sports": "",
        "game": "",
        "brand": "",
        "holiday": "",
        "travel_destination": "",
    },
    "sexual_preferences": {
        "positions": [],
        "toys": [],
        "kinks": [],
        "porn_genres": [],
        "fantasy": "",
        "favorite_place_to_have_sex": "",
        "wildest_place": "",
        "one_favorite_sexual_fantasy": "",
    },
    "hobbies": [],
    "dislikes": [],
    "biggest_dream": "",
    "guilty_pleasure": [],
    "love_language": "",
    "phobia": [],
    "habits": [],
    "interesting_facts": [],
    "personal_experience": "",
    "backstory": "",
    "kids": False,
}


def transform_to_new_schema(data: dict) -> dict:
    """Transform the fixed data to the new schema structure."""
    result = {}

    # Copy basic fields
    result["VoiceProvider"] = data.get("VoiceProvider", "ElevenLabs") or "ElevenLabs"
    result["VoiceID"] = data.get("VoiceID", "")
    # Check for bio or description (tov files use description)
    result["bio"] = data.get("bio", "") or data.get("description", "")

    # Transform female/male booleans to gender string
    # Also handle edge cases like "female_elf" -> female (ignore "elf")
    if data.get("female") or data.get("female_elf") or data.get("woman"):
        result["gender"] = "female"
    elif data.get("male") or data.get("man"):
        result["gender"] = "male"
    else:
        result["gender"] = ""

    # Transform orientation booleans to sexual_orientation string
    # Also handle "heterosexual" as alias for "straight"
    if data.get("pansexual"):
        result["sexual_orientation"] = "pansexual"
    elif data.get("bisexual"):
        result["sexual_orientation"] = "bisexual"
    elif data.get("straight") or data.get("heterosexual"):
        result["sexual_orientation"] = "straight"
    else:
        result["sexual_orientation"] = ""

    # Copy other basic fields
    # Convert age to number if valid, otherwise keep as string
    age = data.get("age", "Prefer not to say")
    if isinstance(age, str) and age.isdigit():
        result["age"] = int(age)
    else:
        result["age"] = age
    result["relationship_status"] = data.get("relationship_status", "")
    # Map "single: true" or "married: true" to relationship_status if not already set
    if not result["relationship_status"]:
        if data.get("single") is True or data.get("marital_status_single") is True:
            result["relationship_status"] = "single"
        elif data.get("married") is True or data.get("marital_status_married") is True:
            result["relationship_status"] = "married"
    bp = data.get("birthplace", "")
    result["birthplace"] = normalize_location(smart_title_case(bp)) if bp else ""

    # Use current_job (rename from occupation)
    result["current_job"] = data.get("occupation", data.get("current_job", "")) or ""

    result["ethnicity"] = data.get("ethnicity", "")

    # Personality type from boolean flags (ambivert/extrovert/introvert)
    if data.get("ambivert"):
        result["personality"] = "ambivert"
    elif data.get("extrovert") or data.get("extroverted"):
        result["personality"] = "extrovert"
    elif data.get("introvert") or data.get("introverted"):
        result["personality"] = "introvert"
    else:
        result["personality"] = data.get("personality", "")

    # Residence (capitalize properly)
    res = data.get("residence", "")
    result["residence"] = normalize_location(smart_title_case(res)) if res else ""

    # Build appearance object
    appearance = {}

    # Hair as nested object
    hair = data.get("hair", {})
    if isinstance(hair, dict) and hair:
        appearance["hair"] = hair
    else:
        # Build hair from individual fields if present
        hair_obj = {}
        if data.get("hair_color"):
            hair_obj["color"] = data["hair_color"]
        if data.get("hair_length"):
            hair_obj["length"] = data["hair_length"]
        if data.get("hair_style"):
            hair_obj["style"] = data["hair_style"]
        if hair_obj:
            appearance["hair"] = hair_obj

    # Eye color
    eye = data.get("eye", {})
    if isinstance(eye, dict) and eye.get("color"):
        appearance["eye_color"] = eye["color"]
    elif data.get("eye_color"):
        appearance["eye_color"] = data["eye_color"]

    # Physical features - extract tattoos into separate array
    physical_features = data.get("physical_features", "")
    if physical_features:
        if not isinstance(physical_features, list):
            physical_features = [physical_features]

        # Body part indicators that suggest a tattoo location
        # These must appear with additional context (not standalone)
        tattoo_location_words = [
            "wrist", "shoulder", "back", "rib", "hip", "arm", "leg", "ankle",
            "neck", "chest", "butt", "thigh", "calf", "foot", "hand", "finger",
            "forearm", "bicep", "tricep", "spine", "collarbone", "sternum"
        ]
        # Location modifiers
        location_modifiers = ["behind", "inner", "outer", "left", "right", "lower", "upper", "across"]

        def clean_tattoo_text(text: str) -> str:
            """Clean up tattoo description text."""
            cleaned = text.strip()

            # Only strip quotes if they're unmatched outer quotes
            # Check for unmatched leading quote
            if cleaned.startswith('"') and cleaned.count('"') % 2 == 1:
                cleaned = cleaned[1:].strip()
            if cleaned.startswith("'") and cleaned.count("'") % 2 == 1:
                cleaned = cleaned[1:].strip()

            # Check for unmatched trailing quote
            if cleaned.endswith('"') and cleaned.count('"') % 2 == 1:
                cleaned = cleaned[:-1].strip()
            if cleaned.endswith("'") and cleaned.count("'") % 2 == 1:
                cleaned = cleaned[:-1].strip()

            return cleaned

        def looks_like_tattoo(text: str) -> bool:
            """Check if text looks like a tattoo description (has location + content)."""
            text_lower = text.lower()
            # Must have a body part location
            has_body_part = any(loc in text_lower for loc in tattoo_location_words)
            # Must have more than just a location word (needs descriptive content)
            # A bare location word like "hip" should not match
            words = text_lower.split()
            if len(words) <= 1:
                return False
            # Check for location prepositions that indicate tattoo placement
            has_placement = any(prep in text_lower for prep in [" on ", " across ", " behind ", " around "])
            return has_body_part and (has_placement or len(words) >= 3)

        tattoos = []
        other_features = []
        in_tattoo_section = False
        saw_bare_tattoos = False

        for item in physical_features:
            if not isinstance(item, str):
                other_features.append(item)
                continue

            item_lower = item.lower()

            # Check if this item starts a tattoo section
            if item_lower.startswith("tattoo"):
                in_tattoo_section = True
                # Handle "tattoo(s) and X" compound items
                # e.g., "tattoo and piercings" -> tattoos (generic) + "piercings" in features
                if " and " in item_lower:
                    tattoo_part, _, other_part = item.lower().partition(" and ")
                    other_part = other_part.strip()
                    if other_part and "tattoo" not in other_part:
                        tattoos.append("tattoos")
                        other_features.append(other_part)
                        continue
                # Extract the tattoo description after "tattoos including" or similar
                if "including" in item_lower:
                    # e.g., "tattoos including "Ohm" symbol on left wrist"
                    parts = item.split("including", 1)
                    if len(parts) > 1 and parts[1].strip():
                        cleaned = clean_tattoo_text(parts[1])
                        if cleaned:
                            tattoos.append(cleaned)
                elif ":" in item:
                    # e.g., "tattoos: rose on shoulder"
                    parts = item.split(":", 1)
                    if len(parts) > 1 and parts[1].strip():
                        cleaned = clean_tattoo_text(parts[1])
                        if cleaned:
                            tattoos.append(cleaned)
                elif item_lower not in ("tattoo", "tattoos"):
                    # Full tattoo description like "tattoo down spine"
                    tattoos.append(item)
                else:
                    # Bare "tattoos" word - remember we saw it but don't add yet
                    # (will add after loop if no other tattoo descriptions found)
                    saw_bare_tattoos = True
                continue

            # Check if item contains "tattoo" anywhere (e.g., "sleeve tattoo", "3 tattoos")
            if "tattoo" in item_lower:
                # Check for compound items like "nose piercing and tattoos"
                if " and tattoo" in item_lower:
                    # Split: everything before "and tattoo" goes to physical_features
                    parts = item.lower().split(" and tattoo")
                    other_part = parts[0].strip()
                    if other_part:
                        other_features.append(other_part)
                    # Note that they have tattoos (generic mention)
                    tattoos.append("tattoos")
                else:
                    # This is a tattoo description, add it
                    cleaned = clean_tattoo_text(item)
                    if cleaned and len(cleaned) > 2:
                        tattoos.append(cleaned)
                continue

            # If we're in a tattoo section, check if this looks like a tattoo
            if in_tattoo_section:
                # Exclude scars/piercings - these are physical features, not tattoos
                if item_lower.startswith("scar") or item_lower.startswith("piercing"):
                    in_tattoo_section = False
                else:
                    # Check if it's a quote continuation (starts with quote) - likely a tattoo text
                    is_quote = item.startswith('"') or item.startswith("'") or item.startswith('\u201c')

                    if is_quote or looks_like_tattoo(item):
                        cleaned = clean_tattoo_text(item)
                        if cleaned and len(cleaned) > 2:  # Avoid single chars or tiny fragments
                            tattoos.append(cleaned)
                        continue
                    else:
                        # Doesn't look like a tattoo, exit tattoo section
                        in_tattoo_section = False

            # Not a tattoo item
            other_features.append(item)

        # If we saw bare "tattoos" but no actual descriptions, preserve the generic marker
        if saw_bare_tattoos and not tattoos:
            tattoos.append("tattoos")
        if tattoos:
            appearance["tattoos"] = tattoos
        if other_features:
            appearance["physical_features"] = other_features

    # Also check for top-level "tattoos" key (from mega-key extraction)
    top_level_tattoos = data.get("tattoos", [])
    if top_level_tattoos:
        if isinstance(top_level_tattoos, str):
            top_level_tattoos = [top_level_tattoos]
        if "tattoos" in appearance:
            # Merge with existing tattoos from physical_features extraction
            appearance["tattoos"].extend(top_level_tattoos)
        else:
            appearance["tattoos"] = top_level_tattoos

    # Body type
    if data.get("body_type"):
        appearance["body_type"] = data["body_type"]

    # Cup size
    if data.get("cup_size"):
        appearance["cup_size"] = data["cup_size"]

    # Dress size (extra field in appearance)
    if data.get("dress_size"):
        appearance["dress_size"] = data["dress_size"]

    # Height (extra field in appearance)
    if data.get("height"):
        appearance["height"] = data["height"]

    # Shoe size (extra field in appearance)
    if data.get("shoe_size"):
        appearance["shoe_size"] = data["shoe_size"]

    if appearance:
        result["appearance"] = appearance

    # Build favorites object (from favorite nested object)
    favorites = data.get("favorite", data.get("favorites", {}))
    if isinstance(favorites, dict) and favorites:
        # Normalize favorite key names and apply title case to values
        # (ensures consistency between compound-key and mega-array extraction paths)
        fav_key_renames = {
            "tvshow": "tv_show", "sport": "sports", "band": "singer",
            "music": "singer", "travel_destinations": "travel_destination",
            "drink": "beverage", "series": "tv_show", "singer_or_band": "singer", "clothing_brand": "brand",
            "games": "game", "video_game": "game"
        }
        # Keys where lowercase is the convention (genre names, colors)
        skip_title_case = {"movie_genre", "music_genre", "book_genre"}
        normalized_favs = {}
        for k, v in favorites.items():
            norm_k = fav_key_renames.get(k, k)
            if isinstance(v, str) and v and norm_k not in skip_title_case:
                normalized_favs[norm_k] = smart_title_case(v)
            elif isinstance(v, list) and norm_k not in skip_title_case:
                normalized_favs[norm_k] = [
                    smart_title_case(item) if isinstance(item, str) else item
                    for item in v
                ]
            else:
                normalized_favs[norm_k] = v
        result["favorites"] = normalized_favs

        # Check for top-level favorites that should be in the nested object
        for k in ["game", "games", "video_game", "sports", "sport", "favorite_game"]:
            if data.get(k) and "game" not in normalized_favs:
                val = data.get(k)
                normalized_favs["game"] = smart_title_case(val) if isinstance(val, str) else val
    else:
        # Check for top-level favorite fields
        favs = {}
        target_map = {
            "favorite_food": "food", "favorite_beverage": "beverage",
            "favorite_game": "game", "favorite_movie": "movie",
            "favorite_color": "color", "favorite_book": "book",
            "favorite_cartoon": "cartoon", "favorite_tv_show": "tv_show",
            "favorite_singer": "singer", "favorite_celebrity": "celebrity",
            "favorite_flowers": "flowers", "favorite_sports": "sports",
            "favorite_brand": "brand", "favorite_holiday": "holiday",
            "favorite_travel_destination": "travel_destination"
        }
        for k, target in target_map.items():
            if data.get(k):
                val = data[k]
                favs[target] = smart_title_case(val) if isinstance(val, str) else val
        result["favorites"] = favs

    # Build sexual_preferences object
    sexual_preferences = {}

    # Positions from sex.position or top-level position or favorites.sex_positions
    sex = data.get("sex", {})
    fav_obj = data.get("favorite", data.get("favorites", {}))

    positions = []
    if isinstance(sex, dict) and sex.get("position"):
        p = sex["position"]
        positions.extend(p if isinstance(p, list) else [p])

    # Check top-level and favorite-nested variants
    for k in ["position", "sex_position", "sex_positions", "favorite_sex_positions"]:
        val = data.get(k) or fav_obj.get(k)
        if val:
            positions.extend(val if isinstance(val, list) else [val])

    if positions:
        sexual_preferences["positions"] = positions

    # Toys
    toys = []
    if isinstance(sex, dict) and sex.get("toy"):
        t = sex["toy"]
        toys.extend(t if isinstance(t, list) else [t])

    for k in ["toy", "sex_toy", "sex_toys", "favorite_sex_toys"]:
        val = data.get(k) or fav_obj.get(k)
        if val:
            toys.extend(val if isinstance(val, list) else [val])

    if toys:
        sexual_preferences["toys"] = toys

    # Kinks
    kinks = []
    if data.get("kink"):
        k = data["kink"]
        kinks.extend(k if isinstance(k, list) else [k])
    if fav_obj.get("kink") or fav_obj.get("kinks"):
        k = fav_obj.get("kink") or fav_obj.get("kinks")
        kinks.extend(k if isinstance(k, list) else [k])

    if kinks:
        sexual_preferences["kinks"] = kinks

    # Porn genres
    porn_genres = []
    porn = data.get("porn", {})
    if isinstance(porn, dict) and porn.get("genre"):
        g = porn["genre"]
        porn_genres.extend(g if isinstance(g, list) else [g])

    for k in ["porn_genre", "porn_genres", "favorite_porn_genres"]:
        val = data.get(k) or fav_obj.get(k)
        if val:
            porn_genres.extend(val if isinstance(val, list) else [val])

    if porn_genres:
        sexual_preferences["porn_genres"] = porn_genres

    # Fantasy
    if isinstance(sex, dict) and sex.get("fantasy"):
        sexual_preferences["fantasy"] = sex["fantasy"]
    elif data.get("sex_fantasy"):
        sexual_preferences["fantasy"] = data["sex_fantasy"]

    # Additional sexual preference fields
    if data.get("favorite_place_to_have_sex"):
        sexual_preferences["favorite_place_to_have_sex"] = data["favorite_place_to_have_sex"]
    if data.get("wildest_place") or data.get("most_surprising_place"):
        sexual_preferences["wildest_place"] = data.get("wildest_place") or data.get("most_surprising_place")
    if data.get("one_favorite_sexual_fantasy"):
        sexual_preferences["one_favorite_sexual_fantasy"] = data["one_favorite_sexual_fantasy"]

    # Clean category prefixes from positions, toys, and porn_genres values
    if "positions" in sexual_preferences:
        sexual_preferences["positions"] = [
            re.sub(r"^sex position\s+", "", p, flags=re.IGNORECASE) if isinstance(p, str) else p
            for p in sexual_preferences["positions"]
        ]
    if "toys" in sexual_preferences:
        sexual_preferences["toys"] = [
            re.sub(r"^sex toy\s+", "", t, flags=re.IGNORECASE) if isinstance(t, str) else t
            for t in sexual_preferences["toys"]
        ]
    if "porn_genres" in sexual_preferences:
        sexual_preferences["porn_genres"] = [
            re.sub(r"^porn genre\s+", "", g, flags=re.IGNORECASE) if isinstance(g, str) else g
            for g in sexual_preferences["porn_genres"]
        ]

    if sexual_preferences:
        result["sexual_preferences"] = sexual_preferences

    # Copy remaining basic fields (normalize types)
    hobbies = data.get("hobbies", [])
    result["hobbies"] = [hobbies] if isinstance(hobbies, str) and hobbies else hobbies
    dislikes = data.get("dislikes", [])
    result["dislikes"] = [dislikes] if isinstance(dislikes, str) and dislikes else dislikes
    result["biggest_dream"] = data.get("biggest_dream", "")

    # Merge biographical milestone keys into interesting_facts
    facts = []
    milestone_keys = ("filmed_my", "walked_the", "first_started")
    for mk in milestone_keys:
        if data.get(mk):
            fact = f"{mk.replace('_', ' ')} {data[mk]}"
            facts.append(fact)
    # Normalize interesting_fact (singular) into interesting_facts array
    singular_fact = data.get("interesting_fact", "")
    if singular_fact:
        if isinstance(singular_fact, list):
            facts.extend(singular_fact)
        else:
            facts.append(singular_fact)
    # Also include any existing interesting_facts from data
    existing_facts = data.get("interesting_facts", [])
    if existing_facts:
        if isinstance(existing_facts, list):
            facts.extend(existing_facts)
        else:
            facts.append(existing_facts)
    if facts:
        result["interesting_facts"] = facts

    # Normalize children → kids (always boolean)
    kids = data.get("kids", False)
    if kids == "" or kids is None:
        kids = False
    if not kids and "children" in data:
        kids = bool(data["children"])
    if not kids and "no_children" in data:
        kids = not bool(data["no_children"])
    if not kids and data.get("no_kids") is True:
        kids = False
    result["kids"] = bool(kids)

    # Merge career_experience into backstory
    backstory = data.get("backstory", "")
    career_exp = data.get("career_experience", "")
    if career_exp:
        if backstory:
            backstory = f"{backstory}. {career_exp}" if not backstory.endswith(".") else f"{backstory} {career_exp}"
        else:
            backstory = career_exp
    result["backstory"] = backstory

    result["personal_experience"] = data.get("personal_experience", "")
    gp = data.get("guilty_pleasure", "")
    result["guilty_pleasure"] = gp if isinstance(gp, list) else ([gp] if gp else [])
    result["love_language"] = data.get("love_language", "")
    habits = data.get("habits", [])
    result["habits"] = [habits] if isinstance(habits, str) and habits else habits
    result["phobia"] = data.get("phobia", [])
    if not result["phobia"] and data.get("phobias"):
        phobias_val = data.get("phobias")
        result["phobia"] = phobias_val if isinstance(phobias_val, list) else [phobias_val]

    # Residence (handle place_of_living)
    if not result.get("residence"):
        res = data.get("place_of_living", data.get("lives", ""))
        if res:
            result["residence"] = normalize_location(smart_title_case(res))

    # Handle hair_texture field if it was nested into hair.texture
    if "appearance" in result and "hair" in result["appearance"]:
        hair = result["appearance"]["hair"]
        if not hair.get("style") and hair.get("texture"):
            hair["style"] = hair.pop("texture")

    # Add extra fields not in the main structure (alphabetically)
    extra_fields = {}

    # Fields to skip (already processed or transformed)
    skip_fields = {
        "VoiceProvider", "VoiceID", "bio", "description", "female", "male", "pansexual", "bisexual",
        "straight", "heterosexual", "female_elf", "woman", "man",
        "age", "relationship_status", "birthplace", "occupation",
        "current_job", "ethnicity", "hair", "hair_color", "hair_length", "hair_style",
        "eye", "eye_color", "eye_description", "physical_features", "body_type",
        "cup_size", "dress_size", "height", "shoe_size", "favorite", "favorites", "sex", "kink",
        "porn", "hobbies", "dislikes", "biggest_dream",
        "favorite_place_to_have_sex", "wildest_place",
        "one_favorite_sexual_fantasy", "sex_fantasy", "position", "sex_position", "tattoos",
        "masturbation", "most_surprising_place", "sex_positions", "sex_toy", "sex_toys",
        "favorite_sex_positions", "favorite_sex_toys", "favorite_porn_genres",
        "filmed_my", "walked_the", "first_started",  # biographical milestones → interesting_facts
        "single", "married", "marital_status_single", "marital_status_married", # consumed into relationship_status
        "ambivert", "extrovert", "introvert", "extroverted", "introverted", # consumed into personality
        "residence", "place_of_living", "lives", # handled explicitly
        "children", "no_children", "no_kids", # normalized to kids
        "kids",  # handled explicitly
        "personality",  # handled explicitly
        "pubic_hair",  # too specific, not standardized
        "penis_size",  # too specific, not standardized
        "career_experience",  # merged into backstory
        "backstory",  # handled explicitly
        "personal_experience",  # handled explicitly
        "interesting_fact",  # normalized to interesting_facts (singular → plural)
        "interesting_facts",  # handled explicitly
        "guilty_pleasure",  # handled explicitly
        "love_language",  # handled explicitly
        "habits",  # handled explicitly
        "phobia", "phobias", # handled explicitly
        "game", "games", "video_game", "favorite_game", # handled in favorites
    }

    for key, value in data.items():
        if key not in skip_fields:
            extra_fields[key] = value

    # Add extra fields
    for key in sorted(extra_fields.keys()):
        result[key] = extra_fields[key]

    # DEDUPLICATE all list fields
    def deduplicate_lists(obj):
        if isinstance(obj, dict):
            for k, v in obj.items():
                if isinstance(v, list):
                    # deduplicate list of strings/ints while preserving order
                    seen = set()
                    new_list = []
                    for item in v:
                        # Convert item to a hashable form for comparison
                        item_key = str(item).lower().strip() if isinstance(item, str) else str(item)
                        if item_key not in seen:
                            seen.add(item_key)
                            new_list.append(item)
                    obj[k] = new_list
                elif isinstance(v, dict):
                    deduplicate_lists(v)

    deduplicate_lists(result)

    return result


def _deep_merge(schema: dict, data: dict) -> dict:
    """Recursively merge data onto schema, preserving schema key order and defaults."""
    import copy
    result = copy.deepcopy(schema)
    for key, value in data.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def order_dict(data: dict) -> dict:
    """
    Merge data onto MASTER_SCHEMA so every output has the same key structure.
    Missing keys get default empty values from the schema. Dict insertion order
    from MASTER_SCHEMA defines field ordering. Emojis are stripped from all
    string values.
    """
    merged = _deep_merge(MASTER_SCHEMA, data)
    return _strip_emojis_deep(merged)


def transform_xena_to_schema(data: dict) -> dict:
    """Special transformation for xena's unique prose-style format."""
    result = {}

    # Basic fields
    result["VoiceProvider"] = data.get("VoiceProvider", "ElevenLabs") or "ElevenLabs"
    result["VoiceID"] = data.get("VoiceID", "")
    result["bio"] = data.get("bio", "")

    # Gender and orientation
    if data.get("female"):
        result["gender"] = "female"
    else:
        result["gender"] = ""

    if data.get("pansexual"):
        result["sexual_orientation"] = "pansexual"
    elif data.get("bisexual"):
        result["sexual_orientation"] = "bisexual"
    elif data.get("straight"):
        result["sexual_orientation"] = "straight"
    else:
        result["sexual_orientation"] = ""

    # Convert age to number if valid
    age = data.get("age", "Prefer not to say")
    if isinstance(age, str) and age.isdigit():
        result["age"] = int(age)
    else:
        result["age"] = age
    result["relationship_status"] = data.get("relationship_status", "")
    if not result["relationship_status"] and data.get("single") is True:
        result["relationship_status"] = "single"
    result["birthplace"] = ""  # Not specified for xena
    result["current_job"] = data.get("current_role", "")
    result["ethnicity"] = ""  # Not specified for xena

    # Build appearance from descriptive fields
    appearance = {}

    # Hair - not specified
    appearance["hair"] = {}

    # Eye color - not specified
    appearance["eye_color"] = ""

    # Physical features from "physically_battle-hardened": "with visible scars"
    physical_desc = data.get("physically_battle-hardened", "")
    if physical_desc:
        # Extract "visible scars" from "with visible scars"
        if "visible scars" in physical_desc.lower():
            appearance["physical_features"] = ["battle-hardened", "visible scars"]
        else:
            appearance["physical_features"] = ["battle-hardened", physical_desc]

    # Body type from "athletic_and": "powerful body type"
    body_desc = data.get("athletic_and", "")
    if "powerful" in body_desc.lower():
        appearance["body_type"] = "athletic and powerful"
    elif body_desc:
        appearance["body_type"] = f"athletic and {body_desc}"

    if appearance:
        result["appearance"] = appearance

    # Favorites - xena doesn't have traditional favorites
    result["favorites"] = {}

    # Sexual preferences from kink
    sexual_preferences = {}
    kinks = data.get("kink", [])
    if kinks:
        # Clean up the kink list (some have "and" as separate items)
        cleaned_kinks = []
        i = 0
        while i < len(kinks):
            item = kinks[i]
            if isinstance(item, str):
                # Skip standalone "and"
                if item.strip().lower() == "and":
                    i += 1
                    continue
                # Join items that start with "and "
                if item.strip().lower().startswith("and "):
                    item = item[4:].strip()
                # Check if next item should be joined
                if i + 1 < len(kinks) and isinstance(kinks[i + 1], str):
                    next_item = kinks[i + 1].strip()
                    # Patterns that should be joined: "dominance" + "and control"
                    if next_item.lower().startswith("and "):
                        cleaned_kinks.append(f"{item} {next_item}")
                        i += 2
                        continue
                cleaned_kinks.append(item)
            i += 1
        sexual_preferences["kinks"] = cleaned_kinks if cleaned_kinks else kinks

    if sexual_preferences:
        result["sexual_preferences"] = sexual_preferences

    # Hobbies - extract from descriptive fields
    hobbies = []
    if data.get("finds_calm"):
        calm = data["finds_calm"]
        if "physical exertion" in calm.lower():
            hobbies.append("physical training")
        if "solitary rides" in calm.lower():
            hobbies.append("horseback riding")
    if data.get("keeps_her"):
        keeps = data["keeps_her"]
        if "weapons" in keeps.lower():
            hobbies.append("weapon maintenance")
    result["hobbies"] = hobbies

    # Dislikes - not explicitly specified
    result["dislikes"] = []

    # Biggest dream - not specified
    result["biggest_dream"] = ""

    # Build personality from descriptive fields
    personality = []
    if data.get("dominant_and"):
        personality.append("dominant")
        if "commanding" in data["dominant_and"].lower():
            personality.append("commanding")
    if data.get("emotionally_guarded"):
        personality.append("emotionally guarded")
        if "loyal" in data["emotionally_guarded"].lower():
            personality.append("deeply loyal")
    if data.get("highly_intelligent"):
        personality.append("highly intelligent")
        if "tactical" in data["highly_intelligent"].lower():
            personality.append("tactically minded")
    if data.get("known_for"):
        known = data["known_for"]
        if "wit" in known.lower():
            personality.append("sharp wit")
        if "humor" in known.lower():
            personality.append("dry humor")
    if data.get("carries_herself"):
        personality.append("natural authority")
    if personality:
        result["personality"] = personality

    # Build backstory from descriptive fields
    backstory_parts = []
    if data.get("former_conqueror"):
        backstory_parts.append(f"Former conqueror {data['former_conqueror']}")
    if data.get("learned_leadership"):
        backstory_parts.append(f"Learned leadership {data['learned_leadership']}")
    if data.get("past_marked"):
        past = data["past_marked"]
        if isinstance(past, list):
            backstory_parts.append(f"Past marked {' '.join(past)}")
        else:
            backstory_parts.append(f"Past marked {past}")
    if backstory_parts:
        result["backstory"] = ". ".join(backstory_parts) + "."

    # Likes from "drawn_to"
    drawn_to = data.get("drawn_to", [])
    if drawn_to:
        likes = []
        for item in drawn_to:
            if isinstance(item, str):
                # Clean up "and emotional honesty" -> "emotional honesty"
                if item.strip().lower().startswith("and "):
                    item = item[4:].strip()
                likes.append(item)
        result["likes"] = likes

    # Interesting facts
    facts = []
    if data.get("interesting_facts"):
        facts.append(data["interesting_facts"])
    if data.get("fluent_in"):
        facts.append(f"Fluent in {data['fluent_in']}")
    # Merge biographical milestone keys (e.g., "filmed_my": "first movie in 2004")
    milestone_keys = ("filmed_my", "walked_the", "first_started")
    for mk in milestone_keys:
        if data.get(mk):
            fact = f"{mk.replace('_', ' ')} {data[mk]}"
            facts.append(fact)
    if facts:
        result["interesting_facts"] = facts

    # Other fields
    result["kids"] = data.get("kids", False)
    result["residence"] = data.get("residence", "")

    # Values
    values = data.get("values_discipline", [])
    if values:
        cleaned = []
        for v in values:
            if isinstance(v, str):
                if v.strip().lower().startswith("and "):
                    v = v[4:].strip()
                if v.strip().lower() != "and":
                    cleaned.append(v)
        if cleaned:
            result["values"] = ["discipline"] + cleaned

    return result


def main():
    # Accept optional directory argument, default to current directory
    if len(sys.argv) > 1:
        bios_dir = Path(sys.argv[1]).resolve()
    else:
        bios_dir = Path.cwd()

    if not bios_dir.is_dir():
        print(f"Error: {bios_dir} is not a directory")
        return

    # Find all metadata.json files (excluding already fixed ones)
    json_files = [
        f for f in bios_dir.glob("*_metadata.json")
        if "[fixed]" not in f.name
    ]

    if not json_files:
        print(f"No metadata JSON files found in {bios_dir}")
        return

    print(f"Found {len(json_files)} metadata files to process in {bios_dir}")

    # Process all files
    for filepath in sorted(json_files):
        # First fix the raw issues
        fixed_data = process_file(filepath, bios_dir)

        # Calculate relative output path for display
        rel_path = filepath.relative_to(bios_dir)

        if "xena" in filepath.name.lower():
            # Transform xena's unique format to standard schema
            transformed = transform_xena_to_schema(fixed_data)
            ordered = order_dict(transformed)

            stem = filepath.stem
            output_path = filepath.parent / f"{stem}_[fixed].json"
            with open(output_path, "w", encoding="utf-8") as f:
                json.dump(ordered, f, indent=2, ensure_ascii=False)
            output_rel = output_path.relative_to(bios_dir)
            print(f"  Wrote: {output_rel} (xena - transformed to standard schema)")
            continue

        # Transform to new schema structure
        transformed = transform_to_new_schema(fixed_data)

        # Order fields properly
        ordered = order_dict(transformed)

        # Write the file
        stem = filepath.stem
        output_path = filepath.parent / f"{stem}_[fixed].json"
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(ordered, f, indent=2, ensure_ascii=False)
        output_rel = output_path.relative_to(bios_dir)
        print(f"  Wrote: {output_rel}")

    print("\nDone!")


def process_stdin():
    """Read JSON from stdin, process it, and write result to stdout.

    Expected stdin format:
        { "bio": {...}, "tov": {...}, "name": "CharacterName" }

    Processing steps:
        1. Run fix_json() on the bio dict to clean malformed keys
        2. Merge tov fields into the fixed bio (with {bot_name}/{user_name}
           placeholder replacement, skipping description/bio/backstory which
           are handled as bio extraction)
        3. Extract bio text from tov via description/bio/backstory fallback
        4. Run transform_to_new_schema() on the merged dict
        5. Run order_dict() to normalize field ordering
        6. Write result JSON to stdout
    """
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"Invalid JSON input: {e}"}), file=sys.stderr)
        sys.exit(1)

    bio = payload.get("bio") or {}
    tov = payload.get("tov") or {}
    name = payload.get("name", "")

    # Step 1: Fix malformed keys in bio
    if bio and isinstance(bio, dict):
        bio = fix_json(bio)

    # Step 2: Extract bio text from tov using the full batch_fix_metadata logic.
    # Handles: description/bio/backstory keys, malformed tov where bio text is
    # stored as a KEY name (underscores as spaces, array values as continuation),
    # {bot_name}/{user_name} placeholder replacement, and emoji removal.
    tov_bio = None
    if isinstance(tov, dict) and tov:
        description = tov.get("description", "") or tov.get("bio", "") or tov.get("backstory", "")

        # If no standard key, check for malformed format where bio is a key name
        if not description:
            for key in tov:
                if "{bot_name}" in key or len(key) > 80:
                    # Reconstruct text from key name (underscores -> spaces) + array values
                    text = key.replace("{bot_name}", "\x00BOTNAME\x00")
                    text = text.replace("_", " ")
                    text = text.replace("\x00BOTNAME\x00", "{bot_name}")
                    text = text.replace(" ,", ",").replace("  ", " ")
                    val = tov[key]
                    if isinstance(val, list) and val:
                        continuation_parts = [
                            item.strip() for item in val
                            if isinstance(item, str) and item.strip()
                        ]
                        if continuation_parts:
                            text = text.rstrip(".") + ". " + " ".join(continuation_parts)
                    description = text
                    break

        if description:
            bio_text = re.sub(r"(?i)\{bot_name\}", name, description)
            bio_text = re.sub(r"(?i)\{user_name\}", "you", bio_text)
            tov_bio = remove_emojis(bio_text)

    # Step 3: Merge tov fields into bio (skip description/bio/backstory —
    # those are handled via tov_bio extraction above)
    skip_tov_keys = {"description", "bio", "backstory"}
    if isinstance(tov, dict):
        for key, val in tov.items():
            if key in skip_tov_keys:
                continue
            if val is None:
                continue
            if key not in bio:
                # Replace {bot_name}/{user_name} placeholders in string values
                if isinstance(val, str):
                    val = re.sub(r"\{bot_name\}", name, val, flags=re.IGNORECASE)
                    val = re.sub(r"\{user_name\}", "you", val, flags=re.IGNORECASE)
                bio[key] = val

    # Step 4: If no bio field exists, inject from tov extraction
    if tov_bio and "bio" not in bio and "description" not in bio:
        bio["bio"] = tov_bio

    # Step 5: Transform to production schema and order
    transformed = transform_to_new_schema(bio)
    ordered = order_dict(transformed)

    # Write result to stdout
    json.dump(ordered, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")


if __name__ == "__main__":
    if "--stdin" in sys.argv:
        process_stdin()
    else:
        main()
