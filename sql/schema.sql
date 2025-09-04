CREATE DATABASE IF NOT EXISTS otp_db;
USE otp_db;

-- OTP table
CREATE TABLE otps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  purpose VARCHAR(50) NOT NULL,
  ip VARCHAR(45),
  code VARCHAR(6) NOT NULL,
  expires_at DATETIME NOT NULL,
  used BOOLEAN DEFAULT 0,
  attempts INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- only one active OTP per user_id + purpose
CREATE UNIQUE INDEX idx_user_purpose_active
ON otps(user_id, purpose, used, expires_at);

-- Idempotency table
CREATE TABLE idempotency (
  id INT AUTO_INCREMENT PRIMARY KEY,
  idempotency_key VARCHAR(100) UNIQUE NOT NULL,
  response_json TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
