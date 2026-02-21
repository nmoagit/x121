/**
 * Client-side bridge between extension iframes and the platform API (PRD-85).
 *
 * Validates incoming postMessage requests from sandboxed extension iframes,
 * checks permissions client-side (defense in depth), routes API calls through
 * the backend extension-api proxy, and sends responses back.
 */

import { ApiRequestError, api } from "@/lib/api";
import type { ExtensionApiRequest, ExtensionApiResponse, Permission } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "DELETE"]);

/* --------------------------------------------------------------------------
   Permission helpers
   -------------------------------------------------------------------------- */

function hasPermission(permissions: Permission[], resource: string, method: string): boolean {
  const accessNeeded = methodToAccess(method);
  return permissions.some(
    (p) =>
      (p.resource === resource || p.resource === "*") &&
      (p.access === accessNeeded || p.access === "*"),
  );
}

/**
 * Map HTTP methods to permission access levels.
 *
 * Must stay in sync with `KNOWN_ACCESS_LEVELS` in
 * `core/src/extensions.rs` which defines `["read", "write"]`.
 * The backend also enforces this -- this is defense in depth.
 */
function methodToAccess(method: string): string {
  switch (method) {
    case "GET":
      return "read";
    case "POST":
    case "PUT":
    case "DELETE":
      return "write";
    default:
      return "read";
  }
}

/* --------------------------------------------------------------------------
   Bridge class
   -------------------------------------------------------------------------- */

export class ExtensionApiBridge {
  private iframe: HTMLIFrameElement;
  private extensionId: number;
  private permissions: Permission[];
  private boundHandler: (event: MessageEvent) => void;

  constructor(iframe: HTMLIFrameElement, extensionId: number, permissions: Permission[]) {
    this.iframe = iframe;
    this.extensionId = extensionId;
    this.permissions = permissions;
    this.boundHandler = this.handleMessage.bind(this);
  }

  /** Start listening for messages from the extension iframe. */
  start(): void {
    window.addEventListener("message", this.boundHandler);
  }

  /** Stop listening for messages and clean up. */
  stop(): void {
    window.removeEventListener("message", this.boundHandler);
  }

  private async handleMessage(event: MessageEvent): Promise<void> {
    // Only accept messages from our own iframe.
    if (event.source !== this.iframe.contentWindow) return;

    const data = event.data as Partial<ExtensionApiRequest> | undefined;
    if (!data || data.type !== "api_request") return;

    const { requestId, method, resource, path, body } = data;

    if (!requestId || !method || !resource) return;

    // Validate HTTP method.
    if (!ALLOWED_METHODS.has(method)) {
      this.sendResponse({
        type: "api_response",
        requestId,
        status: 400,
        error: `Unsupported method: ${method}`,
      });
      return;
    }

    // Client-side permission check (defense in depth -- server also checks).
    if (!hasPermission(this.permissions, resource, method)) {
      this.sendResponse({
        type: "api_response",
        requestId,
        status: 403,
        error: `Permission denied for ${method} on ${resource}`,
      });
      return;
    }

    // Build the backend extension-api proxy path.
    const apiPath = path
      ? `/extension-api/${resource}/${path}?extension_id=${this.extensionId}`
      : `/extension-api/${resource}?extension_id=${this.extensionId}`;

    try {
      let result: unknown;
      switch (method) {
        case "GET":
          result = await api.get(apiPath);
          break;
        case "POST":
          result = await api.post(apiPath, body);
          break;
        case "PUT":
          result = await api.put(apiPath, body);
          break;
        case "DELETE":
          result = await api.delete(apiPath);
          break;
      }

      this.sendResponse({
        type: "api_response",
        requestId,
        status: 200,
        data: result,
      });
    } catch (err) {
      const status = err instanceof ApiRequestError ? err.status : 500;
      const message = err instanceof Error ? err.message : "Unknown error";

      this.sendResponse({
        type: "api_response",
        requestId,
        status,
        error: message,
      });
    }
  }

  private sendResponse(response: ExtensionApiResponse): void {
    this.iframe.contentWindow?.postMessage(response, "*");
  }
}
