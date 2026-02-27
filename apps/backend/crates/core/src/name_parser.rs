//! Character name parser for the ingest pipeline (PRD-113).
//!
//! Converts folder names (e.g. `aj_riley`, `mr_simons`, `tesa_von_doom`) into
//! properly formatted character names with a confidence score.

use serde::{Deserialize, Serialize};

/// Result of parsing a single character name from a folder or text input.
#[derive(Debug, Clone, Serialize)]
pub struct ParsedName {
    /// The original input string.
    pub original: String,
    /// The formatted character name.
    pub parsed: String,
    /// Confidence in the parsed result.
    pub confidence: NameConfidence,
}

/// Confidence level for a parsed name.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NameConfidence {
    High,
    Medium,
    Low,
}

impl NameConfidence {
    /// Return the string representation matching the DB CHECK constraint.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::High => "high",
            Self::Medium => "medium",
            Self::Low => "low",
        }
    }
}

/// Common salutations / titles that should be title-cased but not uppercased.
const SALUTATIONS: &[&str] = &["mr", "mrs", "ms", "dr", "prof", "sir", "dame", "rev"];

/// Name particles that are lowercase when not the first word.
const NAME_PARTICLES: &[&str] = &[
    "von", "van", "de", "di", "la", "le", "el", "al", "du", "des",
];

/// Parse a single character name from a folder name or text input.
///
/// Applies these rules:
/// 1. Trim, replace underscores/hyphens with spaces, collapse whitespace
/// 2. For each word:
///    - Salutation: capitalize first letter only (Mr, Dr)
///    - Name particle: lowercase if not first word, capitalize if first
///    - 2-letter all-lowercase: UPPERCASE (initials, e.g. "aj" -> "AJ")
///    - Otherwise: title case
/// 3. Confidence:
///    - Low: empty, single char, purely numeric
///    - Medium: contains digits mixed with letters
///    - High: everything else
pub fn parse_character_name(folder_name: &str) -> ParsedName {
    let original = folder_name.to_string();
    let cleaned = folder_name.trim().replace('_', " ").replace('-', " ");

    // Collapse multiple spaces.
    let words: Vec<&str> = cleaned.split_whitespace().collect();

    if words.is_empty() {
        return ParsedName {
            original,
            parsed: String::new(),
            confidence: NameConfidence::Low,
        };
    }

    let confidence = determine_confidence(&words);

    let formatted: Vec<String> = words
        .iter()
        .enumerate()
        .map(|(i, word)| format_word(word, i == 0))
        .collect();

    let parsed = formatted.join(" ");

    ParsedName {
        original,
        parsed,
        confidence,
    }
}

/// Parse multiple character names at once.
pub fn parse_character_names(folder_names: &[&str]) -> Vec<ParsedName> {
    folder_names
        .iter()
        .map(|n| parse_character_name(n))
        .collect()
}

/// Determine the confidence level based on the word list.
fn determine_confidence(words: &[&str]) -> NameConfidence {
    let joined: String = words.join("");

    // Purely numeric.
    if joined.chars().all(|c| c.is_ascii_digit()) {
        return NameConfidence::Low;
    }

    // Single character.
    if joined.len() == 1 {
        return NameConfidence::Low;
    }

    // Mixed digits and letters.
    let has_letters = joined.chars().any(|c| c.is_alphabetic());
    let has_digits = joined.chars().any(|c| c.is_ascii_digit());
    if has_letters && has_digits {
        return NameConfidence::Medium;
    }

    NameConfidence::High
}

/// Format a single word according to the naming rules.
fn format_word(word: &str, is_first: bool) -> String {
    let lower = word.to_lowercase();

    // Check if it is a salutation.
    if SALUTATIONS.contains(&lower.as_str()) {
        return title_case(&lower);
    }

    // Check if it is a name particle.
    if NAME_PARTICLES.contains(&lower.as_str()) {
        return if is_first { title_case(&lower) } else { lower };
    }

    // 2-letter all-lowercase -> initials (uppercase).
    if word.len() == 2 && word.chars().all(|c| c.is_ascii_lowercase()) {
        return word.to_uppercase();
    }

    // Default: title case.
    title_case(&lower)
}

