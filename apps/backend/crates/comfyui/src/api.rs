//! REST API client for the ComfyUI HTTP endpoints.
//!
//! Wraps the ComfyUI HTTP API (workflow submission, cancellation,
//! interruption, history retrieval) using [`reqwest`].

use serde::{Deserialize, Serialize};

/// HTTP client for a single ComfyUI instance.
pub struct ComfyUIApi {
    client: reqwest::Client,
    api_url: String,
}

/// Response returned by the ComfyUI `/prompt` endpoint after
/// successfully queuing a workflow.
#[derive(Debug, Deserialize)]
pub struct SubmitResponse {
    /// Server-assigned identifier for the queued prompt.
    pub prompt_id: String,
    /// Position in the execution queue.
    pub number: i32,
}

/// Full information about an output file from ComfyUI history.
///
/// ComfyUI outputs include `filename`, `subfolder`, and `type` fields.
/// All three are needed to download via the `/view` endpoint.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutputFileInfo {
    pub filename: String,
    /// Subfolder within the output directory (often empty string).
    pub subfolder: String,
    /// Output type — typically `"output"` or `"temp"`.
    #[serde(rename = "type")]
    pub file_type: String,
}

/// System stats returned by ComfyUI's `GET /system_stats` endpoint.
#[derive(Debug, Deserialize)]
pub struct SystemStats {
    pub system: SystemInfo,
}

/// System information from the stats endpoint.
#[derive(Debug, Deserialize)]
pub struct SystemInfo {
    pub os: Option<String>,
    pub python_version: Option<String>,
    pub embedded_python: Option<bool>,
}

/// Response from `POST /upload/image`.
#[derive(Debug, Deserialize)]
pub struct UploadImageResponse {
    /// The filename as stored on the ComfyUI server.
    pub name: String,
    /// Subfolder within the input directory.
    pub subfolder: Option<String>,
    /// File type — typically `"input"`.
    #[serde(rename = "type")]
    pub file_type: Option<String>,
}

/// Errors from the ComfyUI REST API layer.
#[derive(Debug, thiserror::Error)]
pub enum ComfyUIApiError {
    /// The HTTP request itself failed (network, DNS, TLS, etc.).
    #[error("HTTP request failed: {0}")]
    Request(#[from] reqwest::Error),

    /// ComfyUI returned a non-2xx status code.
    #[error("ComfyUI API error ({status}): {body}")]
    ApiError {
        /// HTTP status code.
        status: u16,
        /// Raw response body for debugging.
        body: String,
    },
}

impl ComfyUIApi {
    /// Create a new API client for a ComfyUI instance.
    ///
    /// * `api_url` - Base HTTP URL, e.g. `http://host:8188`.
    pub fn new(api_url: String) -> Self {
        Self {
            client: reqwest::Client::new(),
            api_url,
        }
    }

    /// Create an API client reusing an existing [`reqwest::Client`]
    /// (useful for connection pooling across multiple instances).
    pub fn with_client(client: reqwest::Client, api_url: String) -> Self {
        Self { client, api_url }
    }

    /// Submit a workflow for execution.
    ///
    /// Sends a `POST /prompt` request with the given workflow JSON and
    /// client ID.  Returns the server-assigned `prompt_id` and queue
    /// position.
    pub async fn submit_workflow(
        &self,
        workflow: &serde_json::Value,
        client_id: &str,
    ) -> Result<SubmitResponse, ComfyUIApiError> {
        let body = serde_json::json!({
            "prompt": workflow,
            "client_id": client_id,
        });

        let response = self
            .client
            .post(format!("{}/prompt", self.api_url))
            .json(&body)
            .send()
            .await?;

        Self::parse_response(response).await
    }

    /// Cancel a queued or running execution.
    ///
    /// Sends a `POST /queue` request asking ComfyUI to delete the
    /// specified prompt from the queue.
    pub async fn cancel_execution(&self, prompt_id: &str) -> Result<(), ComfyUIApiError> {
        let body = serde_json::json!({
            "delete": [prompt_id],
        });

        let response = self
            .client
            .post(format!("{}/queue", self.api_url))
            .json(&body)
            .send()
            .await?;

        Self::check_status(response).await
    }

    /// Interrupt the currently running execution immediately.
    ///
    /// Sends a `POST /interrupt` request.  This does not target a
    /// specific prompt -- it interrupts whatever is executing right now.
    pub async fn interrupt(&self) -> Result<(), ComfyUIApiError> {
        let response = self
            .client
            .post(format!("{}/interrupt", self.api_url))
            .send()
            .await?;

        Self::check_status(response).await
    }

    /// Retrieve execution history for a specific prompt.
    ///
    /// Sends a `GET /history/{prompt_id}` request.  The returned JSON
    /// contains output file paths, node results, and timing data.
    pub async fn get_history(&self, prompt_id: &str) -> Result<serde_json::Value, ComfyUIApiError> {
        let response = self
            .client
            .get(format!("{}/history/{}", self.api_url, prompt_id))
            .send()
            .await?;

        Self::parse_response(response).await
    }

    /// Get the base API URL for this instance.
    pub fn api_url(&self) -> &str {
        &self.api_url
    }

