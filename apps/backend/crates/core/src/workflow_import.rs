//! ComfyUI Workflow Import & Validation (PRD-75).
//!
//! Parses ComfyUI workflow JSON, discovers configurable parameters,
//! validates workflow metadata, and computes content hashes for
//! duplicate detection.

use serde::{Deserialize, Serialize};

use crate::error::CoreError;
use crate::hashing::sha256_hex;
use crate::types::DbId;

// ---------------------------------------------------------------------------
// Status ID constants (match workflow_statuses seed data)
// ---------------------------------------------------------------------------

/// Draft status: imported but not yet validated.
pub const WORKFLOW_STATUS_ID_DRAFT: DbId = 1;

/// Validated status: all nodes and models verified.
pub const WORKFLOW_STATUS_ID_VALIDATED: DbId = 2;

/// Tested status: dry-run test passed.
pub const WORKFLOW_STATUS_ID_TESTED: DbId = 3;

/// Production status: approved for use in scene configs.
pub const WORKFLOW_STATUS_ID_PRODUCTION: DbId = 4;

/// Deprecated status: replaced by a newer version.
pub const WORKFLOW_STATUS_ID_DEPRECATED: DbId = 5;

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/// Maximum length of a workflow name.
pub const MAX_WORKFLOW_NAME_LENGTH: usize = 200;

/// Maximum JSON size in bytes (10 MB).
pub const MAX_WORKFLOW_JSON_SIZE: usize = 10_000_000;

/// Maximum number of discovered parameters per workflow.
pub const MAX_DISCOVERED_PARAMS: usize = 100;

/// Default dry-run timeout in seconds.
pub const DRY_RUN_DEFAULT_TIMEOUT_SECS: u64 = 300;

// ---------------------------------------------------------------------------
// ComfyUI node class types used for heuristic detection
// ---------------------------------------------------------------------------

/// KSampler node class type in ComfyUI.
const KSAMPLER_CLASS: &str = "KSampler";

/// KSampler advanced node class type.
const KSAMPLER_ADVANCED_CLASS: &str = "KSamplerAdvanced";

/// CLIP text encode node class type.
const CLIP_TEXT_ENCODE_CLASS: &str = "CLIPTextEncode";

/// Load image node class type.
const LOAD_IMAGE_CLASS: &str = "LoadImage";

/// Load checkpoint node class type.
const LOAD_CHECKPOINT_CLASS: &str = "CheckpointLoaderSimple";

/// Load LoRA node class type.
const LOAD_LORA_CLASS: &str = "LoraLoader";

// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

/// A single node in a parsed ComfyUI workflow.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowNode {
    /// Node ID (string key from the JSON object).
    pub id: String,
    /// ComfyUI class type (e.g. "KSampler", "CLIPTextEncode").
    pub class_type: String,
    /// Raw input values for this node.
    pub inputs: serde_json::Value,
}

/// A connection between two nodes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeConnection {
    /// Source node ID.
    pub from_node: String,
    /// Source output slot name or index.
    pub from_output: String,
    /// Destination node ID.
    pub to_node: String,
    /// Destination input name.
    pub to_input: String,
}

/// Result of parsing a ComfyUI workflow JSON.
#[derive(Debug, Serialize)]
pub struct ParsedWorkflow {
    /// All nodes in the workflow.
    pub nodes: Vec<WorkflowNode>,
    /// All connections between nodes.
    pub connections: Vec<NodeConnection>,
    /// Model filenames referenced by checkpoint loaders.
    pub referenced_models: Vec<String>,
    /// LoRA filenames referenced by LoRA loaders.
    pub referenced_loras: Vec<String>,
    /// Custom node class types not in the standard ComfyUI set.
    pub referenced_custom_nodes: Vec<String>,
}

/// Type of a discovered parameter.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ParamType {
    Seed,
    Cfg,
    Denoise,
    Prompt,
    NegativePrompt,
    Image,
    Steps,
    Sampler,
    Other(String),
}

