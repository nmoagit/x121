//! REST API client for the ComfyUI HTTP endpoints.
//!
//! Wraps the ComfyUI HTTP API (workflow submission, cancellation,
//! interruption, history retrieval) using [`reqwest`].

use serde::Deserialize;

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
