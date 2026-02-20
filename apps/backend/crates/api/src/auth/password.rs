//! Argon2id password hashing, verification, and strength validation.
//!
//! All password hashes use the Argon2id variant with a cryptographically random
//! salt generated via [`OsRng`]. The PHC string format is used for storage so
//! that algorithm parameters and salt are embedded in the hash itself.

use argon2::password_hash::rand_core::OsRng;
use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;

/// Hash a plaintext password using Argon2id with a random salt.
///
/// Returns the PHC-formatted hash string (includes algorithm, params, salt, and hash).
pub fn hash_password(password: &str) -> Result<String, argon2::password_hash::Error> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default(); // Argon2id with default params
    let hash = argon2.hash_password(password.as_bytes(), &salt)?;
    Ok(hash.to_string())
}

/// Verify a plaintext password against a stored PHC-formatted Argon2id hash.
///
/// Returns `Ok(true)` if the password matches, `Ok(false)` if it does not.
pub fn verify_password(password: &str, hash: &str) -> Result<bool, argon2::password_hash::Error> {
    let parsed_hash = PasswordHash::new(hash)?;
    match Argon2::default().verify_password(password.as_bytes(), &parsed_hash) {
        Ok(()) => Ok(true),
        Err(argon2::password_hash::Error::Password) => Ok(false),
        Err(e) => Err(e),
    }
}

/// Validate that a password meets minimum strength requirements.
///
/// Currently enforces a minimum character length. Returns `Ok(())` when the
/// password is acceptable, or `Err` with a human-readable explanation.
pub fn validate_password_strength(password: &str, min_length: usize) -> Result<(), String> {
    if password.len() < min_length {
        return Err(format!(
            "Password must be at least {min_length} characters long"
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hash_and_verify() {
        let password = "correct-horse-battery-staple";
        let hash = hash_password(password).expect("hashing should succeed");

        // The hash must be a valid PHC string starting with the argon2id identifier.
        assert!(
            hash.starts_with("$argon2id$"),
            "expected argon2id PHC prefix"
        );

        let verified = verify_password(password, &hash).expect("verify should succeed");
        assert!(verified, "correct password should verify as true");
    }

    #[test]
    fn test_wrong_password_fails() {
        let hash = hash_password("real-password").expect("hashing should succeed");
        let verified = verify_password("wrong-password", &hash).expect("verify should succeed");
        assert!(!verified, "wrong password should verify as false");
    }

    #[test]
    fn test_password_too_short() {
        let result = validate_password_strength("short", 12);
        assert!(result.is_err());
        let msg = result.unwrap_err();
        assert!(
            msg.contains("at least 12 characters"),
            "error message should state the minimum length"
        );
    }

    #[test]
    fn test_password_meets_minimum() {
        // Exactly at the minimum boundary.
        let result = validate_password_strength("twelve_chars", 12);
        assert!(result.is_ok(), "password at min length should pass");

        // Above the minimum.
        let result = validate_password_strength("this-is-a-long-enough-password", 12);
        assert!(result.is_ok(), "password above min length should pass");
    }
}
