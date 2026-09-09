CREATE DATABASE IF NOT EXISTS myenvelope
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE myenvelope;

CREATE TABLE IF NOT EXISTS `User` (
  userId BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  isAdult BOOLEAN NOT NULL DEFAULT FALSE,
  secureCode VARCHAR(255) NOT NULL,
  userName VARCHAR(80) NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(120) NOT NULL,
  telephoneNumber VARCHAR(40) NOT NULL,
  dateOfBirth DATE NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (userId),
  UNIQUE KEY uq_user_username (userName)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Expenses (
  expenseId BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  userId BIGINT UNSIGNED NOT NULL,
  date DATE NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  category VARCHAR(80) NOT NULL,
  subcategory VARCHAR(80) NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (expenseId),
  KEY idx_expenses_user_date (userId, date),
  CONSTRAINT fk_expenses_user
    FOREIGN KEY (userId) REFERENCES `User` (userId) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Earnings (
  earningId BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  userId BIGINT UNSIGNED NOT NULL,
  date DATE NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  category VARCHAR(80) NOT NULL,
  subcategory VARCHAR(80) NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (earningId),
  KEY idx_earnings_user_date (userId, date),
  CONSTRAINT fk_earnings_user
    FOREIGN KEY (userId) REFERENCES `User` (userId) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS Planning (
  planningId BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  userId BIGINT UNSIGNED NOT NULL,
  year SMALLINT UNSIGNED NOT NULL,
  month TINYINT UNSIGNED NOT NULL,
  category VARCHAR(80) NOT NULL,
  type ENUM('expense', 'earning') NOT NULL,
  plannedAmount DECIMAL(12,2) NOT NULL DEFAULT 0,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (planningId),
  UNIQUE KEY uq_plan_item (userId, year, month, category, type),
  CONSTRAINT fk_planning_user
    FOREIGN KEY (userId) REFERENCES `User` (userId) ON DELETE CASCADE,
  CONSTRAINT chk_planning_month CHECK (month BETWEEN 1 AND 12)
) ENGINE=InnoDB;

-- Create a least-privilege application user manually for your environment.
-- Example (replace host and password before running):
-- CREATE USER 'myenvelope_app'@'localhost' IDENTIFIED BY 'strong-password';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON myenvelope.* TO 'myenvelope_app'@'localhost';
