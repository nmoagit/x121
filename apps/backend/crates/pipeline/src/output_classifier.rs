//! Classify ComfyUI output files by role (Final vs Intermediate).
//!
//! Reads node titles from the workflow JSON to detect bracket-prefix tags
//! like `[final]` or `[intermediate]`. Falls back to positional inference
//! when tags are absent: the last output node is Final, others are
//! Intermediate.

use x121_comfyui::api::{ComfyUIApi, OutputFileInfo};

use crate::error::PipelineError;

/// The role a particular output plays in the generation pipeline.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OutputRole {
    /// The primary deliverable output (the video shown to the user).
    Final,
    /// An intermediate artifact (e.g. depth map, preview, debug frame).
    Intermediate,
}

impl OutputRole {
    /// Database-friendly lowercase string representation.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Final => "final",
            Self::Intermediate => "intermediate",
        }
    }
}

/// A single output file from a ComfyUI execution, annotated with its role.
#[derive(Debug, Clone)]
pub struct ClassifiedOutput {
    /// The ComfyUI node ID that produced this output.
    pub node_id: String,
    /// Whether this is the final deliverable or an intermediate artifact.
    pub role: OutputRole,
    /// Human-readable label derived from the node title.
    pub label: String,
    /// File information needed to download from ComfyUI.
    pub file_info: OutputFileInfo,
    /// Ordering hint for display (0-based).
    pub sort_order: u32,
}

/// Parse a bracket-prefix tag from a node title.
///
/// Returns `Some(OutputRole)` if the title starts with `[final]` or
/// `[intermediate]` (case-insensitive), otherwise `None`.
fn parse_role_tag(title: &str) -> Option<OutputRole> {
    let lower = title.to_lowercase();
    if lower.starts_with("[final]") {
        Some(OutputRole::Final)
    } else if lower.starts_with("[intermediate]") {
        Some(OutputRole::Intermediate)
    } else {
        None
    }
}

/// Strip the bracket-prefix tag from a title to get the clean label.
fn strip_tag(title: &str) -> String {
    let lower = title.to_lowercase();
    let stripped = if lower.starts_with("[final]") {
        &title["[final]".len()..]
    } else if lower.starts_with("[intermediate]") {
        &title["[intermediate]".len()..]
    } else {
        title
    };
    stripped.trim().to_string()
}

/// Get the node title from the workflow JSON for a given node ID.
///
/// Looks for `workflow[node_id]._meta.title`.
fn node_title(workflow: &serde_json::Value, node_id: &str) -> Option<String> {
    workflow
        .get(node_id)?
        .get("_meta")?
        .get("title")?
        .as_str()
        .map(|s| s.to_string())
}

