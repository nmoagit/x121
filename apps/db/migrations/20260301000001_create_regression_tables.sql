-- PRD-65: Workflow Regression Testing
--
-- Reference scenes: character + scene type benchmarks
CREATE TABLE regression_references (
    id BIGSERIAL PRIMARY KEY,
    character_id BIGINT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    scene_type_id BIGINT NOT NULL REFERENCES scene_types(id) ON DELETE CASCADE,
    reference_scene_id BIGINT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
    baseline_scores JSONB NOT NULL DEFAULT '{}',
    notes TEXT,
    created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_regression_ref_char_scene_type ON regression_references(character_id, scene_type_id);
CREATE INDEX idx_regression_references_character_id ON regression_references(character_id);
CREATE INDEX idx_regression_references_scene_type_id ON regression_references(scene_type_id);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON regression_references FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Regression runs (one per trigger event)
CREATE TABLE regression_runs (
    id BIGSERIAL PRIMARY KEY,
    trigger_type TEXT NOT NULL CHECK (trigger_type IN ('workflow_update', 'lora_update', 'model_update', 'manual')),
    trigger_description TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    total_references INTEGER NOT NULL DEFAULT 0,
    completed_count INTEGER NOT NULL DEFAULT 0,
    passed_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    triggered_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_regression_runs_status ON regression_runs(status);
CREATE INDEX idx_regression_runs_triggered_by ON regression_runs(triggered_by);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON regression_runs FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Individual results per reference in a run
CREATE TABLE regression_results (
    id BIGSERIAL PRIMARY KEY,
    run_id BIGINT NOT NULL REFERENCES regression_runs(id) ON DELETE CASCADE,
    reference_id BIGINT NOT NULL REFERENCES regression_references(id) ON DELETE CASCADE,
    new_scene_id BIGINT REFERENCES scenes(id) ON DELETE SET NULL,
    baseline_scores JSONB NOT NULL DEFAULT '{}',
    new_scores JSONB NOT NULL DEFAULT '{}',
    score_diffs JSONB NOT NULL DEFAULT '{}',
    verdict TEXT NOT NULL CHECK (verdict IN ('improved', 'same', 'degraded', 'error')),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_regression_results_run_id ON regression_results(run_id);
CREATE INDEX idx_regression_results_reference_id ON regression_results(reference_id);
CREATE INDEX idx_regression_results_verdict ON regression_results(verdict);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON regression_results FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
