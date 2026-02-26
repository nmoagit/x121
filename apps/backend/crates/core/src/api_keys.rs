//! API key generation, hashing, and webhook HMAC signing utilities (PRD-12).
//!
//! This module lives in `core` (zero internal deps) so it can be used by both
//! the API/repository layer and any future worker or CLI tooling.

use hmac::{Hmac, Mac};
use rand::Rng;
use sha2::Sha256;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Length of the generated API key string (alphanumeric characters).
pub const KEY_LENGTH: usize = 48;

/// Number of leading characters stored as a human-visible prefix.
pub const KEY_PREFIX_LENGTH: usize = 8;

/// Default requests-per-minute limit for read operations.
pub const DEFAULT_RATE_LIMIT_READ: i32 = 100;

/// Default requests-per-minute limit for write operations.
pub const DEFAULT_RATE_LIMIT_WRITE: i32 = 20;

/// Maximum retry attempts for webhook deliveries.
pub const MAX_WEBHOOK_DELIVERY_ATTEMPTS: i16 = 3;

/// Maximum backoff delay in seconds for webhook retries.
pub const MAX_WEBHOOK_BACKOFF_SECS: i64 = 3600;

// ---------------------------------------------------------------------------
// Scope name constants
// ---------------------------------------------------------------------------

/// Known API key scope names matching the `api_key_scopes` seed data.
pub mod scopes {
    pub const READ_ONLY: &str = "read_only";
    pub const PROJECT_READ: &str = "project_read";
    pub const FULL_ACCESS: &str = "full_access";
    pub const PROJECT_FULL: &str = "project_full";
}

// ---------------------------------------------------------------------------
// API key generation
// ---------------------------------------------------------------------------

/// The result of generating a new API key.
pub struct GeneratedApiKey {
    /// The plaintext key (shown to the user exactly once, never stored).
    pub plaintext: String,
    /// The first [`KEY_PREFIX_LENGTH`] characters of the key for display.
    pub prefix: String,
    /// The SHA-256 hex digest of the plaintext key (stored in the database).
    pub hash: String,
}

