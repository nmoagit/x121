/// All database primary keys are PostgreSQL BIGSERIAL.
pub type DbId = i64;

/// All timestamps are UTC.
pub type Timestamp = chrono::DateTime<chrono::Utc>;
