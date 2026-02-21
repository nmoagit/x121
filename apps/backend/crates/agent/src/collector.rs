//! NVML-based GPU metrics collection.
//!
//! [`MetricsCollector`] wraps the NVIDIA Management Library to
//! enumerate GPUs and gather per-device metrics (VRAM, temperature,
//! utilization, power, fan speed).
//!
//! NVML initialisation is **gracefully optional** -- if the host has no
//! NVIDIA drivers (e.g. a developer laptop), the collector logs a
//! warning and reports zero GPUs instead of panicking.

use nvml_wrapper::enum_wrappers::device::TemperatureSensor;
use nvml_wrapper::Nvml;
use serde::Serialize;

/// Per-GPU snapshot collected from NVML.
#[derive(Debug, Clone, Serialize)]
pub struct GpuMetrics {
    pub gpu_index: u32,
    pub vram_used_mb: u32,
    pub vram_total_mb: u32,
    pub temperature_celsius: u32,
    pub utilization_percent: u32,
    /// Not all GPUs report power draw.
    pub power_draw_watts: Option<u32>,
    /// Not all GPUs expose fan speed (e.g. passively-cooled cards).
    pub fan_speed_percent: Option<u32>,
}

/// Wraps NVML and provides a single `collect()` method that returns
/// metrics for every GPU visible on the host.
pub struct MetricsCollector {
    /// `None` when NVML could not be initialised (no drivers / no GPU).
    nvml: Option<Nvml>,
}

const BYTES_PER_MB: u64 = 1024 * 1024;

impl Default for MetricsCollector {
    fn default() -> Self {
        Self::new()
    }
}

impl MetricsCollector {
    /// Attempt to initialise NVML.
    ///
    /// Returns a collector that reports zero GPUs if NVML is not
    /// available (missing drivers, no NVIDIA hardware, etc.).
    pub fn new() -> Self {
        let nvml = match Nvml::init() {
            Ok(nvml) => {
                tracing::info!("NVML initialised successfully");
                Some(nvml)
            }
            Err(e) => {
                tracing::warn!(error = %e, "NVML unavailable -- GPU metrics will not be collected");
                None
            }
        };
        Self { nvml }
    }

    /// Number of GPUs visible to NVML, or 0 if NVML is unavailable.
    pub fn gpu_count(&self) -> u32 {
        self.nvml
            .as_ref()
            .and_then(|nvml| nvml.device_count().ok())
            .unwrap_or(0)
    }

    /// Collect a metrics snapshot for every GPU on the host.
    ///
    /// Errors on individual devices are logged and the device is
    /// skipped rather than failing the entire collection pass.
    pub fn collect(&self) -> Vec<GpuMetrics> {
        let nvml = match self.nvml.as_ref() {
            Some(nvml) => nvml,
            None => return Vec::new(),
        };

        let device_count = match nvml.device_count() {
            Ok(n) => n,
            Err(e) => {
                tracing::error!(error = %e, "Failed to query GPU device count");
                return Vec::new();
            }
        };

        let mut metrics = Vec::with_capacity(device_count as usize);

        for idx in 0..device_count {
            match self.collect_device(nvml, idx) {
                Ok(m) => metrics.push(m),
                Err(e) => {
                    tracing::warn!(gpu_index = idx, error = %e, "Skipping GPU -- metrics collection failed");
                }
            }
        }

        metrics
    }

    /// Collect metrics for a single GPU device.
    fn collect_device(
        &self,
        nvml: &Nvml,
        idx: u32,
    ) -> Result<GpuMetrics, nvml_wrapper::error::NvmlError> {
        let device = nvml.device_by_index(idx)?;

        let mem_info = device.memory_info()?;
        let temperature = device.temperature(TemperatureSensor::Gpu)?;
        let utilization = device.utilization_rates()?;

        // Power draw is in milliwatts; convert to whole watts.
        let power_draw_watts = device.power_usage().ok().map(|mw| mw / 1000);

        // Fan speed for fan index 0 (primary). Not all GPUs expose this.
        let fan_speed_percent = device.fan_speed(0).ok();

        Ok(GpuMetrics {
            gpu_index: idx,
            vram_used_mb: (mem_info.used / BYTES_PER_MB) as u32,
            vram_total_mb: (mem_info.total / BYTES_PER_MB) as u32,
            temperature_celsius: temperature,
            utilization_percent: utilization.gpu,
            power_draw_watts,
            fan_speed_percent,
        })
    }
}