/// Capitalize the first letter of a string, lowercase the rest.
fn title_case(s: &str) -> String {
    let mut chars = s.chars();
    match chars.next() {
        None => String::new(),
        Some(first) => {
            let upper: String = first.to_uppercase().collect();
            upper + &chars.as_str().to_lowercase()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_initials_and_name() {
        let result = parse_character_name("aj_riley");
        assert_eq!(result.parsed, "AJ Riley");
        assert_eq!(result.confidence, NameConfidence::High);
    }

    #[test]
    fn parse_particle_at_start() {
        let result = parse_character_name("la_perla");
        assert_eq!(result.parsed, "La Perla");
        assert_eq!(result.confidence, NameConfidence::High);
    }

    #[test]
    fn parse_salutation() {
        let result = parse_character_name("mr_simons");
        assert_eq!(result.parsed, "Mr Simons");
        assert_eq!(result.confidence, NameConfidence::High);
    }

    #[test]
    fn parse_particle_in_middle() {
        let result = parse_character_name("tesa_von_doom");
        assert_eq!(result.parsed, "Tesa von Doom");
        assert_eq!(result.confidence, NameConfidence::High);
    }

    #[test]
    fn parse_single_name() {
        let result = parse_character_name("xena");
        assert_eq!(result.parsed, "Xena");
        assert_eq!(result.confidence, NameConfidence::High);
    }

    #[test]
    fn parse_three_part_name() {
        let result = parse_character_name("mary_jane_watson");
        assert_eq!(result.parsed, "Mary Jane Watson");
        assert_eq!(result.confidence, NameConfidence::High);
    }

    #[test]
    fn parse_purely_numeric() {
        let result = parse_character_name("001");
        assert_eq!(result.parsed, "001");
        assert_eq!(result.confidence, NameConfidence::Low);
    }

    #[test]
    fn parse_empty_string() {
        let result = parse_character_name("");
        assert_eq!(result.parsed, "");
        assert_eq!(result.confidence, NameConfidence::Low);
    }

    #[test]
    fn parse_hyphens() {
        let result = parse_character_name("jean-luc-picard");
        assert_eq!(result.parsed, "Jean Luc Picard");
        assert_eq!(result.confidence, NameConfidence::High);
    }

    #[test]
    fn parse_mixed_case() {
        let result = parse_character_name("JOHN_DOE");
        assert_eq!(result.parsed, "John Doe");
        assert_eq!(result.confidence, NameConfidence::High);
    }

    #[test]
    fn parse_all_caps_initials() {
        let result = parse_character_name("JB_FLETCHER");
        assert_eq!(result.parsed, "Jb Fletcher");
        assert_eq!(result.confidence, NameConfidence::High);
    }

    #[test]
    fn parse_mixed_digits_and_letters() {
        let result = parse_character_name("char123_test");
        assert_eq!(result.confidence, NameConfidence::Medium);
    }

    #[test]
    fn parse_single_char() {
        let result = parse_character_name("x");
        assert_eq!(result.parsed, "X");
        assert_eq!(result.confidence, NameConfidence::Low);
    }

    #[test]
    fn parse_whitespace_only() {
        let result = parse_character_name("   ");
        assert_eq!(result.parsed, "");
        assert_eq!(result.confidence, NameConfidence::Low);
    }

    #[test]
    fn parse_multiple_particles() {
        let result = parse_character_name("ludwig_van_de_berg");
        assert_eq!(result.parsed, "Ludwig van de Berg");
        assert_eq!(result.confidence, NameConfidence::High);
    }

    #[test]
    fn batch_parse() {
        let names = vec!["aj_riley", "mr_simons", "001"];
        let results = parse_character_names(&names);
        assert_eq!(results.len(), 3);
        assert_eq!(results[0].parsed, "AJ Riley");
        assert_eq!(results[1].parsed, "Mr Simons");
        assert_eq!(results[2].confidence, NameConfidence::Low);
    }
}
