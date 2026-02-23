/**
 * Model Checksum Manager — CRUD table for model checksums (PRD-43).
 *
 * Displays a table of known model checksums with inline create/delete
 * actions. Used by admins to manage the trusted model manifest.
 */

import { useState } from "react";

import { Button, Input } from "@/components/primitives";
import { Card, CardBody, CardHeader } from "@/components/composite";
import { formatBytes } from "@/lib/format";

import type { CreateModelChecksum, ModelChecksum } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface ModelChecksumManagerProps {
  checksums: ModelChecksum[];
  onCreateChecksum: (input: CreateModelChecksum) => void;
  onDeleteChecksum: (id: number) => void;
}

/* --------------------------------------------------------------------------
   Create form
   -------------------------------------------------------------------------- */

function CreateChecksumForm({
  onSubmit,
}: {
  onSubmit: (input: CreateModelChecksum) => void;
}) {
  const [modelName, setModelName] = useState("");
  const [filePath, setFilePath] = useState("");
  const [expectedHash, setExpectedHash] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!modelName.trim() || !filePath.trim() || !expectedHash.trim()) return;

    onSubmit({
      model_name: modelName.trim(),
      file_path: filePath.trim(),
      expected_hash: expectedHash.trim(),
    });
    setModelName("");
    setFilePath("");
    setExpectedHash("");
  };

  return (
    <form
      data-testid="create-checksum-form"
      onSubmit={handleSubmit}
      className="flex gap-2 items-end"
    >
      <div className="flex-1">
        <label className="text-xs text-[var(--color-text-secondary)] mb-1 block">
          Model Name
        </label>
        <Input
          data-testid="input-model-name"
          value={modelName}
          onChange={(e) => setModelName(e.target.value)}
          placeholder="e.g. sd_xl_base_1.0"
        />
      </div>
      <div className="flex-1">
        <label className="text-xs text-[var(--color-text-secondary)] mb-1 block">
          File Path
        </label>
        <Input
          data-testid="input-file-path"
          value={filePath}
          onChange={(e) => setFilePath(e.target.value)}
          placeholder="e.g. checkpoints/sd_xl_base_1.0.safetensors"
        />
      </div>
      <div className="flex-1">
        <label className="text-xs text-[var(--color-text-secondary)] mb-1 block">
          Expected Hash
        </label>
        <Input
          data-testid="input-expected-hash"
          value={expectedHash}
          onChange={(e) => setExpectedHash(e.target.value)}
          placeholder="SHA-256 hash"
        />
      </div>
      <Button type="submit" size="sm" data-testid="btn-create-checksum">
        Add
      </Button>
    </form>
  );
}

/* --------------------------------------------------------------------------
   Checksum row
   -------------------------------------------------------------------------- */

function ChecksumRow({
  checksum,
  onDelete,
}: {
  checksum: ModelChecksum;
  onDelete: (id: number) => void;
}) {
  return (
    <tr data-testid={`checksum-row-${checksum.id}`}>
      <td className="px-3 py-2 text-sm text-[var(--color-text-primary)]">
        {checksum.model_name}
      </td>
      <td className="px-3 py-2 text-sm text-[var(--color-text-secondary)] truncate max-w-[200px]">
        {checksum.file_path}
      </td>
      <td className="px-3 py-2 text-xs text-[var(--color-text-muted)] font-mono truncate max-w-[180px]">
        {checksum.expected_hash}
      </td>
      <td className="px-3 py-2 text-sm text-[var(--color-text-secondary)]">
        {checksum.model_type ?? "-"}
      </td>
      <td className="px-3 py-2 text-sm text-[var(--color-text-secondary)] tabular-nums">
        {checksum.file_size_bytes != null
          ? formatBytes(checksum.file_size_bytes)
          : "-"}
      </td>
      <td className="px-3 py-2">
        <button
          type="button"
          data-testid={`delete-checksum-${checksum.id}`}
          onClick={() => onDelete(checksum.id)}
          className="text-xs text-[var(--color-action-danger)] hover:underline"
        >
          Delete
        </button>
      </td>
    </tr>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function ModelChecksumManager({
  checksums,
  onCreateChecksum,
  onDeleteChecksum,
}: ModelChecksumManagerProps) {
  return (
    <div data-testid="model-checksum-manager">
    <Card elevation="flat">
      <CardHeader>
        <span className="text-sm font-medium text-[var(--color-text-primary)]">
          Model Checksums ({checksums.length})
        </span>
      </CardHeader>
      <CardBody className="space-y-4">
        <CreateChecksumForm onSubmit={onCreateChecksum} />

        {checksums.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">
            No model checksums registered.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[var(--color-border-default)] text-xs text-[var(--color-text-muted)]">
                  <th className="px-3 py-2 font-medium">Model Name</th>
                  <th className="px-3 py-2 font-medium">File Path</th>
                  <th className="px-3 py-2 font-medium">Hash</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Size</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {checksums.map((c) => (
                  <ChecksumRow
                    key={c.id}
                    checksum={c}
                    onDelete={onDeleteChecksum}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
    </div>
  );
}
