//! Asset registration logic (PRD-17).
//!
//! Pure domain functions that validate asset registration requests.
//! File I/O and database operations are performed by the caller (handler layer).

use std::path::Path;

use super::AssetError;

/// Result of validating a file path for registration.
pub struct FileInfo {
    /// File size in bytes.
    pub size_bytes: i64,
    /// Placeholder checksum (real SHA-256 would need sha2 crate).
    pub checksum: String,
}

/// Validate that the given file path exists and compute basic metadata.
///
/// Returns file size and a placeholder checksum. In production, this would
/// compute SHA-256 via `sha2::Sha256`.
pub fn validate_file(file_path: &str) -> Result<FileInfo, AssetError> {
    let path = Path::new(file_path);

    if !path.exists() {
        return Err(AssetError::FileNotFound(file_path.to_string()));
    }

    let metadata = std::fs::metadata(path)
        .map_err(|_| AssetError::FileNotFound(file_path.to_string()))?;

    let size_bytes = metadata.len() as i64;

    // Placeholder checksum -- in production use:
    // format!("{:x}", sha2::Sha256::digest(&bytes))
    let checksum = format!("placeholder-sha256-{size_bytes}");

    Ok(FileInfo {
        size_bytes,
        checksum,
    })
}

/// Validate a rating value is within the allowed range [1, 5].
pub fn validate_rating(rating: i16) -> Result<(), AssetError> {
    if !(1..=5).contains(&rating) {
        return Err(AssetError::InvalidRating(rating));
    }
    Ok(())
}
