//! Webhook delivery with exponential-backoff retry.
//!
//! [`WebhookDelivery`] sends a JSON-encoded [`PlatformEvent`] to an external
//! URL via HTTP POST. Failed attempts are retried up to three times with
//! exponential backoff (1 s, 2 s, 4 s).

use std::time::Duration;

use crate::bus::PlatformEvent;

/// Retry delays in seconds (exponential backoff: 1s, 2s, 4s).
const RETRY_DELAYS_SECS: [u64; 3] = [1, 2, 4];

/// HTTP request timeout for a single delivery attempt.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

/// Error type for webhook delivery failures.
#[derive(Debug, thiserror::Error)]
pub enum WebhookError {
    /// The underlying HTTP request failed (network, DNS, timeout, etc.).
    #[error("HTTP request failed: {0}")]
    Request(#[from] reqwest::Error),

    /// The remote server returned a non-2xx status code.
    #[error("Webhook returned HTTP {0}")]
    HttpStatus(u16),
}

// ---------------------------------------------------------------------------
// WebhookDelivery
// ---------------------------------------------------------------------------

/// Delivers platform events to external webhook endpoints.
pub struct WebhookDelivery {
    client: reqwest::Client,
}

impl WebhookDelivery {
    /// Create a new delivery service with a pre-configured HTTP client.
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .build()
            .expect("Failed to build reqwest HTTP client");
        Self { client }
    }

    /// Deliver an event payload to a webhook URL with retry.
    ///
    /// Retries up to 3 times with exponential backoff before giving up.
    /// Returns `Ok(())` on the first successful attempt.
    pub async fn deliver(&self, url: &str, event: &PlatformEvent) -> Result<(), WebhookError> {
        let payload = serde_json::json!({
            "event_type": event.event_type,
            "payload": event.payload,
            "timestamp": event.timestamp,
            "source_entity_type": event.source_entity_type,
            "source_entity_id": event.source_entity_id,
        });

        let mut last_err: Option<WebhookError> = None;

        for (attempt, delay_secs) in RETRY_DELAYS_SECS.iter().enumerate() {
            match self.try_send(url, &payload).await {
                Ok(()) => return Ok(()),
                Err(e) => {
                    tracing::warn!(
                        attempt = attempt + 1,
                        url,
                        error = %e,
                        "Webhook delivery attempt failed, retrying"
                    );
                    last_err = Some(e);
                    tokio::time::sleep(Duration::from_secs(*delay_secs)).await;
                }
            }
        }

        // Final attempt after the last backoff.
        match self.try_send(url, &payload).await {
            Ok(()) => Ok(()),
            Err(e) => {
                tracing::error!(url, error = %e, "Webhook delivery failed after all retries");
                Err(last_err.unwrap_or(e))
            }
        }
    }

    /// Execute a single POST request and check the response status.
    async fn try_send(&self, url: &str, payload: &serde_json::Value) -> Result<(), WebhookError> {
        let response = self.client.post(url).json(payload).send().await?;
        if !response.status().is_success() {
            return Err(WebhookError::HttpStatus(response.status().as_u16()));
        }
        Ok(())
    }
}

impl Default for WebhookDelivery {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_does_not_panic() {
        let _delivery = WebhookDelivery::new();
    }

    #[test]
    fn default_does_not_panic() {
        let _delivery = WebhookDelivery::default();
    }

    #[test]
    fn webhook_error_display_http_status() {
        let err = WebhookError::HttpStatus(502);
        assert_eq!(err.to_string(), "Webhook returned HTTP 502");
    }

    #[test]
    fn webhook_error_display_request() {
        // Build a reqwest error from an invalid URL.
        let req_err = reqwest::Client::new().get("://bad").build().unwrap_err();
        let err = WebhookError::Request(req_err);
        assert!(err.to_string().contains("HTTP request failed"));
    }
}
