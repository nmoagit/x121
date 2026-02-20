//! Exponential-backoff reconnection logic for ComfyUI WebSocket
//! connections.
//!
//! When the connection to a ComfyUI instance drops, the bridge should
//! call [`reconnect_loop`] to keep retrying with increasing delays
//! until either the connection is restored or the
//! [`CancellationToken`] is triggered.

use std::time::Duration;

use tokio_util::sync::CancellationToken;

use crate::client::{ComfyUIClient, ComfyUIConnection};

/// Tunable parameters for the exponential-backoff strategy.
pub struct ReconnectConfig {
    /// Delay before the first reconnection attempt.
    pub initial_delay: Duration,
    /// Upper bound on the delay between attempts.
    pub max_delay: Duration,
    /// Factor by which the delay grows after each failure.
    pub multiplier: f64,
}

impl Default for ReconnectConfig {
    fn default() -> Self {
        Self {
            initial_delay: Duration::from_secs(1),
            max_delay: Duration::from_secs(30),
            multiplier: 2.0,
        }
    }
}

/// Calculate the next backoff delay from the current delay and config.
///
/// The result is clamped to [`ReconnectConfig::max_delay`].
pub fn next_delay(current: Duration, config: &ReconnectConfig) -> Duration {
    let next_ms = (current.as_millis() as f64 * config.multiplier) as u64;
    Duration::from_millis(next_ms).min(config.max_delay)
}

/// Attempt to reconnect to a ComfyUI instance with exponential backoff.
///
/// Returns `Some(connection)` once a connection succeeds, or `None` if
/// the `cancel` token is triggered before a successful connection.
pub async fn reconnect_loop(
    client: &ComfyUIClient,
    config: &ReconnectConfig,
    cancel: &CancellationToken,
) -> Option<ComfyUIConnection> {
    let mut delay = config.initial_delay;
    let mut attempt = 0u32;

    loop {
        attempt += 1;
        tracing::info!(
            instance_id = client.instance_id(),
            attempt,
            delay_ms = delay.as_millis() as u64,
            "Reconnecting to ComfyUI",
        );

        tokio::select! {
            _ = cancel.cancelled() => {
                tracing::info!(
                    instance_id = client.instance_id(),
                    "Reconnect cancelled",
                );
                return None;
            }
            result = client.connect() => {
                match result {
                    Ok(conn) => {
                        tracing::info!(
                            instance_id = client.instance_id(),
                            attempt,
                            "Reconnected to ComfyUI",
                        );
                        return Some(conn);
                    }
                    Err(e) => {
                        tracing::warn!(
                            instance_id = client.instance_id(),
                            error = %e,
                            "Reconnect attempt {attempt} failed",
                        );
                    }
                }
            }
        }

        // Wait before the next attempt, respecting cancellation.
        tokio::select! {
            _ = cancel.cancelled() => return None,
            _ = tokio::time::sleep(delay) => {}
        }

        delay = next_delay(delay, config);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn next_delay_doubles() {
        let config = ReconnectConfig::default();
        let d = next_delay(Duration::from_secs(1), &config);
        assert_eq!(d, Duration::from_secs(2));
    }

    #[test]
    fn next_delay_clamps_at_max() {
        let config = ReconnectConfig {
            max_delay: Duration::from_secs(10),
            ..Default::default()
        };
        let d = next_delay(Duration::from_secs(8), &config);
        assert_eq!(d, Duration::from_secs(10));
    }

    #[test]
    fn next_delay_already_at_max() {
        let config = ReconnectConfig {
            max_delay: Duration::from_secs(30),
            ..Default::default()
        };
        let d = next_delay(Duration::from_secs(30), &config);
        assert_eq!(d, Duration::from_secs(30));
    }

    #[test]
    fn custom_multiplier() {
        let config = ReconnectConfig {
            multiplier: 3.0,
            max_delay: Duration::from_secs(60),
            ..Default::default()
        };
        let d = next_delay(Duration::from_secs(2), &config);
        assert_eq!(d, Duration::from_secs(6));
    }

    #[test]
    fn full_backoff_sequence() {
        let config = ReconnectConfig::default();
        let mut delay = config.initial_delay;
        let expected = [1, 2, 4, 8, 16, 30, 30, 30];

        for &expected_secs in &expected {
            assert_eq!(delay.as_secs(), expected_secs);
            delay = next_delay(delay, &config);
        }
    }

    #[tokio::test]
    async fn cancellation_token_stops_reconnect() {
        let cancel = CancellationToken::new();
        // Cancel immediately — reconnect_loop should return None without trying to connect
        cancel.cancel();

        let client = ComfyUIClient::new(1, "ws://localhost:9999".into(), "http://localhost:9999".into());
        let config = ReconnectConfig::default();

        let result = reconnect_loop(&client, &config, &cancel).await;
        assert!(result.is_none());
    }
}
