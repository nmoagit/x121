//! Email notification delivery via SMTP.
//!
//! [`EmailDelivery`] wraps the `lettre` async SMTP transport to send plain-text
//! notification emails for platform events. Configuration is loaded from
//! environment variables; if `SMTP_HOST` is not set, [`EmailConfig::from_env`]
//! returns `None` and no mailer should be constructed.

use crate::bus::PlatformEvent;

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

/// Error type for email delivery failures.
#[derive(Debug, thiserror::Error)]
pub enum EmailError {
    /// SMTP transport-level failure (authentication, connection, etc.).
    #[error("SMTP transport error: {0}")]
    Transport(#[from] lettre::transport::smtp::Error),

    /// The recipient or sender address could not be parsed.
    #[error("Email address parse error: {0}")]
    Address(#[from] lettre::address::AddressError),

    /// The MIME message could not be assembled.
    #[error("Email build error: {0}")]
    Build(String),
}

// ---------------------------------------------------------------------------
// EmailConfig
// ---------------------------------------------------------------------------

/// Default SMTP port (STARTTLS).
const DEFAULT_SMTP_PORT: u16 = 587;

/// Default sender address when `SMTP_FROM` is not set.
const DEFAULT_FROM_ADDRESS: &str = "noreply@trulience.local";

/// Configuration for the SMTP email delivery service.
#[derive(Debug, Clone)]
pub struct EmailConfig {
    /// SMTP server hostname.
    pub smtp_host: String,
    /// SMTP server port (defaults to 587).
    pub smtp_port: u16,
    /// RFC 5322 "From" address.
    pub from_address: String,
    /// Optional SMTP username.
    pub smtp_user: Option<String>,
    /// Optional SMTP password.
    pub smtp_password: Option<String>,
}

impl EmailConfig {
    /// Load configuration from environment variables.
    ///
    /// Returns `None` if `SMTP_HOST` is not set, signalling that email
    /// delivery is not configured and should be skipped.
    ///
    /// | Variable        | Required | Default                    |
    /// |-----------------|----------|----------------------------|
    /// | `SMTP_HOST`     | yes      | —                          |
    /// | `SMTP_PORT`     | no       | `587`                      |
    /// | `SMTP_FROM`     | no       | `noreply@trulience.local`  |
    /// | `SMTP_USER`     | no       | —                          |
    /// | `SMTP_PASSWORD`  | no       | —                          |
    pub fn from_env() -> Option<Self> {
        let smtp_host = std::env::var("SMTP_HOST").ok()?;
        Some(Self {
            smtp_host,
            smtp_port: std::env::var("SMTP_PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(DEFAULT_SMTP_PORT),
            from_address: std::env::var("SMTP_FROM")
                .unwrap_or_else(|_| DEFAULT_FROM_ADDRESS.to_string()),
            smtp_user: std::env::var("SMTP_USER").ok(),
            smtp_password: std::env::var("SMTP_PASSWORD").ok(),
        })
    }
}

// ---------------------------------------------------------------------------
// EmailDelivery
// ---------------------------------------------------------------------------

/// Sends notification emails for platform events via SMTP.
pub struct EmailDelivery {
    config: EmailConfig,
}

impl EmailDelivery {
    /// Create a new email delivery service with the given configuration.
    pub fn new(config: EmailConfig) -> Self {
        Self { config }
    }

    /// Send a notification email for the given event to the specified address.
    pub async fn deliver(&self, to_email: &str, event: &PlatformEvent) -> Result<(), EmailError> {
        use lettre::{
            message::header::ContentType, transport::smtp::authentication::Credentials,
            AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
        };

        let subject = format!("[Trulience] {}", event.event_type);
        let body = format!(
            "Event: {}\nTime: {}\nDetails: {}",
            event.event_type,
            event.timestamp,
            serde_json::to_string_pretty(&event.payload).unwrap_or_default()
        );

        let email = Message::builder()
            .from(self.config.from_address.parse()?)
            .to(to_email.parse()?)
            .subject(subject)
            .header(ContentType::TEXT_PLAIN)
            .body(body)
            .map_err(|e| EmailError::Build(e.to_string()))?;

        let mut transport_builder =
            AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&self.config.smtp_host)?
                .port(self.config.smtp_port);

        if let (Some(user), Some(pass)) = (&self.config.smtp_user, &self.config.smtp_password) {
            transport_builder =
                transport_builder.credentials(Credentials::new(user.clone(), pass.clone()));
        }

        let mailer = transport_builder.build();
        mailer.send(email).await?;

        tracing::info!(to = to_email, event_type = %event.event_type, "Notification email sent");
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn from_env_returns_none_without_smtp_host() {
        // Ensure SMTP_HOST is not set in the test environment.
        std::env::remove_var("SMTP_HOST");
        assert!(EmailConfig::from_env().is_none());
    }

    #[test]
    fn email_error_display_build() {
        let err = EmailError::Build("missing body".to_string());
        assert_eq!(err.to_string(), "Email build error: missing body");
    }

    #[test]
    fn email_error_display_address() {
        let addr_err: Result<lettre::Address, _> = "not-an-email".parse();
        let err = EmailError::Address(addr_err.unwrap_err());
        assert!(err.to_string().contains("Email address parse error"));
    }
}
