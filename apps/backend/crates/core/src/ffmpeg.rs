//! FFmpeg/FFprobe shared command utilities.
//!
//! Foundation for DRY-060: shared FFmpeg command builder used by
//! PRD-24, PRD-25, PRD-39, and PRD-83.

use std::path::Path;

use serde::Deserialize;

/// Error type for FFmpeg/FFprobe operations.
#[derive(Debug, thiserror::Error)]
pub enum FfmpegError {
    #[error("ffprobe/ffmpeg binary not found: {0}")]
    NotFound(std::io::Error),

    #[error("ffprobe/ffmpeg execution failed (exit code {exit_code:?}): {stderr}")]
    ExecutionFailed {
        exit_code: Option<i32>,
        stderr: String,
    },

    #[error("failed to parse ffprobe output: {0}")]
    ParseError(String),

    #[error("I/O error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("video file not found: {0}")]
    VideoNotFound(String),
}

/// Result of a thumbnail extraction.
#[derive(Debug, Clone)]
pub struct ThumbnailResult {
    /// The frame number (0-indexed).
    pub frame_number: i32,
    /// Timestamp in seconds where the frame was extracted.
    pub timestamp_secs: f64,
    /// Path to the generated thumbnail file.
    pub output_path: String,
    /// Width of the thumbnail in pixels.
    pub width: i32,
    /// Height of the thumbnail in pixels.
    pub height: i32,
}

// ---------------------------------------------------------------------------
// ffprobe JSON output structures
// ---------------------------------------------------------------------------

/// Top-level ffprobe JSON output (`-print_format json -show_format -show_streams`).
#[derive(Debug, Deserialize)]
pub struct FfprobeOutput {
    pub streams: Vec<FfprobeStream>,
    pub format: FfprobeFormat,
}

/// A single stream from ffprobe output.
#[derive(Debug, Deserialize)]
pub struct FfprobeStream {
    pub index: i32,
    pub codec_name: Option<String>,
    pub codec_type: Option<String>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    /// e.g. "30/1" or "24000/1001"
    pub r_frame_rate: Option<String>,
    pub channels: Option<i32>,
    pub sample_rate: Option<String>,
    pub duration: Option<String>,
    pub nb_frames: Option<String>,
    pub tags: Option<FfprobeStreamTags>,
}

/// Tags on an ffprobe stream (language, title, etc.).
#[derive(Debug, Deserialize)]
pub struct FfprobeStreamTags {
    pub language: Option<String>,
}

