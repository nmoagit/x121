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
    fn job_status_ids_match_seed_data() {
        assert_eq!(JobStatus::Pending.id(), 1);
        assert_eq!(JobStatus::Running.id(), 2);
        assert_eq!(JobStatus::Completed.id(), 3);
        assert_eq!(JobStatus::Failed.id(), 4);
        assert_eq!(JobStatus::Cancelled.id(), 5);
        assert_eq!(JobStatus::Retrying.id(), 6);
    }
}