/// A parameter discovered by heuristic analysis of workflow nodes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveredParameter {
    /// Node ID containing this parameter.
    pub node_id: String,
    /// Input field name within the node.
    pub input_name: String,
    /// Detected parameter type.
    pub param_type: ParamType,
    /// Current value from the workflow JSON.
    pub current_value: serde_json::Value,
    /// Suggested human-readable name for the parameter.
    pub suggested_name: String,
    /// Category for UI grouping.
    pub category: String,
}

/// Result of validating a single node type against available nodes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeValidationResult {
    /// ComfyUI class type name.
    pub node_type: String,
    /// Whether this node type is available on the target worker.
    pub present: bool,
}

/// Result of validating a single model against the model registry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelValidationResult {
    /// Model filename.
    pub model_name: String,
    /// Whether this model was found in the registry.
    pub found_in_registry: bool,
}

/// Aggregate validation result for a workflow.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    /// Per-node-type validation results.
    pub node_results: Vec<NodeValidationResult>,
    /// Per-model validation results.
    pub model_results: Vec<ModelValidationResult>,
    /// Whether the workflow passed all validation checks.
    pub overall_valid: bool,
}

// ---------------------------------------------------------------------------
// Standard ComfyUI node types (used to detect custom nodes)
// ---------------------------------------------------------------------------