/// Generate a new random API key.
///
/// Returns the plaintext (shown once), prefix (for identification), and
/// SHA-256 hash (for storage). The plaintext must never be persisted.
pub fn generate_api_key() -> GeneratedApiKey {
    let key: String = rand::rng()
        .sample_iter(&rand::distr::Alphanumeric)
        .take(KEY_LENGTH)
        .map(char::from)
        .collect();

    let prefix = key[..KEY_PREFIX_LENGTH].to_string();
    let hash = hash_api_key(&key);

    GeneratedApiKey {
        plaintext: key,
        prefix,
        hash,
    }
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

/// Compute the SHA-256 hex digest of an API key.
///
/// Used both during key creation (to store the hash) and during
/// authentication (to look up the key by hash).
pub fn hash_api_key(key: &str) -> String {
    crate::hashing::sha256_hex(key.as_bytes())
}

/// Extract the prefix from a plaintext API key.
pub fn extract_prefix(key: &str) -> &str {
    &key[..KEY_PREFIX_LENGTH.min(key.len())]
}

// ---------------------------------------------------------------------------
// Webhook HMAC signing
// ---------------------------------------------------------------------------

type HmacSha256 = Hmac<Sha256>;

/// Compute an HMAC-SHA256 signature for a webhook payload.
///
/// The `secret` is the webhook-specific signing secret. The `payload` is the
/// JSON body being delivered. Returns the hex-encoded signature string.
pub fn compute_webhook_hmac(secret: &str, payload: &str) -> String {
    let mut mac =
        HmacSha256::new_from_slice(secret.as_bytes()).expect("HMAC accepts any key length");
    mac.update(payload.as_bytes());
    let result = mac.finalize();
    hex::encode(result.into_bytes())
}

// ---------------------------------------------------------------------------
// hex encoding helper (no extra dep)
// ---------------------------------------------------------------------------

mod hex {
    /// Encode bytes as a lowercase hex string.
    pub fn encode(bytes: impl AsRef<[u8]>) -> String {
        bytes.as_ref().iter().map(|b| format!("{b:02x}")).collect()
    }
}

// ---------------------------------------------------------------------------
// Webhook backoff computation
// ---------------------------------------------------------------------------

/// Compute the retry delay in seconds using exponential backoff.
///
/// Follows 2^attempt seconds, capped at [`MAX_WEBHOOK_BACKOFF_SECS`].
pub fn webhook_retry_delay_secs(attempt: i16) -> i64 {
    2i64.pow(attempt as u32).min(MAX_WEBHOOK_BACKOFF_SECS)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- Key generation ----------------------------------------------------

    #[test]
    fn generated_key_has_correct_length() {
        let key = generate_api_key();
        assert_eq!(key.plaintext.len(), KEY_LENGTH);
    }

    #[test]
    fn generated_key_prefix_matches_start() {
        let key = generate_api_key();
        assert_eq!(&key.plaintext[..KEY_PREFIX_LENGTH], key.prefix);
    }

    #[test]
    fn generated_key_hash_is_sha256_hex() {
        let key = generate_api_key();
        assert_eq!(key.hash.len(), 64, "SHA-256 hex digest should be 64 chars");
        assert!(
            key.hash.chars().all(|c| c.is_ascii_hexdigit()),
            "Hash should be hex characters only"
        );
    }

    #[test]
    fn hash_matches_regeneration() {
        let key = generate_api_key();
        let rehash = hash_api_key(&key.plaintext);
        assert_eq!(key.hash, rehash);
    }

    #[test]
    fn different_keys_produce_different_hashes() {
        let a = generate_api_key();
        let b = generate_api_key();
        assert_ne!(a.plaintext, b.plaintext);
        assert_ne!(a.hash, b.hash);
    }

    #[test]
    fn generated_key_is_alphanumeric() {
        let key = generate_api_key();
        assert!(
            key.plaintext.chars().all(|c| c.is_ascii_alphanumeric()),
            "Key should be purely alphanumeric"
        );
    }

    // -- Hashing -----------------------------------------------------------

    #[test]
    fn same_input_produces_same_hash() {
        let a = hash_api_key("test_key_123");
        let b = hash_api_key("test_key_123");
        assert_eq!(a, b);
    }

    #[test]
    fn different_inputs_produce_different_hashes() {
        let a = hash_api_key("key_a");
        let b = hash_api_key("key_b");
        assert_ne!(a, b);
    }

    // -- Prefix extraction -------------------------------------------------

    #[test]
    fn extract_prefix_returns_correct_substring() {
        let key = "abcdefghijklmnop";
        assert_eq!(extract_prefix(key), "abcdefgh");
    }

    #[test]
    fn extract_prefix_handles_short_key() {
        let key = "abc";
        assert_eq!(extract_prefix(key), "abc");
    }

    // -- HMAC signing ------------------------------------------------------

    #[test]
    fn hmac_produces_hex_string() {
        let sig = compute_webhook_hmac("my_secret", r#"{"event":"test"}"#);
        assert_eq!(sig.len(), 64, "HMAC-SHA256 hex should be 64 chars");
        assert!(sig.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn hmac_is_deterministic() {
        let a = compute_webhook_hmac("secret", "payload");
        let b = compute_webhook_hmac("secret", "payload");
        assert_eq!(a, b);
    }

    #[test]
    fn hmac_differs_with_different_secret() {
        let a = compute_webhook_hmac("secret_a", "payload");
        let b = compute_webhook_hmac("secret_b", "payload");
        assert_ne!(a, b);
    }

    #[test]
    fn hmac_differs_with_different_payload() {
        let a = compute_webhook_hmac("secret", "payload_a");
        let b = compute_webhook_hmac("secret", "payload_b");
        assert_ne!(a, b);
    }

    // -- Backoff computation -----------------------------------------------

    #[test]
    fn backoff_is_exponential() {
        assert_eq!(webhook_retry_delay_secs(1), 2);
        assert_eq!(webhook_retry_delay_secs(2), 4);
        assert_eq!(webhook_retry_delay_secs(3), 8);
        assert_eq!(webhook_retry_delay_secs(10), 1024);
    }

    #[test]
    fn backoff_is_capped() {
        assert_eq!(webhook_retry_delay_secs(20), MAX_WEBHOOK_BACKOFF_SECS);
    }
}