    /// Download an output file from ComfyUI's `/view` endpoint.
    ///
    /// ComfyUI serves generated files at `GET /view?filename=<name>&subfolder=<sub>&type=<type>`.
    /// Returns the raw bytes of the file.
    pub async fn download_output(&self, info: &OutputFileInfo) -> Result<Vec<u8>, ComfyUIApiError> {
        let response = self
            .client
            .get(format!("{}/view", self.api_url))
            .query(&[
                ("filename", info.filename.as_str()),
                ("subfolder", info.subfolder.as_str()),
                ("type", info.file_type.as_str()),
            ])
            .send()
            .await?;
        let response = Self::ensure_success(response).await?;
        Ok(response.bytes().await?.to_vec())
    }

    /// Upload an image to ComfyUI via `POST /upload/image`.
    ///
    /// Used to upload seed images before submitting a workflow that
    /// references them via a `LoadImage` node. Returns the server-side
    /// filename (which may differ from the original if renamed).
    pub async fn upload_image(
        &self,
        filename: &str,
        image_bytes: Vec<u8>,
        overwrite: bool,
    ) -> Result<UploadImageResponse, ComfyUIApiError> {
        let part = reqwest::multipart::Part::bytes(image_bytes)
            .file_name(filename.to_string())
            .mime_str("image/png")
            .unwrap_or_else(|_| {
                reqwest::multipart::Part::bytes(vec![]).file_name(filename.to_string())
            });

        let form = reqwest::multipart::Form::new()
            .part("image", part)
            .text("overwrite", if overwrite { "true" } else { "false" });

        let response = self
            .client
            .post(format!("{}/upload/image", self.api_url))
            .multipart(form)
            .send()
            .await?;

        Self::parse_response(response).await
    }

    /// Check if ComfyUI is alive and responsive via `GET /system_stats`.
    pub async fn health_check(&self) -> Result<SystemStats, ComfyUIApiError> {
        let response = self
            .client
            .get(format!("{}/system_stats", self.api_url))
            .send()
            .await?;
        Self::parse_response(response).await
    }

    /// Clear the entire execution queue via `POST /queue`.
    ///
    /// Sends `{"clear": true}` to remove all pending items from the queue.
    pub async fn clear_queue(&self) -> Result<(), ComfyUIApiError> {
        let body = serde_json::json!({ "clear": true });
        let response = self
            .client
            .post(format!("{}/queue", self.api_url))
            .json(&body)
            .send()
            .await?;
        Self::check_status(response).await
    }

    // ---- public utilities ----

    /// Extract the first output file info from a ComfyUI history response.
    ///
    /// History format: `{ "<prompt_id>": { "outputs": { "<node_id>": { "gifs"|"videos"|"images": [{ "filename": "...", "subfolder": "...", "type": "..." }] } } } }`
    ///
    /// Returns full [`OutputFileInfo`] including subfolder and type, which
    /// are needed for the `/view` download endpoint.
    pub fn extract_output_info(
        history: &serde_json::Value,
        prompt_id: &str,
    ) -> Result<OutputFileInfo, String> {
        let prompt_data = history
            .get(prompt_id)
            .ok_or_else(|| format!("No history entry for prompt {prompt_id}"))?;

        let outputs = prompt_data
            .get("outputs")
            .and_then(|o| o.as_object())
            .ok_or_else(|| "No outputs in history".to_string())?;

        for (_node_id, node_output) in outputs {
            for key in &["gifs", "videos", "images"] {
                if let Some(files) = node_output.get(*key).and_then(|v| v.as_array()) {
                    if let Some(first) = files.first() {
                        if let Some(filename) = first.get("filename").and_then(|f| f.as_str()) {
                            return Ok(OutputFileInfo {
                                filename: filename.to_string(),
                                subfolder: first
                                    .get("subfolder")
                                    .and_then(|s| s.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                                file_type: first
                                    .get("type")
                                    .and_then(|t| t.as_str())
                                    .unwrap_or("output")
                                    .to_string(),
                            });
                        }
                    }
                }
            }
        }

        Err("No output files found in ComfyUI history".to_string())
    }

    /// Backwards-compatible wrapper that returns only the filename.
    pub fn extract_output_filename(
        history: &serde_json::Value,
        prompt_id: &str,
    ) -> Result<String, String> {
        Self::extract_output_info(history, prompt_id).map(|info| info.filename)
    }

    // ---- private helpers ----

    /// Ensure the response has a success status code. Returns the
    /// response unchanged on success, or a [`ComfyUIApiError::ApiError`]
    /// containing the status and body text on failure.
    async fn ensure_success(
        response: reqwest::Response,
    ) -> Result<reqwest::Response, ComfyUIApiError> {
        let status = response.status();
        if !status.is_success() {
            let body = response
                .text()
                .await
                .unwrap_or_else(|_| "<unreadable body>".to_string());
            return Err(ComfyUIApiError::ApiError {
                status: status.as_u16(),
                body,
            });
        }
        Ok(response)
    }

    /// Parse a successful JSON response body into the expected type.
    async fn parse_response<T: serde::de::DeserializeOwned>(
        response: reqwest::Response,
    ) -> Result<T, ComfyUIApiError> {
        let response = Self::ensure_success(response).await?;
        Ok(response.json::<T>().await?)
    }

    /// Assert the response has a success status code, discarding the body.
    async fn check_status(response: reqwest::Response) -> Result<(), ComfyUIApiError> {
        Self::ensure_success(response).await?;
        Ok(())
    }
}
