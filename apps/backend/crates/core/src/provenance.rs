//! Generation provenance types and validation (PRD-69).
//!
//! Provides data structures for LoRA configuration, staleness tracking,
//! and a deterministic hash function for generation inputs.

use serde::{Deserialize, Serialize};

use crate::error::CoreError;
use crate::hashing::sha256_hex;
use crate::types::DbId;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Maximum number of LoRA adapters that can be attached to a single generation.
pub const MAX_LORA_CONFIGS: usize = 16;

/// Maximum allowed prompt length in characters.
pub const MAX_PROMPT_LENGTH: usize = 10_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Configuration for a single LoRA adapter used during generation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoraConfig {
    pub asset_id: Option<DbId>,
    pub version: String,
    pub hash: String,
    pub weight: f64,
}

/// A reason why a segment's generation receipt is stale relative to current assets.
#[derive(Debug, Clone, Serialize)]
pub struct StalenessReason {
    pub asset_type: String,
    pub asset_name: String,
    pub receipt_version: String,
    pub current_version: String,
}

// ---------------------------------------------------------------------------
// Hash computation
// ---------------------------------------------------------------------------

/// Compute a deterministic SHA-256 hash of all generation inputs.
///
/// The hash is used to detect whether two generation runs used identical
/// parameters. The concatenation order is fixed and must not be changed
/// after any receipts have been persisted.
pub fn compute_inputs_hash(
    source_image_hash: &str,
    variant_image_hash: &str,
    workflow_hash: &str,
    model_hash: &str,
    lora_configs: &[LoraConfig],
    prompt_text: &str,
    cfg_scale: f64,
    seed: i64,
) -> String {
    let mut material = String::new();
    material.push_str(source_image_hash);
    material.push('|');
    material.push_str(variant_image_hash);
    material.push('|');
    material.push_str(workflow_hash);
    material.push('|');
    material.push_str(model_hash);
    material.push('|');

    // Sort LoRA configs by hash to ensure deterministic ordering.
    let mut sorted_loras: Vec<&LoraConfig> = lora_configs.iter().collect();
    sorted_loras.sort_by(|a, b| a.hash.cmp(&b.hash));
    for lora in &sorted_loras {
        material.push_str(&lora.hash);
        material.push(':');
        material.push_str(&format!("{:.6}", lora.weight));
        material.push(',');
    }
    material.push('|');

    material.push_str(prompt_text);
    material.push('|');
    material.push_str(&format!("{cfg_scale:.6}"));
    material.push('|');
    material.push_str(&seed.to_string());

    sha256_hex(material.as_bytes())
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/// Validate receipt input parameters before persisting.
///
/// Returns `Ok(())` if all inputs are within acceptable bounds.
pub fn validate_receipt_inputs(
    prompt_len: usize,
    lora_count: usize,
    resolution_width: i32,
    resolution_height: i32,
    steps: i32,
    cfg_scale: f64,
) -> Result<(), CoreError> {
    if prompt_len > MAX_PROMPT_LENGTH {
        return Err(CoreError::Validation(format!(
            "Prompt exceeds maximum length of {MAX_PROMPT_LENGTH} characters (got {prompt_len})"
        )));
    }

    if lora_count > MAX_LORA_CONFIGS {
        return Err(CoreError::Validation(format!(
            "LoRA count exceeds maximum of {MAX_LORA_CONFIGS} (got {lora_count})"
        )));
    }

    if resolution_width <= 0 {
        return Err(CoreError::Validation(format!(
            "Resolution width must be positive (got {resolution_width})"
        )));
    }

    if resolution_height <= 0 {
        return Err(CoreError::Validation(format!(
            "Resolution height must be positive (got {resolution_height})"
        )));
    }

    if steps <= 0 {
        return Err(CoreError::Validation(format!(
            "Steps must be positive (got {steps})"
        )));
    }

    if cfg_scale <= 0.0 {
        return Err(CoreError::Validation(format!(
            "CFG scale must be positive (got {cfg_scale})"
        )));
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_lora() -> LoraConfig {
        LoraConfig {
            asset_id: Some(42),
            version: "1.0".to_string(),
            hash: "abc123".to_string(),
            weight: 0.75,
        }
    }

    // -- Hash determinism tests --

    #[test]
    fn hash_is_deterministic() {
        let h1 = compute_inputs_hash("src", "var", "wf", "model", &[], "prompt", 7.5, 12345);
        let h2 = compute_inputs_hash("src", "var", "wf", "model", &[], "prompt", 7.5, 12345);
        assert_eq!(h1, h2);
    }

    #[test]
    fn hash_length_is_64_hex_chars() {
        let h = compute_inputs_hash("a", "b", "c", "d", &[], "p", 1.0, 1);
        assert_eq!(h.len(), 64);
    }

    #[test]
    fn different_source_hash_produces_different_result() {
        let h1 = compute_inputs_hash("src1", "var", "wf", "model", &[], "prompt", 7.5, 1);
        let h2 = compute_inputs_hash("src2", "var", "wf", "model", &[], "prompt", 7.5, 1);
        assert_ne!(h1, h2);
    }

    #[test]
    fn different_seed_produces_different_result() {
        let h1 = compute_inputs_hash("src", "var", "wf", "model", &[], "prompt", 7.5, 1);
        let h2 = compute_inputs_hash("src", "var", "wf", "model", &[], "prompt", 7.5, 2);
        assert_ne!(h1, h2);
    }

    #[test]
    fn different_cfg_scale_produces_different_result() {
        let h1 = compute_inputs_hash("src", "var", "wf", "model", &[], "prompt", 7.0, 1);
        let h2 = compute_inputs_hash("src", "var", "wf", "model", &[], "prompt", 7.5, 1);
        assert_ne!(h1, h2);
    }

    #[test]
    fn different_prompt_produces_different_result() {
        let h1 = compute_inputs_hash("src", "var", "wf", "model", &[], "prompt1", 7.5, 1);
        let h2 = compute_inputs_hash("src", "var", "wf", "model", &[], "prompt2", 7.5, 1);
        assert_ne!(h1, h2);
    }

    #[test]
    fn lora_order_does_not_affect_hash() {
        let lora_a = LoraConfig {
            asset_id: Some(1),
            version: "1.0".to_string(),
            hash: "aaa".to_string(),
            weight: 0.5,
        };
        let lora_b = LoraConfig {
            asset_id: Some(2),
            version: "1.0".to_string(),
            hash: "bbb".to_string(),
            weight: 0.7,
        };

        let h1 = compute_inputs_hash(
            "s",
            "v",
            "w",
            "m",
            &[lora_a.clone(), lora_b.clone()],
            "p",
            1.0,
            1,
        );
        let h2 = compute_inputs_hash("s", "v", "w", "m", &[lora_b, lora_a], "p", 1.0, 1);
        assert_eq!(h1, h2);
    }

    #[test]
    fn with_lora_differs_from_without() {
        let lora = sample_lora();
        let h1 = compute_inputs_hash("s", "v", "w", "m", &[], "p", 1.0, 1);
        let h2 = compute_inputs_hash("s", "v", "w", "m", &[lora], "p", 1.0, 1);
        assert_ne!(h1, h2);
    }

    // -- Validation tests --

    #[test]
    fn valid_inputs_pass() {
        assert!(validate_receipt_inputs(100, 2, 512, 512, 20, 7.5).is_ok());
    }

    #[test]
    fn prompt_too_long_rejected() {
        let result = validate_receipt_inputs(MAX_PROMPT_LENGTH + 1, 0, 512, 512, 20, 7.5);
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains("Prompt exceeds maximum length"));
    }

    #[test]
    fn too_many_loras_rejected() {
        let result = validate_receipt_inputs(100, MAX_LORA_CONFIGS + 1, 512, 512, 20, 7.5);
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains("LoRA count exceeds maximum"));
    }

    #[test]
    fn zero_resolution_width_rejected() {
        let result = validate_receipt_inputs(100, 0, 0, 512, 20, 7.5);
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains("Resolution width must be positive"));
    }

    #[test]
    fn negative_resolution_height_rejected() {
        let result = validate_receipt_inputs(100, 0, 512, -1, 20, 7.5);
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains("Resolution height must be positive"));
    }

    #[test]
    fn zero_steps_rejected() {
        let result = validate_receipt_inputs(100, 0, 512, 512, 0, 7.5);
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains("Steps must be positive"));
    }

    #[test]
    fn negative_cfg_scale_rejected() {
        let result = validate_receipt_inputs(100, 0, 512, 512, 20, -1.0);
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains("CFG scale must be positive"));
    }

    #[test]
    fn zero_cfg_scale_rejected() {
        let result = validate_receipt_inputs(100, 0, 512, 512, 20, 0.0);
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains("CFG scale must be positive"));
    }

    #[test]
    fn boundary_prompt_length_passes() {
        assert!(validate_receipt_inputs(MAX_PROMPT_LENGTH, 0, 512, 512, 20, 7.5).is_ok());
    }

    #[test]
    fn boundary_lora_count_passes() {
        assert!(validate_receipt_inputs(100, MAX_LORA_CONFIGS, 512, 512, 20, 7.5).is_ok());
    }
}
