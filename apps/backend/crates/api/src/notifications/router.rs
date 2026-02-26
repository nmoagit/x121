//! Event-to-notification routing engine.
//!
//! [`NotificationRouter`] subscribes to the platform event bus and routes
//! each event to affected users based on their notification preferences,
//! Do-Not-Disturb settings, and digest configuration.

use std::sync::Arc;

use axum::extract::ws::Message;
use tokio::sync::broadcast;
use x121_core::channels::{CHANNEL_DIGEST, CHANNEL_IN_APP};
use x121_core::types::DbId;
use x121_db::repositories::{EventRepo, NotificationPreferenceRepo, NotificationRepo};
use x121_db::DbPool;
use x121_events::PlatformEvent;

use crate::ws::WsManager;

/// Routes platform events to user notifications.
///
/// Consumes events from the broadcast channel and, for each event,
/// determines the target users, checks their preferences, and delivers
/// notifications through the appropriate channels.
pub struct NotificationRouter {
    pool: DbPool,
    ws_manager: Arc<WsManager>,
}

impl NotificationRouter {
    /// Create a new router with the given database pool and WebSocket manager.
    pub fn new(pool: DbPool, ws_manager: Arc<WsManager>) -> Self {
        Self { pool, ws_manager }
    }

    /// Run the main routing loop.
    ///
    /// Subscribes to the event bus via `receiver` and processes each event.
    /// The loop exits when the channel is closed (i.e. the
    /// [`EventBus`](x121_events::EventBus) is dropped).
    pub async fn run(self, mut receiver: broadcast::Receiver<PlatformEvent>) {
        loop {
            match receiver.recv().await {
                Ok(event) => {
                    if let Err(e) = self.route_event(&event).await {
                        tracing::error!(
                            error = %e,
                            event_type = %event.event_type,
                            "Failed to route event"
                        );
                    }
                }
                Err(broadcast::error::RecvError::Lagged(n)) => {
                    tracing::warn!(skipped = n, "Notification router lagged");
                }
                Err(broadcast::error::RecvError::Closed) => {
                    tracing::info!("Event bus closed, notification router shutting down");
                    break;
                }
            }
        }
    }

    /// Route a single event to all affected users.
    async fn route_event(
        &self,
        event: &PlatformEvent,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let target_users = self.determine_targets(event).await?;

        for user_id in target_users {
            self.route_to_user(user_id, event).await?;
        }

        Ok(())
    }

    /// Evaluate preferences and deliver to a single user.
    async fn route_to_user(
        &self,
        user_id: DbId,
        event: &PlatformEvent,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        // Resolve event type metadata.
        let event_type =
            match EventRepo::get_event_type_by_name(&self.pool, &event.event_type).await? {
                Some(et) => et,
                None => {
                    tracing::warn!(
                        event_type = %event.event_type,
                        "Unknown event type, skipping notification"
                    );
                    return Ok(());
                }
            };

        // Check per-event-type preference; default is enabled.
        let pref =
            NotificationPreferenceRepo::get_for_event_type(&self.pool, user_id, event_type.id)
                .await?;

        let is_enabled = pref.as_ref().map(|p| p.is_enabled).unwrap_or(true);
        if !is_enabled {
            return Ok(());
        }

        // Check Do-Not-Disturb settings.
        let settings = NotificationPreferenceRepo::get_settings(&self.pool, user_id).await?;
        let is_dnd = settings.as_ref().is_some_and(|s| {
            if !s.dnd_enabled {
                return false;
            }
            match s.dnd_until {
                Some(until) => chrono::Utc::now() < until,
                None => true, // Indefinite DND
            }
        });

        if is_dnd && !event_type.is_critical {
            return Ok(()); // DND blocks non-critical events
        }

        // Check digest mode.
        let is_digest = settings.as_ref().is_some_and(|s| s.digest_enabled);
        if is_digest && !event_type.is_critical {
            // Create notification but do not deliver now; the digest job will pick it up.
            if let Some(event_id) = self.find_latest_event_id(&event.event_type).await {
                NotificationRepo::create(&self.pool, event_id, user_id, CHANNEL_DIGEST)
                    .await
                    .ok();
            }
            return Ok(());
        }

        // Deliver through configured channels.
        let channels: Vec<String> = pref
            .as_ref()
            .and_then(|p| serde_json::from_value(p.channels.clone()).ok())
            .unwrap_or_else(|| vec![CHANNEL_IN_APP.to_string()]);

        for channel in &channels {
            match channel.as_str() {
                CHANNEL_IN_APP => self.deliver_in_app(user_id, event).await,
                // Webhook and email delivery will be implemented in Phase 5.
                other => {
                    tracing::debug!(channel = other, "Channel delivery not yet implemented");
                }
            }
        }

        Ok(())
    }

    /// Determine which users should receive a notification for the event.
    async fn determine_targets(&self, event: &PlatformEvent) -> Result<Vec<DbId>, sqlx::Error> {
        match event.event_type.as_str() {
            // Job events: notify the actor (job submitter).
            t if t.starts_with("job.") => Ok(event.actor_user_id.into_iter().collect()),

            // Review events: notify the actor. Content-owner lookup comes with the review PRD.
            t if t.starts_with("review.") => Ok(event.actor_user_id.into_iter().collect()),

            // System events: notify all active admin users.
            t if t.starts_with("system.") => self.get_admin_user_ids().await,

            // Collaboration mention: extract mentioned user IDs from payload.
            "collab.mention" => {
                let ids = event
                    .payload
                    .get("mentioned_user_ids")
                    .and_then(|v| serde_json::from_value::<Vec<DbId>>(v.clone()).ok())
                    .unwrap_or_default();
                Ok(ids)
            }

            _ => Ok(vec![]),
        }
    }

    /// Query all active users with the admin role.
    async fn get_admin_user_ids(&self) -> Result<Vec<DbId>, sqlx::Error> {
        sqlx::query_scalar(
            "SELECT u.id FROM users u \
             JOIN roles r ON u.role_id = r.id \
             WHERE r.name = $1 AND u.is_active = true",
        )
        .bind(x121_core::roles::ROLE_ADMIN)
        .fetch_all(&self.pool)
        .await
    }

    /// Look up the most recent persisted event row matching the given type name.
    ///
    /// The persistence service writes events asynchronously, so there is a
    /// small window where the row may not exist yet. In that case `None` is
    /// returned and the notification is skipped.
    async fn find_latest_event_id(&self, event_type_name: &str) -> Option<DbId> {
        sqlx::query_scalar::<_, DbId>(
            "SELECT id FROM events \
             WHERE event_type_id = (SELECT id FROM event_types WHERE name = $1) \
             ORDER BY id DESC LIMIT 1",
        )
        .bind(event_type_name)
        .fetch_optional(&self.pool)
        .await
        .ok()
        .flatten()
    }

    /// Create a notification record in the database and push a WebSocket message.
    async fn deliver_in_app(&self, user_id: DbId, event: &PlatformEvent) {
        // Look up the persisted event row for the notification FK.
        if let Some(event_id) = self.find_latest_event_id(&event.event_type).await {
            NotificationRepo::create(&self.pool, event_id, user_id, CHANNEL_IN_APP)
                .await
                .ok();
        }

        // Push the notification over WebSocket.
        let msg = serde_json::json!({
            "type": "notification",
            "event_type": event.event_type,
            "payload": event.payload,
            "timestamp": event.timestamp,
        });
        let ws_msg = Message::Text(msg.to_string().into());
        self.ws_manager.send_to_user(user_id, ws_msg).await;
    }
}
