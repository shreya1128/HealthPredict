-- Migration 019: Track caregiver invitation email delivery status
ALTER TABLE caregiver_access ADD COLUMN email_delivered BOOLEAN NOT NULL DEFAULT FALSE AFTER notify_missed_dose;
ALTER TABLE caregiver_access ADD COLUMN email_delivery_status VARCHAR(50) NOT NULL DEFAULT 'QUEUED' AFTER email_delivered;
