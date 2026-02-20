-- Seed initial status values for all lookup tables.

INSERT INTO job_statuses (name, label) VALUES
    ('pending',   'Pending'),
    ('running',   'Running'),
    ('completed', 'Completed'),
    ('failed',    'Failed'),
    ('cancelled', 'Cancelled'),
    ('retrying',  'Retrying');

INSERT INTO approval_statuses (name, label) VALUES
    ('pending',            'Pending Review'),
    ('approved',           'Approved'),
    ('rejected',           'Rejected'),
    ('revision_requested', 'Revision Requested');

INSERT INTO worker_statuses (name, label) VALUES
    ('idle',     'Idle'),
    ('busy',     'Busy'),
    ('offline',  'Offline'),
    ('draining', 'Draining');

INSERT INTO project_statuses (name, label) VALUES
    ('draft',     'Draft'),
    ('active',    'Active'),
    ('paused',    'Paused'),
    ('completed', 'Completed'),
    ('archived',  'Archived');

INSERT INTO scene_statuses (name, label) VALUES
    ('pending',    'Pending'),
    ('generating', 'Generating'),
    ('generated',  'Generated'),
    ('approved',   'Approved'),
    ('rejected',   'Rejected'),
    ('delivered',  'Delivered');

INSERT INTO segment_statuses (name, label) VALUES
    ('pending',    'Pending'),
    ('generating', 'Generating'),
    ('generated',  'Generated'),
    ('failed',     'Failed'),
    ('approved',   'Approved'),
    ('rejected',   'Rejected');
