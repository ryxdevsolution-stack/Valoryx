-- Employee Salary & Attendance Management Tables
-- PostgreSQL / Supabase migration

CREATE TABLE IF NOT EXISTS employees (
    employee_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id   UUID NOT NULL REFERENCES client_entry(client_id) ON DELETE CASCADE,
    branch_id   UUID REFERENCES branches(branch_id) ON DELETE SET NULL,
    name        VARCHAR(255) NOT NULL,
    phone       VARCHAR(20),
    pay_type    VARCHAR(10) NOT NULL CHECK (pay_type IN ('hourly', 'daily')),
    rate        NUMERIC(10, 2) NOT NULL,
    is_active   BOOLEAN DEFAULT TRUE,
    created_by  UUID REFERENCES users(user_id),
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_emp_client        ON employees(client_id);
CREATE INDEX IF NOT EXISTS idx_emp_client_active ON employees(client_id, is_active);

CREATE TABLE IF NOT EXISTS employee_attendance (
    attendance_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id   UUID NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
    client_id     UUID NOT NULL REFERENCES client_entry(client_id) ON DELETE CASCADE,
    work_date     DATE NOT NULL,
    check_in      TIMESTAMP NOT NULL,
    check_out     TIMESTAMP,
    total_minutes INTEGER,
    marked_by     UUID REFERENCES users(user_id),
    notes         TEXT,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_att_emp_date    ON employee_attendance(client_id, employee_id, work_date);
CREATE INDEX IF NOT EXISTS idx_att_client_date ON employee_attendance(client_id, work_date);

CREATE TABLE IF NOT EXISTS salary_cycles (
    cycle_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id     UUID NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
    client_id       UUID NOT NULL REFERENCES client_entry(client_id) ON DELETE CASCADE,
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    status          VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'paid')),
    gross_salary    NUMERIC(10, 2),
    total_advances  NUMERIC(10, 2) DEFAULT 0,
    net_salary      NUMERIC(10, 2),
    paid_at         TIMESTAMP,
    paid_by         UUID REFERENCES users(user_id),
    payment_note    TEXT,
    rate_snapshot   NUMERIC(10, 2),
    pay_type_snap   VARCHAR(10),
    full_day_mins   INTEGER DEFAULT 480,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (employee_id, start_date)
);

CREATE INDEX IF NOT EXISTS idx_cycle_emp_status    ON salary_cycles(client_id, employee_id, status);
CREATE INDEX IF NOT EXISTS idx_cycle_client_status ON salary_cycles(client_id, status);

CREATE TABLE IF NOT EXISTS salary_advances (
    advance_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id  UUID NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
    client_id    UUID NOT NULL REFERENCES client_entry(client_id) ON DELETE CASCADE,
    cycle_id     UUID NOT NULL REFERENCES salary_cycles(cycle_id) ON DELETE CASCADE,
    amount       NUMERIC(10, 2) NOT NULL,
    advance_date DATE NOT NULL,
    notes        TEXT,
    recorded_by  UUID REFERENCES users(user_id),
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_adv_cycle    ON salary_advances(cycle_id);
CREATE INDEX IF NOT EXISTS idx_adv_emp_date ON salary_advances(client_id, employee_id, advance_date);
