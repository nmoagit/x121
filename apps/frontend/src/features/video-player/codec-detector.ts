import type { CodecCapability } from "./types";

/**
 * Codec configurations to test. Each entry has a WebCodecs codec string,
 * a MIME type for MediaSource fallback, and a human-readable label.
 */
const CODEC_CONFIGS = [
  {
    codec: "avc1.42E01E",
    label: "H.264 Baseline",
    mime: 'video/mp4; codecs="avc1.42E01E"',
  },
  {
    codec: "avc1.4D401F",
    label: "H.264 Main",
    mime: 'video/mp4; codecs="avc1.4D401F"',
  },
  {
    codec: "hvc1.1.6.L93.B0",
    label: "H.265/HEVC",
    mime: 'video/mp4; codecs="hvc1.1.6.L93.B0"',
  },
  {
    codec: "vp09.00.10.08",
    label: "VP9",
    mime: 'video/webm; codecs="vp09.00.10.08"',
  },
  {
    codec: "av01.0.04M.08",
    label: "AV1",
    mime: 'video/mp4; codecs="av01.0.04M.08"',
  },
] as const;

let cachedCapabilities: CodecCapability[] | null = null;

/** Returns `true` if the WebCodecs API is available in the current browser. */
export function isWebCodecsAvailable(): boolean {
  return typeof VideoDecoder !== "undefined" && typeof VideoDecoder.isConfigSupported === "function";
}

/**
 * Detect codec capabilities for all supported codecs.
 *
 * Uses the WebCodecs API when available for accurate hardware acceleration
 * detection, with a MediaSource fallback for older browsers. Results are
 * cached for the duration of the session.
 */
export async function detectCodecCapabilities(): Promise<CodecCapability[]> {
  if (cachedCapabilities) {
    return cachedCapabilities;
  }

  const results: CodecCapability[] = [];

  for (const config of CODEC_CONFIGS) {
    const capability = await detectSingleCodec(config);
    results.push(capability);
  }

  cachedCapabilities = results;
  return results;
}

async function detectSingleCodec(config: {
  codec: string;
  label: string;
  mime: string;
}): Promise<CodecCapability> {
  // Try WebCodecs first for accurate hardware acceleration detection.
  if (isWebCodecsAvailable()) {
    try {
      const support = await VideoDecoder.isConfigSupported({
        codec: config.codec,
        codedWidth: 1920,
        codedHeight: 1080,
      });
      return {
        codec: config.codec,
        label: config.label,
        hardwareAccelerated: support.config?.hardwareAcceleration === "prefer-hardware",
        supported: support.supported ?? false,
      };
    } catch {
      // Fall through to MediaSource check.
    }
  }

  // MediaSource fallback — cannot detect hardware acceleration.
  const supported =
    typeof MediaSource !== "undefined" && MediaSource.isTypeSupported(config.mime);

  return {
    codec: config.codec,
    label: config.label,
    hardwareAccelerated: false,
    supported,
  };
}
