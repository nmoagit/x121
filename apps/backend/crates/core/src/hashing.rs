//! Shared SHA-256 hex digest utility.
//!
//! Used by `metadata`, `api_keys`, and `audit` modules to avoid duplicating
//! the same hash computation.

use sha2::{Digest, Sha256};

/// Compute a SHA-256 hex digest of the given bytes.
pub fn sha256_hex(data: &[u8]) -> String {
    let hash = Sha256::digest(data);
    format!("{hash:x}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_input_produces_known_hash() {
        let hash = sha256_hex(b"");
        assert_eq!(
            hash,
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }

    #[test]
    fn consistent_output() {
        let data = b"hello world";
        assert_eq!(sha256_hex(data), sha256_hex(data));
        assert_eq!(sha256_hex(data).len(), 64);
    }
}
