//! External delivery channels for platform notifications.
//!
//! This module provides webhook and email delivery services used by the
//! notification router to push events outside the platform.

pub mod email;
pub mod webhook;
