CREATE TABLE IF NOT EXISTS students (
  student_id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NULL,
  branch VARCHAR(50) NULL,
  cgpa DECIMAL(3,2) NULL,
  PRIMARY KEY (student_id),
  UNIQUE KEY email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS companies (
  company_id INT NOT NULL AUTO_INCREMENT,
  company_name VARCHAR(100) NOT NULL,
  industry VARCHAR(100) NULL,
  location VARCHAR(100) NULL,
  website VARCHAR(255) NULL,
  PRIMARY KEY (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS jobs (
  job_id INT NOT NULL AUTO_INCREMENT,
  company_id INT NOT NULL,
  job_role VARCHAR(100) NOT NULL,
  package_lpa DECIMAL(5,2) NULL,
  min_cgpa DECIMAL(3,2) NULL,
  job_location VARCHAR(100) NULL,
  deadline DATE NULL,
  PRIMARY KEY (job_id),
  KEY company_id (company_id),
  CONSTRAINT jobs_company_fk FOREIGN KEY (company_id) REFERENCES companies (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS applications (
  application_id INT NOT NULL AUTO_INCREMENT,
  student_id INT NOT NULL,
  job_id INT NOT NULL,
  application_date DATE NOT NULL,
  status VARCHAR(30) NULL DEFAULT 'Applied',
  PRIMARY KEY (application_id),
  UNIQUE KEY student_job_unique (student_id, job_id),
  KEY job_id (job_id),
  CONSTRAINT applications_student_fk FOREIGN KEY (student_id) REFERENCES students (student_id),
  CONSTRAINT applications_job_fk FOREIGN KEY (job_id) REFERENCES jobs (job_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
