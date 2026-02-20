//! Well-known notification channel name constants.
//!
//! These must match the channel values stored in the `notifications.channel`
//! column and referenced by the notification router, digest scheduler, and
//! API handlers.

/// In-app notification delivered via WebSocket push and stored for the
/// notification bell UI.
pub const CHANNEL_IN_APP: &str = "in_app";

/// Digest notification queued for periodic batch delivery.
pub const CHANNEL_DIGEST: &str = "digest";

/// Webhook notification delivered to an external HTTP endpoint.
pub const CHANNEL_WEBHOOK: &str = "webhook";

/// Email notification delivered via SMTP.
pub const CHANNEL_EMAIL: &str = "email";
