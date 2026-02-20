//! ComfyUI WebSocket message types and parser.
//!
//! ComfyUI sends JSON messages over WebSocket with the shape
//! `{"type": "<kind>", "data": {...}}`. This module deserializes them
//! into a strongly-typed [`ComfyUIMessage`] enum.

use serde::Deserialize;

/// All known ComfyUI WebSocket message types.
///
/// Deserialized via the internally-tagged `"type"` field with
/// associated `"data"` content.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum ComfyUIMessage {
    /// Server status broadcast (queue depth, etc.).
    #[serde(rename = "status")]
    Status(StatusData),

    /// A prompt has started executing.
    #[serde(rename = "execution_start")]
    ExecutionStart(ExecutionStartData),

    /// Some nodes were skipped because their outputs are cached.
    #[serde(rename = "execution_cached")]
    ExecutionCached(ExecutionCachedData),

    /// A specific node is currently executing (or execution finished when `node` is `None`).
    #[serde(rename = "executing")]
    Executing(ExecutingData),

    /// Progress update from a long-running node (e.g. KSampler).
    #[serde(rename = "progress")]
    Progress(ProgressData),

    /// A node has finished and produced output.
    #[serde(rename = "executed")]
    Executed(ExecutedData),

    /// Execution failed with an error.
    #[serde(rename = "execution_error")]
    ExecutionError(ErrorData),
}

/// Queue status information.
#[derive(Debug, Clone, Deserialize)]
pub struct StatusData {
    pub status: QueueStatus,
}

/// Current queue state.
#[derive(Debug, Clone, Deserialize)]
pub struct QueueStatus {
    pub exec_info: ExecInfo,
}

/// Execution queue statistics.
#[derive(Debug, Clone, Deserialize)]
pub struct ExecInfo {
    pub queue_remaining: i32,
}

/// Payload for `execution_start` messages.
#[derive(Debug, Clone, Deserialize)]
pub struct ExecutionStartData {
    pub prompt_id: String,
}

/// Payload for `execution_cached` messages.
#[derive(Debug, Clone, Deserialize)]
pub struct ExecutionCachedData {
    pub prompt_id: String,
    /// Node IDs whose outputs were served from cache.
    #[serde(default)]
    pub nodes: Vec<String>,
}

/// Payload for `executing` messages.
///
/// When `node` is `None`, execution of the prompt has completed.
#[derive(Debug, Clone, Deserialize)]
pub struct ExecutingData {
    pub node: Option<String>,
    pub prompt_id: String,
}

/// Payload for `progress` messages (step-level progress within a node).
#[derive(Debug, Clone, Deserialize)]
pub struct ProgressData {
    /// Current step number.
    pub value: i32,
    /// Total number of steps.
    pub max: i32,
}

/// Payload for `executed` messages (node output).
#[derive(Debug, Clone, Deserialize)]
pub struct ExecutedData {
    /// The node that produced this output.
    pub node: String,
    /// Raw output value (images, filenames, etc.).
    pub output: serde_json::Value,
    pub prompt_id: String,
}

/// Payload for `execution_error` messages.
#[derive(Debug, Clone, Deserialize)]
pub struct ErrorData {
    pub prompt_id: String,
    pub node_id: String,
    pub exception_message: String,
    pub exception_type: String,
}

