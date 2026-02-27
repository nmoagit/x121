//! Custom tracing layer that captures events and publishes them as activity
//! log entries to the [`ActivityLogBroadcaster`] (PRD-118).
//!
//! This layer captures tracing events at INFO level and above, extracts the
//! message and structured fields, infers the source from the event target,
//! and publishes a `Verbose` category `ActivityLogEntry`.

use std::sync::Arc;

use tracing::Level;
use tracing_subscriber::Layer;
use x121_core::activity::{
    ActivityLogCategory, ActivityLogEntry, ActivityLogLevel, ActivityLogSource,
};
use x121_events::ActivityLogBroadcaster;

/// A tracing subscriber layer that captures events and publishes them
/// to the activity log broadcast channel.
pub struct ActivityTracingLayer {
    broadcaster: Arc<ActivityLogBroadcaster>,
}

impl ActivityTracingLayer {
    pub fn new(broadcaster: Arc<ActivityLogBroadcaster>) -> Self {
        Self { broadcaster }
    }
}

impl<S> Layer<S> for ActivityTracingLayer
where
    S: tracing::Subscriber,
{
    fn on_event(&self, event: &tracing::Event<'_>, _ctx: tracing_subscriber::layer::Context<'_, S>) {
        let meta = event.metadata();

        // Only capture INFO and above.
        match *meta.level() {
            Level::TRACE | Level::DEBUG => return,
            _ => {}
        }

        let level = match *meta.level() {
            Level::ERROR => ActivityLogLevel::Error,
            Level::WARN => ActivityLogLevel::Warn,
            Level::INFO => ActivityLogLevel::Info,
            // DEBUG and TRACE are filtered above, but match for completeness.
            _ => ActivityLogLevel::Debug,
        };

        let source = ActivityLogSource::from_target(meta.target());

        // Extract message and fields from the event.
        let mut visitor = FieldVisitor::default();
        event.record(&mut visitor);

        let message = visitor.message.unwrap_or_default();
        let fields = if visitor.fields.is_empty() {
            serde_json::Value::Object(Default::default())
        } else {
            serde_json::Value::Object(visitor.fields.into_iter().collect())
        };

        let entry = ActivityLogEntry {
            timestamp: chrono::Utc::now(),
            level,
            source,
            message,
            fields,
            category: ActivityLogCategory::Verbose,
            entity_type: None,
            entity_id: None,
            user_id: None,
            job_id: None,
            project_id: None,
            trace_id: None,
        };

        self.broadcaster.publish(entry);
    }
}

/// Visitor that extracts the `message` field and all other structured fields
/// from a tracing event.
#[derive(Default)]
struct FieldVisitor {
    message: Option<String>,
    fields: Vec<(String, serde_json::Value)>,
}

impl tracing::field::Visit for FieldVisitor {
    fn record_debug(&mut self, field: &tracing::field::Field, value: &dyn std::fmt::Debug) {
        let val = format!("{value:?}");
        if field.name() == "message" {
            self.message = Some(val);
        } else {
            self.fields
                .push((field.name().to_string(), serde_json::Value::String(val)));
        }
    }

    fn record_str(&mut self, field: &tracing::field::Field, value: &str) {
        if field.name() == "message" {
            self.message = Some(value.to_string());
        } else {
            self.fields.push((
                field.name().to_string(),
                serde_json::Value::String(value.to_string()),
            ));
        }
    }

    fn record_i64(&mut self, field: &tracing::field::Field, value: i64) {
        self.fields.push((
            field.name().to_string(),
            serde_json::Value::Number(value.into()),
        ));
    }

    fn record_u64(&mut self, field: &tracing::field::Field, value: u64) {
        self.fields.push((
            field.name().to_string(),
            serde_json::Value::Number(value.into()),
        ));
    }

    fn record_bool(&mut self, field: &tracing::field::Field, value: bool) {
        self.fields
            .push((field.name().to_string(), serde_json::Value::Bool(value)));
    }

    fn record_f64(&mut self, field: &tracing::field::Field, value: f64) {
        if let Some(n) = serde_json::Number::from_f64(value) {
            self.fields
                .push((field.name().to_string(), serde_json::Value::Number(n)));
        }
    }
}
