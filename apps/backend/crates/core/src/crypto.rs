//! AES-256-GCM encryption/decryption for API keys at rest (PRD-114).

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};

/// Encrypt a plaintext API key using AES-256-GCM.
///
/// Returns `(ciphertext, nonce)` where both are Vec<u8>.
/// The `master_key` must be exactly 32 bytes.
pub fn encrypt_api_key(
    plaintext: &str,
    master_key: &[u8; 32],
) -> Result<(Vec<u8>, Vec<u8>), CryptoError> {
    let cipher = Aes256Gcm::new_from_slice(master_key)
        .map_err(|e| CryptoError::KeyError(e.to_string()))?;

    let mut nonce_bytes = [0u8; 12];
    rand::fill(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| CryptoError::EncryptError(e.to_string()))?;

    Ok((ciphertext, nonce_bytes.to_vec()))
}

/// Decrypt an API key from ciphertext + nonce using AES-256-GCM.
pub fn decrypt_api_key(
    ciphertext: &[u8],
    nonce_bytes: &[u8],
    master_key: &[u8; 32],
) -> Result<String, CryptoError> {
    if nonce_bytes.len() != 12 {
        return Err(CryptoError::InvalidNonce);
    }

    let cipher = Aes256Gcm::new_from_slice(master_key)
        .map_err(|e| CryptoError::KeyError(e.to_string()))?;

    let nonce = Nonce::from_slice(nonce_bytes);

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| CryptoError::DecryptError)?;

    String::from_utf8(plaintext).map_err(|_| CryptoError::InvalidUtf8)
}

/// Parse a 32-byte master key from a hex-encoded string.
pub fn parse_master_key(hex: &str) -> Result<[u8; 32], CryptoError> {
    let hex = hex.trim();
    if hex.len() != 64 {
        return Err(CryptoError::KeyError(format!(
            "expected 64 hex chars (32 bytes), got {}",
            hex.len()
        )));
    }
    let mut key = [0u8; 32];
    for (i, chunk) in hex.as_bytes().chunks(2).enumerate() {
        let s = std::str::from_utf8(chunk).map_err(|_| CryptoError::KeyError("invalid hex".into()))?;
        key[i] = u8::from_str_radix(s, 16)
            .map_err(|_| CryptoError::KeyError(format!("invalid hex byte: {s}")))?;
    }
    Ok(key)
}

#[derive(Debug, thiserror::Error)]
pub enum CryptoError {
    #[error("Invalid key: {0}")]
    KeyError(String),

    #[error("RNG error: {0}")]
    RngError(String),

    #[error("Encryption failed: {0}")]
    EncryptError(String),

    #[error("Decryption failed (wrong key or corrupted data)")]
    DecryptError,

    #[error("Invalid nonce length (expected 12 bytes)")]
    InvalidNonce,

    #[error("Decrypted data is not valid UTF-8")]
    InvalidUtf8,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_key() -> [u8; 32] {
        let mut key = [0u8; 32];
        for (i, b) in key.iter_mut().enumerate() {
            *b = i as u8;
        }
        key
    }

    #[test]
    fn round_trip_encrypt_decrypt() {
        let key = test_key();
        let plaintext = "rp_abc123_test_api_key";

        let (ciphertext, nonce) = encrypt_api_key(plaintext, &key).unwrap();
        let decrypted = decrypt_api_key(&ciphertext, &nonce, &key).unwrap();

        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn wrong_key_fails_decrypt() {
        let key = test_key();
        let mut wrong_key = test_key();
        wrong_key[0] = 255;

        let (ciphertext, nonce) = encrypt_api_key("secret", &key).unwrap();
        let result = decrypt_api_key(&ciphertext, &nonce, &wrong_key);

        assert!(result.is_err());
    }

    #[test]
    fn invalid_nonce_length_fails() {
        let key = test_key();
        let result = decrypt_api_key(b"data", &[0u8; 5], &key);
        assert!(matches!(result, Err(CryptoError::InvalidNonce)));
    }

    #[test]
    fn parse_master_key_valid() {
        let hex = "0001020304050607080910111213141516171819202122232425262728293031";
        let result = parse_master_key(hex);
        assert!(result.is_ok());
    }

    #[test]
    fn parse_master_key_wrong_length() {
        let result = parse_master_key("abcd");
        assert!(result.is_err());
    }
}