/// Parse a ComfyUI WebSocket text message into a typed enum.
///
/// Returns `Err` for malformed JSON or unknown `type` values.
/// Callers should log unknown types and continue.
pub fn parse_message(text: &str) -> Result<ComfyUIMessage, serde_json::Error> {
    serde_json::from_str(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_status_message() {
        let json = r#"{"type":"status","data":{"status":{"exec_info":{"queue_remaining":3}}}}"#;
        let msg = parse_message(json).unwrap();
        match msg {
            ComfyUIMessage::Status(data) => {
                assert_eq!(data.status.exec_info.queue_remaining, 3);
            }
            other => panic!("Expected Status, got {other:?}"),
        }
    }

    #[test]
    fn parse_execution_start_message() {
        let json = r#"{"type":"execution_start","data":{"prompt_id":"abc-123"}}"#;
        let msg = parse_message(json).unwrap();
        match msg {
            ComfyUIMessage::ExecutionStart(data) => {
                assert_eq!(data.prompt_id, "abc-123");
            }
            other => panic!("Expected ExecutionStart, got {other:?}"),
        }
    }

    #[test]
    fn parse_execution_cached_message() {
        let json =
            r#"{"type":"execution_cached","data":{"prompt_id":"abc","nodes":["1","2","3"]}}"#;
        let msg = parse_message(json).unwrap();
        match msg {
            ComfyUIMessage::ExecutionCached(data) => {
                assert_eq!(data.prompt_id, "abc");
                assert_eq!(data.nodes, vec!["1", "2", "3"]);
            }
            other => panic!("Expected ExecutionCached, got {other:?}"),
        }
    }

    #[test]
    fn parse_execution_cached_without_nodes() {
        let json = r#"{"type":"execution_cached","data":{"prompt_id":"abc"}}"#;
        let msg = parse_message(json).unwrap();
        match msg {
            ComfyUIMessage::ExecutionCached(data) => {
                assert!(data.nodes.is_empty());
            }
            other => panic!("Expected ExecutionCached, got {other:?}"),
        }
    }

    #[test]
    fn parse_executing_with_node() {
        let json = r#"{"type":"executing","data":{"node":"42","prompt_id":"xyz"}}"#;
        let msg = parse_message(json).unwrap();
        match msg {
            ComfyUIMessage::Executing(data) => {
                assert_eq!(data.node.as_deref(), Some("42"));
                assert_eq!(data.prompt_id, "xyz");
            }
            other => panic!("Expected Executing, got {other:?}"),
        }
    }

    #[test]
    fn parse_executing_finished() {
        let json = r#"{"type":"executing","data":{"node":null,"prompt_id":"xyz"}}"#;
        let msg = parse_message(json).unwrap();
        match msg {
            ComfyUIMessage::Executing(data) => {
                assert!(data.node.is_none());
            }
            other => panic!("Expected Executing, got {other:?}"),
        }
    }

    #[test]
    fn parse_progress_message() {
        let json = r#"{"type":"progress","data":{"value":5,"max":20}}"#;
        let msg = parse_message(json).unwrap();
        match msg {
            ComfyUIMessage::Progress(data) => {
                assert_eq!(data.value, 5);
                assert_eq!(data.max, 20);
            }
            other => panic!("Expected Progress, got {other:?}"),
        }
    }

    #[test]
    fn parse_executed_message() {
        let json = r#"{"type":"executed","data":{"node":"9","output":{"images":[{"filename":"out.png"}]},"prompt_id":"abc"}}"#;
        let msg = parse_message(json).unwrap();
        match msg {
            ComfyUIMessage::Executed(data) => {
                assert_eq!(data.node, "9");
                assert_eq!(data.prompt_id, "abc");
                assert!(data.output.is_object());
            }
            other => panic!("Expected Executed, got {other:?}"),
        }
    }

    #[test]
    fn parse_execution_error_message() {
        let json = r#"{"type":"execution_error","data":{"prompt_id":"abc","node_id":"5","exception_message":"out of memory","exception_type":"RuntimeError"}}"#;
        let msg = parse_message(json).unwrap();
        match msg {
            ComfyUIMessage::ExecutionError(data) => {
                assert_eq!(data.prompt_id, "abc");
                assert_eq!(data.node_id, "5");
                assert_eq!(data.exception_message, "out of memory");
                assert_eq!(data.exception_type, "RuntimeError");
            }
            other => panic!("Expected ExecutionError, got {other:?}"),
        }
    }

    #[test]
    fn parse_unknown_type_returns_error() {
        let json = r#"{"type":"unknown_thing","data":{}}"#;
        assert!(parse_message(json).is_err());
    }

    #[test]
    fn parse_invalid_json_returns_error() {
        assert!(parse_message("not json at all").is_err());
    }
}