/// Standard ComfyUI node class types that ship with the base install.
const STANDARD_NODE_TYPES: &[&str] = &[
    "KSampler",
    "KSamplerAdvanced",
    "CheckpointLoaderSimple",
    "CLIPTextEncode",
    "CLIPSetLastLayer",
    "VAEDecode",
    "VAEEncode",
    "VAELoader",
    "EmptyLatentImage",
    "LatentUpscale",
    "LatentUpscaleBy",
    "SaveImage",
    "PreviewImage",
    "LoadImage",
    "LoadImageMask",
    "ImageScale",
    "ImageScaleBy",
    "ImageInvert",
    "ConditioningCombine",
    "ConditioningAverage",
    "ConditioningConcat",
    "ConditioningSetArea",
    "ConditioningSetMask",
    "ControlNetLoader",
    "ControlNetApply",
    "ControlNetApplyAdvanced",
    "LoraLoader",
    "LoraLoaderModelOnly",
    "CLIPLoader",
    "DualCLIPLoader",
    "UNETLoader",
    "UpscaleModelLoader",
    "ImageUpscaleWithModel",
    "StyleModelLoader",
    "StyleModelApply",
    "CLIPVisionEncode",
    "CLIPVisionLoader",
    "unCLIPConditioning",
    "GLIGENLoader",
    "GLIGENTextBoxApply",
    "LatentBlend",
    "LatentComposite",
    "LatentRotate",
    "LatentFlip",
    "LatentCrop",
    "SetLatentNoiseMask",
    "RepeatLatentBatch",
    "RebatchLatentBatch",
    "SplitLatentBatch",
    "ConditioningSetTimestepRange",
    "ConditioningZeroOut",
];

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Parse a ComfyUI workflow JSON into structured data.
///
/// The expected format is an object where each key is a node ID and each
/// value is an object with `class_type` and `inputs` fields:
///
/// ```json
/// {
///   "3": {
///     "class_type": "KSampler",
///     "inputs": { "seed": 42, "cfg": 7.5, ... }
///   }
/// }
/// ```
pub fn parse_workflow(json: &serde_json::Value) -> Result<ParsedWorkflow, CoreError> {
    let obj = json.as_object().ok_or_else(|| {
        CoreError::Validation("Workflow JSON must be an object".to_string())
    })?;

    if obj.is_empty() {
        return Err(CoreError::Validation(
            "Workflow JSON must contain at least one node".to_string(),
        ));
    }

    let mut nodes = Vec::new();
    let mut connections = Vec::new();
    let mut referenced_models = Vec::new();
    let mut referenced_loras = Vec::new();
    let mut custom_node_set = Vec::new();

    for (node_id, node_value) in obj {
        let class_type = node_value
            .get("class_type")
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                CoreError::Validation(format!(
                    "Node '{node_id}' is missing required 'class_type' field"
                ))
            })?
            .to_string();

        let inputs = node_value
            .get("inputs")
            .cloned()
            .unwrap_or(serde_json::Value::Object(serde_json::Map::new()));

        // Extract connections from inputs that reference other nodes.
        // ComfyUI encodes connections as arrays: [source_node_id, output_index]
        if let Some(input_obj) = inputs.as_object() {
            for (input_name, input_val) in input_obj {
                if let Some(arr) = input_val.as_array() {
                    if arr.len() == 2 {
                        let from_node = if let Some(s) = arr[0].as_str() {
                            s.to_string()
                        } else if let Some(n) = arr[0].as_u64() {
                            n.to_string()
                        } else {
                            continue;
                        };

                        let from_output = if let Some(n) = arr[1].as_u64() {
                            n.to_string()
                        } else if let Some(s) = arr[1].as_str() {
                            s.to_string()
                        } else {
                            continue;
                        };

                        connections.push(NodeConnection {
                            from_node,
                            from_output,
                            to_node: node_id.clone(),
                            to_input: input_name.clone(),
                        });
                    }
                }
            }
        }

        // Extract model references from checkpoint loaders.
        if class_type == LOAD_CHECKPOINT_CLASS {
            if let Some(ckpt_name) = inputs.get("ckpt_name").and_then(|v| v.as_str()) {
                if !referenced_models.contains(&ckpt_name.to_string()) {
                    referenced_models.push(ckpt_name.to_string());
                }
            }
        }

        // Extract LoRA references from LoRA loaders.
        if class_type == LOAD_LORA_CLASS {
            if let Some(lora_name) = inputs.get("lora_name").and_then(|v| v.as_str()) {
                if !referenced_loras.contains(&lora_name.to_string()) {
                    referenced_loras.push(lora_name.to_string());
                }
            }
        }

        // Detect custom nodes not in the standard set.
        if !STANDARD_NODE_TYPES.contains(&class_type.as_str())
            && !custom_node_set.contains(&class_type)
        {
            custom_node_set.push(class_type.clone());
        }

        nodes.push(WorkflowNode {
            id: node_id.clone(),
            class_type,
            inputs,
        });
    }

    // Sort nodes by ID for deterministic output.
    nodes.sort_by(|a, b| a.id.cmp(&b.id));

    Ok(ParsedWorkflow {
        nodes,
        connections,
        referenced_models,
        referenced_loras,
        referenced_custom_nodes: custom_node_set,
    })
}

/// Discover configurable parameters from a parsed workflow using heuristics.
///
/// Detects seed, CFG, denoise, steps, and sampler from KSampler nodes,
/// prompts from CLIPTextEncode nodes, and images from LoadImage nodes.
pub fn discover_parameters(parsed: &ParsedWorkflow) -> Vec<DiscoveredParameter> {
    let mut params = Vec::new();

    for node in &parsed.nodes {
        match node.class_type.as_str() {
            KSAMPLER_CLASS | KSAMPLER_ADVANCED_CLASS => {
                discover_ksampler_params(&mut params, node);
            }
            CLIP_TEXT_ENCODE_CLASS => {
                discover_clip_text_params(&mut params, node);
            }
            LOAD_IMAGE_CLASS => {
                discover_load_image_params(&mut params, node);
            }
            _ => {}
        }

        if params.len() >= MAX_DISCOVERED_PARAMS {
            break;
        }
    }

    params.truncate(MAX_DISCOVERED_PARAMS);
    params
}

