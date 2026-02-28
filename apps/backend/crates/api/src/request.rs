//! Shared HTTP request utilities.
//!
//! Functions for extracting common information from incoming requests
//! (IP address, headers-to-JSON conversion, etc.). Used by multiple
//! handler modules.

use axum::http::HeaderMap;

/// Extract the client IP address from request headers.
///
/// Checks `X-Forwarded-For` first (taking the first entry if comma-separated),
/// then falls back to `X-Real-Ip`.
pub fn extract_ip(headers: &HeaderMap) -> Option<String> {
    headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .map(|v| v.split(',').next().unwrap_or(v).trim().to_string())
        .or_else(|| {
            headers
                .get("x-real-ip")
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string())
        })
}

/// Convert request headers into a JSON object.
///
/// Each header name becomes a key and the first valid UTF-8 value becomes the
/// string value. Non-UTF-8 values are silently skipped.
pub fn headers_to_json(headers: &HeaderMap) -> serde_json::Value {
    let mut map = serde_json::Map::new();
    for (name, value) in headers.iter() {
        if let Ok(v) = value.to_str() {
            map.insert(
                name.as_str().to_string(),
                serde_json::Value::String(v.to_string()),
            );
        }
    }
    serde_json::Value::Object(map)
}
