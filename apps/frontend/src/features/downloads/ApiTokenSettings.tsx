/**
 * API token management for CivitAI and HuggingFace services (PRD-104).
 *
 * Shows token status for each service, allows storing new tokens
 * (displays hint when stored), and deleting existing tokens.
 */

import { useState } from "react";

import { Badge, Input } from "@/components/primitives";
import { Save, Trash2 } from "@/tokens/icons";

import { useApiTokens, useDeleteToken, useStoreToken } from "./hooks/use-downloads";
import type { ApiTokenInfo } from "./types";

/* --------------------------------------------------------------------------
   Service config
   -------------------------------------------------------------------------- */

const SERVICES = [
  {
    name: "civitai",
    label: "CivitAI",
    placeholder: "Paste your CivitAI API key...",
    helpUrl: "https://civitai.com/user/account",
  },
  {
    name: "huggingface",
    label: "HuggingFace",
    placeholder: "Paste your HuggingFace access token...",
    helpUrl: "https://huggingface.co/settings/tokens",
  },
] as const;

/* --------------------------------------------------------------------------
   Service section sub-component
   -------------------------------------------------------------------------- */

interface ServiceSectionProps {
  service: (typeof SERVICES)[number];
  token: ApiTokenInfo | undefined;
  onStore: (service: string, token: string) => void;
  onDelete: (service: string) => void;
  isStoring: boolean;
}

function ServiceSection({ service, token, onStore, onDelete, isStoring }: ServiceSectionProps) {
  const [inputValue, setInputValue] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!inputValue.trim()) return;
    onStore(service.name, inputValue.trim());
    setInputValue("");
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-primary)] px-[var(--spacing-4)] py-[var(--spacing-3)]">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
          {service.label}
        </h3>
        {token && (
          <Badge variant={token.is_valid ? "success" : "danger"} size="sm">
            {token.is_valid ? "Connected" : "Invalid"}
          </Badge>
        )}
      </div>

      {token ? (
        <div className="mt-[var(--spacing-2)]">
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--color-text-muted)]">
              Token: <span className="font-mono">{token.token_hint}</span>
            </span>
            <button
              type="button"
              onClick={() => onDelete(service.name)}
              className="inline-flex items-center gap-[var(--spacing-1)] rounded-[var(--radius-sm)] px-[var(--spacing-2)] py-[var(--spacing-1)] text-xs text-[var(--color-danger)] hover:bg-[var(--color-surface-tertiary)] transition-colors"
            >
              <Trash2 size={12} aria-hidden />
              Remove
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-[var(--spacing-2)] flex gap-[var(--spacing-2)]">
          <div className="flex-1">
            <Input
              type="password"
              placeholder={service.placeholder}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={!inputValue.trim() || isStoring}
            className="inline-flex items-center gap-[var(--spacing-1)] rounded-[var(--radius-md)] bg-[var(--color-primary)] px-[var(--spacing-3)] py-[var(--spacing-2)] text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <Save size={14} aria-hidden />
            Save
          </button>
        </form>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function ApiTokenSettings() {
  const { data: tokens } = useApiTokens();
  const storeToken = useStoreToken();
  const deleteToken = useDeleteToken();

  function getToken(service: string): ApiTokenInfo | undefined {
    return tokens?.find((t) => t.service_name === service);
  }

  return (
    <div className="space-y-[var(--spacing-4)]">
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
        API Tokens
      </h2>
      <p className="text-sm text-[var(--color-text-muted)]">
        Connect your accounts to download models directly from external services.
      </p>

      <div className="space-y-[var(--spacing-3)]">
        {SERVICES.map((service) => (
          <ServiceSection
            key={service.name}
            service={service}
            token={getToken(service.name)}
            onStore={(sn, tk) => storeToken.mutate({ service_name: sn, token: tk })}
            onDelete={(sn) => deleteToken.mutate(sn)}
            isStoring={storeToken.isPending}
          />
        ))}
      </div>
    </div>
  );
}
