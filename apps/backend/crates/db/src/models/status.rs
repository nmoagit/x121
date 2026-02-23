//! Status helper enums mapping to SMALLSERIAL/SMALLINT lookup tables.
//!
//! Each enum variant's discriminant matches the seed data order (1-based)
//! in the corresponding `*_statuses` database table.

/// Status ID type matching SMALLINT/SMALLSERIAL in the database.
pub type StatusId = i16;

macro_rules! define_status_enum {
    (
        $(#[$meta:meta])*
        $name:ident {
            $( $(#[$vmeta:meta])* $variant:ident = $val:expr ),+ $(,)?
        }
    ) => {
        $(#[$meta])*
        #[repr(i16)]
        #[derive(Debug, Clone, Copy, PartialEq, Eq)]
        pub enum $name {
            $( $(#[$vmeta])* $variant = $val ),+
        }

        impl $name {
            /// Return the database status ID.
            pub fn id(self) -> StatusId {
                self as StatusId
            }
        }

        impl From<$name> for StatusId {
            fn from(value: $name) -> Self {
                value as StatusId
            }
        }
    };
}

define_status_enum! {
    /// Project lifecycle status.
    ProjectStatus {
        Draft = 1,
        Active = 2,
        Paused = 3,
        Completed = 4,
        Archived = 5,
    }
}

define_status_enum! {
    /// Character lifecycle status.
    CharacterStatus {
        Draft = 1,
        Active = 2,
        Archived = 3,
    }
}

define_status_enum! {
    /// Image variant review status.
    ImageVariantStatus {
        Pending = 1,
        Approved = 2,
        Rejected = 3,
        Generating = 4,
        Generated = 5,
        Editing = 6,
    }
}

define_status_enum! {
    /// Scene type lifecycle status.
    SceneTypeStatus {
        Draft = 1,
        Active = 2,
        Deprecated = 3,
    }
}

define_status_enum! {
    /// Scene processing pipeline status.
    SceneStatus {
        Pending = 1,
        Generating = 2,
        Generated = 3,
        Approved = 4,
        Rejected = 5,
        Delivered = 6,
    }
}

define_status_enum! {
    /// Segment processing pipeline status.
    SegmentStatus {
        Pending = 1,
        Generating = 2,
        Generated = 3,
        Failed = 4,
        Approved = 5,
        Rejected = 6,
    }
}

define_status_enum! {
    /// Background job execution status.
    JobStatus {
        Pending = 1,
        Running = 2,
        Completed = 3,
        Failed = 4,
        Cancelled = 5,
        Retrying = 6,
        Scheduled = 7,
        Paused = 8,
        Dispatched = 9,
    }
}

define_status_enum! {
    /// Approval workflow status.
    ApprovalStatus {
        Pending = 1,
        Approved = 2,
        Rejected = 3,
        RevisionRequested = 4,
    }
}

define_status_enum! {
    /// Worker node availability status.
    WorkerStatus {
        Idle = 1,
        Busy = 2,
        Offline = 3,
        Draining = 4,
    }
}

define_status_enum! {
    /// Storage backend availability status (PRD-48).
    StorageBackendStatus {
        Active = 1,
        ReadOnly = 2,
        Offline = 3,
        Decommissioned = 4,
    }
}

define_status_enum! {
    /// Storage migration lifecycle status (PRD-48).
    StorageMigrationStatus {
        Pending = 1,
        InProgress = 2,
        Verifying = 3,
        Completed = 4,
        Failed = 5,
        RolledBack = 6,
    }
}

define_status_enum! {
    /// Delivery export pipeline status (PRD-39).
    DeliveryExportStatus {
        Pending = 1,
        Assembling = 2,
        Transcoding = 3,
        Packaging = 4,
        Validating = 5,
        Completed = 6,
        Failed = 7,
    }
}

define_status_enum! {
    /// Duplicate check result status (PRD-79).
    DuplicateCheckStatus {
        NoMatch = 1,
        MatchFound = 2,
        ConfirmedDuplicate = 3,
        Dismissed = 4,
        Merged = 5,
    }
}

define_status_enum! {
    /// Model download lifecycle status (PRD-104).
    DownloadStatus {
        Queued = 1,
        Downloading = 2,
        Paused = 3,
        Verifying = 4,
        Registering = 5,
        Completed = 6,
        Failed = 7,
        Cancelled = 8,
    }
}

// NOTE: EmbeddingStatus lives in `trulience_core::embedding::EmbeddingStatus`
// (the canonical source) because the core crate needs it for domain logic
// (`classify_extraction_result`). It provides `id()`, `from_id()`, and `label()`.
// Do NOT re-add it here via define_status_enum! -- that would create a duplicate (DRY-209).

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn project_status_ids_match_seed_data() {
        assert_eq!(ProjectStatus::Draft.id(), 1);
        assert_eq!(ProjectStatus::Active.id(), 2);
        assert_eq!(ProjectStatus::Paused.id(), 3);
        assert_eq!(ProjectStatus::Completed.id(), 4);
        assert_eq!(ProjectStatus::Archived.id(), 5);
    }

    #[test]
    fn status_into_status_id() {
        let id: StatusId = ProjectStatus::Draft.into();
        assert_eq!(id, 1);
    }

    #[test]
    fn scene_status_ids_match_seed_data() {
        assert_eq!(SceneStatus::Pending.id(), 1);
        assert_eq!(SceneStatus::Generating.id(), 2);
        assert_eq!(SceneStatus::Generated.id(), 3);
        assert_eq!(SceneStatus::Approved.id(), 4);
        assert_eq!(SceneStatus::Rejected.id(), 5);
        assert_eq!(SceneStatus::Delivered.id(), 6);
    }

    #[test]
    fn image_variant_status_ids_match_seed_data() {
        assert_eq!(ImageVariantStatus::Pending.id(), 1);
        assert_eq!(ImageVariantStatus::Approved.id(), 2);
        assert_eq!(ImageVariantStatus::Rejected.id(), 3);
        assert_eq!(ImageVariantStatus::Generating.id(), 4);
        assert_eq!(ImageVariantStatus::Generated.id(), 5);
        assert_eq!(ImageVariantStatus::Editing.id(), 6);
    }

    #[test]
    fn job_status_ids_match_seed_data() {
        assert_eq!(JobStatus::Pending.id(), 1);
        assert_eq!(JobStatus::Running.id(), 2);
        assert_eq!(JobStatus::Completed.id(), 3);
        assert_eq!(JobStatus::Failed.id(), 4);
        assert_eq!(JobStatus::Cancelled.id(), 5);
        assert_eq!(JobStatus::Retrying.id(), 6);
        assert_eq!(JobStatus::Scheduled.id(), 7);
        assert_eq!(JobStatus::Paused.id(), 8);
        assert_eq!(JobStatus::Dispatched.id(), 9);
    }

    #[test]
    fn storage_backend_status_ids_match_seed_data() {
        assert_eq!(StorageBackendStatus::Active.id(), 1);
        assert_eq!(StorageBackendStatus::ReadOnly.id(), 2);
        assert_eq!(StorageBackendStatus::Offline.id(), 3);
        assert_eq!(StorageBackendStatus::Decommissioned.id(), 4);
    }

    #[test]
    fn storage_migration_status_ids_match_seed_data() {
        assert_eq!(StorageMigrationStatus::Pending.id(), 1);
        assert_eq!(StorageMigrationStatus::InProgress.id(), 2);
        assert_eq!(StorageMigrationStatus::Verifying.id(), 3);
        assert_eq!(StorageMigrationStatus::Completed.id(), 4);
        assert_eq!(StorageMigrationStatus::Failed.id(), 5);
        assert_eq!(StorageMigrationStatus::RolledBack.id(), 6);
    }

    #[test]
    fn delivery_export_status_ids_match_seed_data() {
        assert_eq!(DeliveryExportStatus::Pending.id(), 1);
        assert_eq!(DeliveryExportStatus::Assembling.id(), 2);
        assert_eq!(DeliveryExportStatus::Transcoding.id(), 3);
        assert_eq!(DeliveryExportStatus::Packaging.id(), 4);
        assert_eq!(DeliveryExportStatus::Validating.id(), 5);
        assert_eq!(DeliveryExportStatus::Completed.id(), 6);
        assert_eq!(DeliveryExportStatus::Failed.id(), 7);
    }

    #[test]
    fn duplicate_check_status_ids_match_seed_data() {
        assert_eq!(DuplicateCheckStatus::NoMatch.id(), 1);
        assert_eq!(DuplicateCheckStatus::MatchFound.id(), 2);
        assert_eq!(DuplicateCheckStatus::ConfirmedDuplicate.id(), 3);
        assert_eq!(DuplicateCheckStatus::Dismissed.id(), 4);
        assert_eq!(DuplicateCheckStatus::Merged.id(), 5);
    }

    #[test]
    fn download_status_ids_match_seed_data() {
        assert_eq!(DownloadStatus::Queued.id(), 1);
        assert_eq!(DownloadStatus::Downloading.id(), 2);
        assert_eq!(DownloadStatus::Paused.id(), 3);
        assert_eq!(DownloadStatus::Verifying.id(), 4);
        assert_eq!(DownloadStatus::Registering.id(), 5);
        assert_eq!(DownloadStatus::Completed.id(), 6);
        assert_eq!(DownloadStatus::Failed.id(), 7);
        assert_eq!(DownloadStatus::Cancelled.id(), 8);
    }

    // EmbeddingStatus tests live in trulience_core::embedding::tests (DRY-209).
}