/// Classify all outputs from a ComfyUI execution.
///
/// 1. Extracts all output files from the history JSON.
/// 2. Reads node titles from the workflow to detect `[final]` / `[intermediate]` tags.
/// 3. Falls back to positional inference if no tags are present.
/// 4. Warns if multiple `[final]` tags are found (last one wins).
///
/// If `workflow` is `Value::Null` or not an object, falls back to treating
/// all outputs as Final (single-output backward compatibility).
pub fn classify_outputs(
    history: &serde_json::Value,
    prompt_id: &str,
    workflow: &serde_json::Value,
) -> Result<Vec<ClassifiedOutput>, PipelineError> {
    let all_outputs = ComfyUIApi::extract_all_output_infos(history, prompt_id)
        .map_err(PipelineError::Download)?;

    if all_outputs.is_empty() {
        return Err(PipelineError::Download(
            "No output files found in ComfyUI history".to_string(),
        ));
    }

    let has_workflow = workflow.is_object();

    // Collect (node_id, title, tag, file_info) tuples.
    struct OutputEntry {
        node_id: String,
        title: String,
        tag: Option<OutputRole>,
        file_info: OutputFileInfo,
    }

    let entries: Vec<OutputEntry> = all_outputs
        .into_iter()
        .map(|(node_id, file_info)| {
            let title = if has_workflow {
                node_title(workflow, &node_id).unwrap_or_else(|| node_id.clone())
            } else {
                node_id.clone()
            };
            let tag = parse_role_tag(&title);
            OutputEntry {
                node_id,
                title,
                tag,
                file_info,
            }
        })
        .collect();

    let has_any_tags = entries.iter().any(|e| e.tag.is_some());

    // Check for multiple [final] tags.
    let final_count = entries
        .iter()
        .filter(|e| e.tag.as_ref() == Some(&OutputRole::Final))
        .count();
    if final_count > 1 {
        tracing::warn!(
            count = final_count,
            "Multiple [final] tags found in workflow — last one wins"
        );
    }

    let total = entries.len();

    let classified: Vec<ClassifiedOutput> = entries
        .into_iter()
        .enumerate()
        .map(|(idx, entry)| {
            let role = if has_any_tags {
                // Tag-based classification. If a node has a tag, use it.
                // Nodes without tags in a tagged workflow default to Intermediate.
                entry.tag.unwrap_or(OutputRole::Intermediate)
            } else {
                // Positional fallback: last output = Final, others = Intermediate.
                if idx == total - 1 {
                    OutputRole::Final
                } else {
                    OutputRole::Intermediate
                }
            };

            let label = strip_tag(&entry.title);

            ClassifiedOutput {
                node_id: entry.node_id,
                role,
                label,
                file_info: entry.file_info,
                sort_order: idx as u32,
            }
        })
        .collect();

    // When using tags and multiple [final] exist, ensure only the last one
    // keeps the Final role (others become Intermediate).
    if has_any_tags && final_count > 1 {
        let mut result = classified;
        let mut seen_final = 0;
        // Iterate in reverse so the last [final] keeps its role.
        for output in result.iter_mut().rev() {
            if output.role == OutputRole::Final {
                seen_final += 1;
                if seen_final > 1 {
                    output.role = OutputRole::Intermediate;
                }
            }
        }
        return Ok(result);
    }

    Ok(classified)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper: build a minimal history JSON with given node outputs.
    fn make_history(prompt_id: &str, nodes: Vec<(&str, &str)>) -> serde_json::Value {
        let mut outputs = serde_json::Map::new();
        for (node_id, filename) in nodes {
            outputs.insert(
                node_id.to_string(),
                serde_json::json!({
                    "gifs": [{"filename": filename, "subfolder": "", "type": "output"}]
                }),
            );
        }
        serde_json::json!({
            prompt_id: {
                "outputs": outputs
            }
        })
    }

    /// Helper: build a workflow JSON with node titles.
    fn make_workflow(nodes: Vec<(&str, &str)>) -> serde_json::Value {
        let mut wf = serde_json::Map::new();
        for (node_id, title) in nodes {
            wf.insert(
                node_id.to_string(),
                serde_json::json!({
                    "_meta": {"title": title},
                    "class_type": "SaveAnimatedWEBP",
                    "inputs": {}
                }),
            );
        }
        serde_json::Value::Object(wf)
    }

    #[test]
    fn single_output_no_tags_is_final() {
        let history = make_history("p1", vec![("10", "output.mp4")]);
        let workflow = make_workflow(vec![("10", "Save Video")]);
        let result = classify_outputs(&history, "p1", &workflow).unwrap();

        assert_eq!(result.len(), 1);
        assert_eq!(result[0].role, OutputRole::Final);
        assert_eq!(result[0].label, "Save Video");
    }

    #[test]
    fn two_outputs_both_tagged() {
        let history = make_history("p2", vec![("5", "preview.mp4"), ("10", "final.mp4")]);
        let workflow = make_workflow(vec![
            ("5", "[intermediate] Preview"),
            ("10", "[final] Main Output"),
        ]);
        let result = classify_outputs(&history, "p2", &workflow).unwrap();

        assert_eq!(result.len(), 2);
        let intermediate = result.iter().find(|o| o.node_id == "5").unwrap();
        let final_out = result.iter().find(|o| o.node_id == "10").unwrap();
        assert_eq!(intermediate.role, OutputRole::Intermediate);
        assert_eq!(intermediate.label, "Preview");
        assert_eq!(final_out.role, OutputRole::Final);
        assert_eq!(final_out.label, "Main Output");
    }

    #[test]
    fn two_outputs_no_tags_last_is_final() {
        let history = make_history("p3", vec![("5", "depth.png"), ("10", "video.mp4")]);
        let workflow = make_workflow(vec![("5", "Depth Map"), ("10", "Video Output")]);
        let result = classify_outputs(&history, "p3", &workflow).unwrap();

        assert_eq!(result.len(), 2);
        assert_eq!(result[0].role, OutputRole::Intermediate);
        assert_eq!(result[1].role, OutputRole::Final);
    }

    #[test]
    fn multiple_final_tags_last_wins() {
        let history = make_history("p4", vec![("3", "a.mp4"), ("7", "b.mp4"), ("10", "c.mp4")]);
        let workflow = make_workflow(vec![
            ("3", "[final] First Final"),
            ("7", "[final] Second Final"),
            ("10", "[intermediate] Preview"),
        ]);
        let result = classify_outputs(&history, "p4", &workflow).unwrap();

        let finals: Vec<_> = result
            .iter()
            .filter(|o| o.role == OutputRole::Final)
            .collect();
        assert_eq!(finals.len(), 1, "Only one output should be Final");
        assert_eq!(finals[0].node_id, "7"); // last [final] in order
    }

    #[test]
    fn mixed_case_tags_recognized() {
        let history = make_history("p5", vec![("5", "out.mp4"), ("10", "preview.png")]);
        let workflow = make_workflow(vec![("5", "[FINAL] Main"), ("10", "[Intermediate] Debug")]);
        let result = classify_outputs(&history, "p5", &workflow).unwrap();

        let main = result.iter().find(|o| o.node_id == "5").unwrap();
        let debug = result.iter().find(|o| o.node_id == "10").unwrap();
        assert_eq!(main.role, OutputRole::Final);
        assert_eq!(debug.role, OutputRole::Intermediate);
    }

    #[test]
    fn no_outputs_returns_error() {
        let history = serde_json::json!({
            "p6": {
                "outputs": {}
            }
        });
        let workflow = serde_json::Value::Null;
        let err = classify_outputs(&history, "p6", &workflow).unwrap_err();
        assert!(err.to_string().contains("No output files"));
    }

    #[test]
    fn null_workflow_fallback() {
        let history = make_history("p7", vec![("10", "video.mp4")]);
        let result = classify_outputs(&history, "p7", &serde_json::Value::Null).unwrap();

        assert_eq!(result.len(), 1);
        assert_eq!(result[0].role, OutputRole::Final);
        // Label falls back to node ID when no workflow is available.
        assert_eq!(result[0].label, "10");
    }
}