/// Format-level metadata from ffprobe.
#[derive(Debug, Deserialize)]
pub struct FfprobeFormat {
    pub duration: Option<String>,
    pub size: Option<String>,
    pub format_name: Option<String>,
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Run `ffprobe` on a video file and return the parsed JSON output.
pub async fn probe_video(path: &Path) -> Result<FfprobeOutput, FfmpegError> {
    if !path.exists() {
        return Err(FfmpegError::VideoNotFound(
            path.to_string_lossy().to_string(),
        ));
    }

    let output = tokio::process::Command::new("ffprobe")
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
        ])
        .arg(path)
        .output()
        .await
        .map_err(FfmpegError::NotFound)?;

    if !output.status.success() {
        return Err(FfmpegError::ExecutionFailed {
            exit_code: output.status.code(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str::<FfprobeOutput>(&stdout)
        .map_err(|e| FfmpegError::ParseError(format!("{e}: {stdout}")))
}

/// Extract a single frame as a JPEG thumbnail at the given timestamp.
pub async fn extract_frame_thumbnail(
    video_path: &Path,
    output_path: &Path,
    timestamp_secs: f64,
    width: i32,
    height: i32,
) -> Result<(), FfmpegError> {
    if !video_path.exists() {
        return Err(FfmpegError::VideoNotFound(
            video_path.to_string_lossy().to_string(),
        ));
    }

    let output = tokio::process::Command::new("ffmpeg")
        .args(["-y", "-ss", &format!("{timestamp_secs:.3}"), "-i"])
        .arg(video_path)
        .args([
            "-vframes",
            "1",
            "-s",
            &format!("{width}x{height}"),
            "-q:v",
            "2",
        ])
        .arg(output_path)
        .output()
        .await
        .map_err(FfmpegError::NotFound)?;

    if !output.status.success() {
        return Err(FfmpegError::ExecutionFailed {
            exit_code: output.status.code(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        });
    }

    Ok(())
}

/// Extract thumbnails at regular intervals from a video file.
///
/// Returns one `ThumbnailResult` per successfully extracted frame. Thumbnail
/// files are named `thumb_{frame:06}.jpg` inside `output_dir`.
pub async fn extract_thumbnails_at_interval(
    video_path: &Path,
    output_dir: &Path,
    interval_secs: f32,
    width: i32,
    height: i32,
) -> Result<Vec<ThumbnailResult>, FfmpegError> {
    if !video_path.exists() {
        return Err(FfmpegError::VideoNotFound(
            video_path.to_string_lossy().to_string(),
        ));
    }

    tokio::fs::create_dir_all(output_dir).await?;

    // First, probe to get duration and framerate.
    let probe = probe_video(video_path).await?;
    let duration = parse_duration(&probe);
    let framerate = parse_framerate(&probe);

    if duration <= 0.0 {
        return Ok(Vec::new());
    }

    let mut results = Vec::new();
    let mut timestamp = 0.0f64;
    let mut index = 0i32;

    while timestamp < duration {
        let thumb_filename = format!("thumb_{index:06}.jpg");
        let thumb_path = output_dir.join(&thumb_filename);

        extract_frame_thumbnail(video_path, &thumb_path, timestamp, width, height).await?;

        let frame_number = if framerate > 0.0 {
            (timestamp * framerate).round() as i32
        } else {
            index
        };

        results.push(ThumbnailResult {
            frame_number,
            timestamp_secs: timestamp,
            output_path: thumb_path.to_string_lossy().to_string(),
            width,
            height,
        });

        timestamp += interval_secs as f64;
        index += 1;
    }

    Ok(results)
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/// Find the first video stream in the ffprobe output.
fn first_video_stream(probe: &FfprobeOutput) -> Option<&FfprobeStream> {
    probe
        .streams
        .iter()
        .find(|s| s.codec_type.as_deref() == Some("video"))
}

/// Parse the video duration in seconds from ffprobe output.
pub fn parse_duration(probe: &FfprobeOutput) -> f64 {
    // Try format-level duration first.
    if let Some(d) = &probe.format.duration {
        if let Ok(secs) = d.parse::<f64>() {
            return secs;
        }
    }
    // Fall back to the first video stream's duration.
    if let Some(stream) = first_video_stream(probe) {
        if let Some(d) = &stream.duration {
            if let Ok(secs) = d.parse::<f64>() {
                return secs;
            }
        }
    }
    0.0
}

/// Parse the video framerate from ffprobe output.
///
/// The `r_frame_rate` field is a fraction like `"30/1"` or `"24000/1001"`.
pub fn parse_framerate(probe: &FfprobeOutput) -> f64 {
    first_video_stream(probe)
        .and_then(|s| s.r_frame_rate.as_deref())
        .map(parse_fraction)
        .unwrap_or(0.0)
}

/// Parse a fraction string like `"30/1"` into a float.
fn parse_fraction(s: &str) -> f64 {
    let parts: Vec<&str> = s.split('/').collect();
    if parts.len() == 2 {
        let num = parts[0].parse::<f64>().unwrap_or(0.0);
        let den = parts[1].parse::<f64>().unwrap_or(1.0);
        if den > 0.0 {
            return num / den;
        }
    }
    s.parse::<f64>().unwrap_or(0.0)
}

/// Count total frames from ffprobe output.
pub fn parse_total_frames(probe: &FfprobeOutput) -> i64 {
    if let Some(stream) = first_video_stream(probe) {
        if let Some(nb) = &stream.nb_frames {
            if let Ok(n) = nb.parse::<i64>() {
                return n;
            }
        }
    }
    // Estimate from duration * framerate.
    let duration = parse_duration(probe);
    let fps = parse_framerate(probe);
    if duration > 0.0 && fps > 0.0 {
        return (duration * fps).round() as i64;
    }
    0
}

/// Find the first video stream's codec name.
pub fn parse_video_codec(probe: &FfprobeOutput) -> String {
    first_video_stream(probe)
        .and_then(|s| s.codec_name.clone())
        .unwrap_or_default()
}

/// Find the first video stream's resolution.
pub fn parse_resolution(probe: &FfprobeOutput) -> (i32, i32) {
    first_video_stream(probe)
        .map(|s| (s.width.unwrap_or(0), s.height.unwrap_or(0)))
        .unwrap_or((0, 0))
}

/// Extract audio track info from all audio streams.
pub fn parse_audio_tracks(probe: &FfprobeOutput) -> Vec<crate::ffmpeg::AudioTrackInfo> {
    probe
        .streams
        .iter()
        .filter(|s| s.codec_type.as_deref() == Some("audio"))
        .map(|s| AudioTrackInfo {
            index: s.index,
            codec: s.codec_name.clone().unwrap_or_default(),
            channels: s.channels.unwrap_or(0),
            sample_rate: s
                .sample_rate
                .as_deref()
                .and_then(|r| r.parse::<i32>().ok())
                .unwrap_or(0),
            language: s.tags.as_ref().and_then(|t| t.language.clone()),
        })
        .collect()
}

/// Audio track info used by the parsing helpers. Re-exported from the
/// `db::models::video` module for API responses — kept here to avoid
/// a core → db dependency.
#[derive(Debug, Clone, serde::Serialize)]
pub struct AudioTrackInfo {
    pub index: i32,
    pub codec: String,
    pub channels: i32,
    pub sample_rate: i32,
    pub language: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_fraction_standard() {
        assert!((parse_fraction("30/1") - 30.0).abs() < 0.001);
    }

    #[test]
    fn test_parse_fraction_ntsc() {
        let fps = parse_fraction("24000/1001");
        assert!((fps - 23.976).abs() < 0.01);
    }

    #[test]
    fn test_parse_fraction_plain_number() {
        assert!((parse_fraction("25") - 25.0).abs() < 0.001);
    }

    #[test]
    fn test_parse_fraction_zero_denominator() {
        assert!((parse_fraction("30/0") - 0.0).abs() < 0.001);
    }

    #[test]
    fn test_parse_duration_from_format() {
        let probe = FfprobeOutput {
            streams: vec![],
            format: FfprobeFormat {
                duration: Some("120.5".to_string()),
                size: None,
                format_name: None,
            },
        };
        assert!((parse_duration(&probe) - 120.5).abs() < 0.001);
    }

    #[test]
    fn test_parse_duration_from_stream() {
        let probe = FfprobeOutput {
            streams: vec![FfprobeStream {
                index: 0,
                codec_name: Some("h264".into()),
                codec_type: Some("video".into()),
                width: Some(1920),
                height: Some(1080),
                r_frame_rate: Some("30/1".into()),
                channels: None,
                sample_rate: None,
                duration: Some("60.0".into()),
                nb_frames: Some("1800".into()),
                tags: None,
            }],
            format: FfprobeFormat {
                duration: None,
                size: None,
                format_name: None,
            },
        };
        assert!((parse_duration(&probe) - 60.0).abs() < 0.001);
    }

    #[test]
    fn test_parse_framerate() {
        let probe = FfprobeOutput {
            streams: vec![FfprobeStream {
                index: 0,
                codec_name: Some("h264".into()),
                codec_type: Some("video".into()),
                width: Some(1920),
                height: Some(1080),
                r_frame_rate: Some("24000/1001".into()),
                channels: None,
                sample_rate: None,
                duration: None,
                nb_frames: None,
                tags: None,
            }],
            format: FfprobeFormat {
                duration: None,
                size: None,
                format_name: None,
            },
        };
        let fps = parse_framerate(&probe);
        assert!((fps - 23.976).abs() < 0.01);
    }

    #[test]
    fn test_parse_total_frames_from_nb_frames() {
        let probe = FfprobeOutput {
            streams: vec![FfprobeStream {
                index: 0,
                codec_name: Some("h264".into()),
                codec_type: Some("video".into()),
                width: Some(1920),
                height: Some(1080),
                r_frame_rate: Some("30/1".into()),
                channels: None,
                sample_rate: None,
                duration: Some("10.0".into()),
                nb_frames: Some("300".into()),
                tags: None,
            }],
            format: FfprobeFormat {
                duration: Some("10.0".into()),
                size: None,
                format_name: None,
            },
        };
        assert_eq!(parse_total_frames(&probe), 300);
    }

    #[test]
    fn test_parse_total_frames_estimated() {
        let probe = FfprobeOutput {
            streams: vec![FfprobeStream {
                index: 0,
                codec_name: Some("h264".into()),
                codec_type: Some("video".into()),
                width: Some(1920),
                height: Some(1080),
                r_frame_rate: Some("30/1".into()),
                channels: None,
                sample_rate: None,
                duration: None,
                nb_frames: None,
                tags: None,
            }],
            format: FfprobeFormat {
                duration: Some("10.0".into()),
                size: None,
                format_name: None,
            },
        };
        assert_eq!(parse_total_frames(&probe), 300);
    }

    #[test]
    fn test_parse_video_codec() {
        let probe = FfprobeOutput {
            streams: vec![FfprobeStream {
                index: 0,
                codec_name: Some("hevc".into()),
                codec_type: Some("video".into()),
                width: None,
                height: None,
                r_frame_rate: None,
                channels: None,
                sample_rate: None,
                duration: None,
                nb_frames: None,
                tags: None,
            }],
            format: FfprobeFormat {
                duration: None,
                size: None,
                format_name: None,
            },
        };
        assert_eq!(parse_video_codec(&probe), "hevc");
    }

    #[test]
    fn test_parse_audio_tracks() {
        let probe = FfprobeOutput {
            streams: vec![
                FfprobeStream {
                    index: 0,
                    codec_name: Some("h264".into()),
                    codec_type: Some("video".into()),
                    width: Some(1920),
                    height: Some(1080),
                    r_frame_rate: Some("30/1".into()),
                    channels: None,
                    sample_rate: None,
                    duration: None,
                    nb_frames: None,
                    tags: None,
                },
                FfprobeStream {
                    index: 1,
                    codec_name: Some("aac".into()),
                    codec_type: Some("audio".into()),
                    width: None,
                    height: None,
                    r_frame_rate: None,
                    channels: Some(2),
                    sample_rate: Some("48000".into()),
                    duration: None,
                    nb_frames: None,
                    tags: Some(FfprobeStreamTags {
                        language: Some("eng".into()),
                    }),
                },
            ],
            format: FfprobeFormat {
                duration: None,
                size: None,
                format_name: None,
            },
        };
        let tracks = parse_audio_tracks(&probe);
        assert_eq!(tracks.len(), 1);
        assert_eq!(tracks[0].codec, "aac");
        assert_eq!(tracks[0].channels, 2);
        assert_eq!(tracks[0].sample_rate, 48000);
        assert_eq!(tracks[0].language, Some("eng".into()));
    }

    #[test]
    fn test_parse_resolution() {
        let probe = FfprobeOutput {
            streams: vec![FfprobeStream {
                index: 0,
                codec_name: Some("h264".into()),
                codec_type: Some("video".into()),
                width: Some(3840),
                height: Some(2160),
                r_frame_rate: None,
                channels: None,
                sample_rate: None,
                duration: None,
                nb_frames: None,
                tags: None,
            }],
            format: FfprobeFormat {
                duration: None,
                size: None,
                format_name: None,
            },
        };
        assert_eq!(parse_resolution(&probe), (3840, 2160));
    }
}