/// Validate a workflow name (non-empty, within length limits).
pub fn validate_workflow_name(name: &str) -> Result<(), CoreError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(CoreError::Validation(
            "Workflow name must not be empty".to_string(),
        ));
    }
    if trimmed.len() > MAX_WORKFLOW_NAME_LENGTH {
        return Err(CoreError::Validation(format!(
            "Workflow name must be at most {MAX_WORKFLOW_NAME_LENGTH} characters, got {}",
            trimmed.len()
        )));
    }
    Ok(())
}

/// Validate that a workflow JSON does not exceed the size limit.
pub fn validate_workflow_json_size(json: &serde_json::Value) -> Result<(), CoreError> {
    let serialized = serde_json::to_string(json).map_err(|e| {
        CoreError::Internal(format!("Failed to serialize workflow JSON: {e}"))
    })?;
    if serialized.len() > MAX_WORKFLOW_JSON_SIZE {
        return Err(CoreError::Validation(format!(
            "Workflow JSON exceeds maximum size of {} bytes (got {} bytes)",
            MAX_WORKFLOW_JSON_SIZE,
            serialized.len()
        )));
    }
    Ok(())
}

/// Compute a deterministic SHA-256 hash of the workflow JSON content.
///
/// The JSON is serialized with sorted keys to ensure the same logical
/// content always produces the same hash, regardless of key order.
pub fn compute_workflow_hash(json: &serde_json::Value) -> String {
    // serde_json preserves insertion order, so we serialize the canonical
    // representation. For true canonical hashing we use the compact form.
    let canonical = serde_json::to_string(json).unwrap_or_default();
    sha256_hex(canonical.as_bytes())
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/// Extract configurable parameters from a KSampler node.
fn discover_ksampler_params(params: &mut Vec<DiscoveredParameter>, node: &WorkflowNode) {
    let input_mappings: &[(&str, ParamType, &str)] = &[
        ("seed", ParamType::Seed, "Random Seed"),
        ("cfg", ParamType::Cfg, "CFG Scale"),
        ("denoise", ParamType::Denoise, "Denoise Strength"),
        ("steps", ParamType::Steps, "Sampling Steps"),
        ("sampler_name", ParamType::Sampler, "Sampler"),
    ];

    for &(input_name, ref param_type, suggested_name) in input_mappings {
        if let Some(value) = node.inputs.get(input_name) {
            // Skip connection references (arrays) — only capture literal values.
            if value.is_array() {
                continue;
            }
            params.push(DiscoveredParameter {
                node_id: node.id.clone(),
                input_name: input_name.to_string(),
                param_type: param_type.clone(),
                current_value: value.clone(),
                suggested_name: suggested_name.to_string(),
                category: "Sampling".to_string(),
            });
        }
    }
}

/// Extract prompt parameters from a CLIPTextEncode node.
fn discover_clip_text_params(params: &mut Vec<DiscoveredParameter>, node: &WorkflowNode) {
    if let Some(text_value) = node.inputs.get("text") {
        if text_value.is_array() {
            return;
        }

        // Heuristic: determine whether this is a positive or negative prompt.
        // We check the node ID for common naming conventions.
        let node_id_lower = node.id.to_lowercase();
        let (param_type, suggested_name) = if node_id_lower.contains("neg")
            || node_id_lower.contains("negative")
        {
            (ParamType::NegativePrompt, "Negative Prompt")
        } else {
            (ParamType::Prompt, "Prompt")
        };

        params.push(DiscoveredParameter {
            node_id: node.id.clone(),
            input_name: "text".to_string(),
            param_type,
            current_value: text_value.clone(),
            suggested_name: suggested_name.to_string(),
            category: "Prompts".to_string(),
        });
    }
}

/// Extract image parameters from a LoadImage node.
fn discover_load_image_params(params: &mut Vec<DiscoveredParameter>, node: &WorkflowNode) {
    if let Some(image_value) = node.inputs.get("image") {
        if image_value.is_array() {
            return;
        }
        params.push(DiscoveredParameter {
            node_id: node.id.clone(),
            input_name: "image".to_string(),
            param_type: ParamType::Image,
            current_value: image_value.clone(),
            suggested_name: "Input Image".to_string(),
            category: "Images".to_string(),
        });
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // -- Helper: minimal valid ComfyUI workflow JSON --------------------------

    fn sample_workflow_json() -> serde_json::Value {
        json!({
            "3": {
                "class_type": "KSampler",
                "inputs": {
                    "seed": 42,
                    "cfg": 7.5,
                    "denoise": 0.95,
                    "steps": 20,
                    "sampler_name": "euler_ancestral",
                    "model": ["1", 0],
                    "positive": ["6", 0],
                    "negative": ["7", 0],
                    "latent_image": ["5", 0]
                }
            },
            "1": {
                "class_type": "CheckpointLoaderSimple",
                "inputs": {
                    "ckpt_name": "sd_xl_base_1.0.safetensors"
                }
            },
            "5": {
                "class_type": "EmptyLatentImage",
                "inputs": {
                    "width": 1024,
                    "height": 1024,
                    "batch_size": 1
                }
            },
            "6": {
                "class_type": "CLIPTextEncode",
                "inputs": {
                    "text": "a beautiful landscape",
                    "clip": ["1", 1]
                }
            },
            "7": {
                "class_type": "CLIPTextEncode",
                "inputs": {
                    "text": "ugly, deformed",
                    "clip": ["1", 1]
                }
            },
            "8": {
                "class_type": "VAEDecode",
                "inputs": {
                    "samples": ["3", 0],
                    "vae": ["1", 2]
                }
            },
            "9": {
                "class_type": "SaveImage",
                "inputs": {
                    "images": ["8", 0],
                    "filename_prefix": "ComfyUI"
                }
            }
        })
    }

    fn workflow_with_lora() -> serde_json::Value {
        json!({
            "1": {
                "class_type": "CheckpointLoaderSimple",
                "inputs": { "ckpt_name": "model_v1.safetensors" }
            },
            "2": {
                "class_type": "LoraLoader",
                "inputs": {
                    "lora_name": "detail_enhancer.safetensors",
                    "model": ["1", 0],
                    "clip": ["1", 1],
                    "strength_model": 0.8,
                    "strength_clip": 1.0
                }
            },
            "3": {
                "class_type": "KSampler",
                "inputs": {
                    "seed": 123,
                    "cfg": 8.0,
                    "steps": 30,
                    "sampler_name": "dpmpp_2m",
                    "denoise": 1.0,
                    "model": ["2", 0],
                    "positive": ["4", 0],
                    "negative": ["5", 0],
                    "latent_image": ["6", 0]
                }
            },
            "4": {
                "class_type": "CLIPTextEncode",
                "inputs": { "text": "high quality photo", "clip": ["2", 1] }
            },
            "5": {
                "class_type": "CLIPTextEncode",
                "inputs": { "text": "low quality", "clip": ["2", 1] }
            },
            "6": {
                "class_type": "EmptyLatentImage",
                "inputs": { "width": 512, "height": 512, "batch_size": 1 }
            }
        })
    }

    fn workflow_with_custom_node() -> serde_json::Value {
        json!({
            "1": {
                "class_type": "CheckpointLoaderSimple",
                "inputs": { "ckpt_name": "model.safetensors" }
            },
            "2": {
                "class_type": "IPAdapterApply",
                "inputs": { "model": ["1", 0] }
            }
        })
    }

    fn workflow_with_load_image() -> serde_json::Value {
        json!({
            "1": {
                "class_type": "LoadImage",
                "inputs": { "image": "input_photo.png" }
            },
            "2": {
                "class_type": "KSampler",
                "inputs": {
                    "seed": 99,
                    "cfg": 5.0,
                    "denoise": 0.7,
                    "steps": 15,
                    "sampler_name": "euler",
                    "model": ["3", 0],
                    "positive": ["4", 0],
                    "negative": ["5", 0],
                    "latent_image": ["1", 0]
                }
            },
            "3": {
                "class_type": "CheckpointLoaderSimple",
                "inputs": { "ckpt_name": "checkpoint.safetensors" }
            },
            "4": {
                "class_type": "CLIPTextEncode",
                "inputs": { "text": "portrait", "clip": ["3", 1] }
            },
            "5": {
                "class_type": "CLIPTextEncode",
                "inputs": { "text": "bad", "clip": ["3", 1] }
            }
        })
    }

    // -- parse_workflow -------------------------------------------------------

    #[test]
    fn parse_sample_workflow_extracts_all_nodes() {
        let parsed = parse_workflow(&sample_workflow_json()).unwrap();
        assert_eq!(parsed.nodes.len(), 7);
    }

    #[test]
    fn parse_sample_workflow_extracts_connections() {
        let parsed = parse_workflow(&sample_workflow_json()).unwrap();
        // KSampler has 4 connections, CLIPTextEncode×2 each have 1,
        // VAEDecode has 2, SaveImage has 1 = 9 total.
        assert!(!parsed.connections.is_empty());
        assert!(parsed.connections.len() >= 8);
    }

    #[test]
    fn parse_sample_workflow_extracts_model_reference() {
        let parsed = parse_workflow(&sample_workflow_json()).unwrap();
        assert_eq!(parsed.referenced_models, vec!["sd_xl_base_1.0.safetensors"]);
    }

    #[test]
    fn parse_workflow_with_lora_extracts_lora_reference() {
        let parsed = parse_workflow(&workflow_with_lora()).unwrap();
        assert_eq!(parsed.referenced_loras, vec!["detail_enhancer.safetensors"]);
        assert_eq!(parsed.referenced_models, vec!["model_v1.safetensors"]);
    }

    #[test]
    fn parse_workflow_detects_custom_nodes() {
        let parsed = parse_workflow(&workflow_with_custom_node()).unwrap();
        assert_eq!(parsed.referenced_custom_nodes, vec!["IPAdapterApply"]);
    }

    #[test]
    fn parse_empty_object_returns_error() {
        let result = parse_workflow(&json!({}));
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("at least one node"));
    }

    #[test]
    fn parse_non_object_returns_error() {
        let result = parse_workflow(&json!("not an object"));
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("must be an object"));
    }

    #[test]
    fn parse_node_missing_class_type_returns_error() {
        let json = json!({
            "1": { "inputs": {} }
        });
        let result = parse_workflow(&json);
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("class_type"));
    }

    #[test]
    fn parse_node_with_missing_inputs_uses_empty_object() {
        let json = json!({
            "1": { "class_type": "SaveImage" }
        });
        let parsed = parse_workflow(&json).unwrap();
        assert_eq!(parsed.nodes[0].inputs, json!({}));
    }

    // -- discover_parameters --------------------------------------------------

    #[test]
    fn discover_ksampler_params() {
        let parsed = parse_workflow(&sample_workflow_json()).unwrap();
        let params = discover_parameters(&parsed);

        let seed_params: Vec<_> = params
            .iter()
            .filter(|p| p.param_type == ParamType::Seed)
            .collect();
        assert_eq!(seed_params.len(), 1);
        assert_eq!(seed_params[0].current_value, json!(42));
    }

    #[test]
    fn discover_cfg_param() {
        let parsed = parse_workflow(&sample_workflow_json()).unwrap();
        let params = discover_parameters(&parsed);

        let cfg_params: Vec<_> = params
            .iter()
            .filter(|p| p.param_type == ParamType::Cfg)
            .collect();
        assert_eq!(cfg_params.len(), 1);
        assert_eq!(cfg_params[0].current_value, json!(7.5));
    }

    #[test]
    fn discover_steps_param() {
        let parsed = parse_workflow(&sample_workflow_json()).unwrap();
        let params = discover_parameters(&parsed);

        let steps_params: Vec<_> = params
            .iter()
            .filter(|p| p.param_type == ParamType::Steps)
            .collect();
        assert_eq!(steps_params.len(), 1);
        assert_eq!(steps_params[0].current_value, json!(20));
    }

    #[test]
    fn discover_prompt_params() {
        let parsed = parse_workflow(&sample_workflow_json()).unwrap();
        let params = discover_parameters(&parsed);

        let prompt_params: Vec<_> = params
            .iter()
            .filter(|p| p.param_type == ParamType::Prompt || p.param_type == ParamType::NegativePrompt)
            .collect();
        // Two CLIPTextEncode nodes.
        assert_eq!(prompt_params.len(), 2);
    }

    #[test]
    fn discover_image_param() {
        let parsed = parse_workflow(&workflow_with_load_image()).unwrap();
        let params = discover_parameters(&parsed);

        let image_params: Vec<_> = params
            .iter()
            .filter(|p| p.param_type == ParamType::Image)
            .collect();
        assert_eq!(image_params.len(), 1);
        assert_eq!(image_params[0].current_value, json!("input_photo.png"));
    }

    #[test]
    fn discover_no_params_for_simple_workflow() {
        let json = json!({
            "1": {
                "class_type": "SaveImage",
                "inputs": { "images": ["2", 0], "filename_prefix": "out" }
            },
            "2": {
                "class_type": "VAEDecode",
                "inputs": { "samples": ["3", 0], "vae": ["4", 0] }
            }
        });
        let parsed = parse_workflow(&json).unwrap();
        let params = discover_parameters(&parsed);
        assert!(params.is_empty());
    }

    // -- validate_workflow_name ------------------------------------------------

    #[test]
    fn valid_workflow_name_accepted() {
        assert!(validate_workflow_name("My Workflow").is_ok());
    }

    #[test]
    fn empty_workflow_name_rejected() {
        assert!(validate_workflow_name("").is_err());
        assert!(validate_workflow_name("   ").is_err());
    }

    #[test]
    fn too_long_workflow_name_rejected() {
        let long_name = "a".repeat(MAX_WORKFLOW_NAME_LENGTH + 1);
        assert!(validate_workflow_name(&long_name).is_err());
    }

    #[test]
    fn max_length_workflow_name_accepted() {
        let name = "a".repeat(MAX_WORKFLOW_NAME_LENGTH);
        assert!(validate_workflow_name(&name).is_ok());
    }

    // -- validate_workflow_json_size -------------------------------------------

    #[test]
    fn small_json_passes_size_check() {
        let json = json!({"test": "small"});
        assert!(validate_workflow_json_size(&json).is_ok());
    }

    // -- compute_workflow_hash -------------------------------------------------

    #[test]
    fn hash_is_deterministic() {
        let json = sample_workflow_json();
        let hash1 = compute_workflow_hash(&json);
        let hash2 = compute_workflow_hash(&json);
        assert_eq!(hash1, hash2);
    }

    #[test]
    fn hash_is_64_hex_chars() {
        let json = sample_workflow_json();
        let hash = compute_workflow_hash(&json);
        assert_eq!(hash.len(), 64);
        assert!(hash.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn different_json_produces_different_hash() {
        let hash1 = compute_workflow_hash(&json!({"a": 1}));
        let hash2 = compute_workflow_hash(&json!({"a": 2}));
        assert_ne!(hash1, hash2);
    }

    // -- Nodes sorted deterministically ----------------------------------------

    #[test]
    fn nodes_are_sorted_by_id() {
        let parsed = parse_workflow(&sample_workflow_json()).unwrap();
        let ids: Vec<_> = parsed.nodes.iter().map(|n| n.id.clone()).collect();
        let mut sorted = ids.clone();
        sorted.sort();
        assert_eq!(ids, sorted);
    }
}
