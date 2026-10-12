-- Tables as created by Hibernate 6 (ddl-auto) and Flyway in an application database - database flase_owner,
-- user flase_owner. Connection without database in DSN opens this database (named as the user, like psql).
DROP TABLE IF EXISTS release_tickets, project_tags, comments, tickets, releases, app_users, projects, invoices, attachments, flyway_schema_history CASCADE;
DROP SEQUENCE IF EXISTS invoices_seq;

CREATE TABLE flyway_schema_history (
    installed_rank integer NOT NULL,
    version character varying(50),
    description character varying(200) NOT NULL,
    type character varying(20) NOT NULL,
    script character varying(1000) NOT NULL,
    checksum integer,
    installed_by character varying(100) NOT NULL,
    installed_on timestamp without time zone DEFAULT now() NOT NULL,
    execution_time integer NOT NULL,
    success boolean NOT NULL,
    CONSTRAINT flyway_schema_history_pk PRIMARY KEY (installed_rank)
);
CREATE INDEX flyway_schema_history_s_idx ON flyway_schema_history USING btree (success);

-- @Id UUID without database default, @Enumerated(STRING) with check constraint, generated search vector
CREATE TABLE projects (
    id uuid NOT NULL,
    name character varying(255),
    prefix character varying(255),
    starting_number integer,
    next_ticket_number integer DEFAULT 1 NOT NULL,
    estimate_unit character varying(255),
    status character varying(255) NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp(6) with time zone DEFAULT now() NOT NULL,
    search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, (COALESCE(name, ''::character varying))::text)) STORED,
    CONSTRAINT projects_pkey PRIMARY KEY (id),
    CONSTRAINT projects_status_check CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'ARCHIVED'::character varying, 'DELETED'::character varying])::text[])))
);
CREATE INDEX idx_projects_search_vector ON projects USING gin (search_vector);

CREATE TABLE app_users (
    id uuid NOT NULL,
    email character varying(255) NOT NULL,
    display_name character varying(255),
    password_hash character varying(255),
    enabled boolean NOT NULL,
    -- @Enumerated(ORDINAL)
    role smallint,
    last_login_at timestamp(6) with time zone,
    CONSTRAINT app_users_pkey PRIMARY KEY (id),
    CONSTRAINT app_users_role_check CHECK (((role >= 0) AND (role <= 2))),
    CONSTRAINT uk6dotkott2kjsp8vw4d0m25fb7 UNIQUE (email)
);

CREATE TABLE releases (
    id uuid NOT NULL,
    project_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    planned_release_date date,
    status character varying(255),
    CONSTRAINT releases_pkey PRIMARY KEY (id),
    CONSTRAINT releases_status_check CHECK (((status)::text = ANY (ARRAY[('PLANNED'::character varying)::text, ('RELEASED'::character varying)::text])))
);

CREATE TABLE tickets (
    id uuid NOT NULL,
    key character varying(255) NOT NULL,
    project_id uuid NOT NULL,
    parent_id uuid,
    author_id uuid,
    title character varying(255),
    description text,
    priority integer,
    custom_fields jsonb DEFAULT '{}'::jsonb NOT NULL,
    time_spent integer DEFAULT 0 NOT NULL,
    estimate double precision DEFAULT 0 NOT NULL,
    created_at timestamp(6) with time zone DEFAULT now() NOT NULL,
    changed_at timestamp(6) with time zone DEFAULT now() NOT NULL,
    related_tickets jsonb DEFAULT '[]'::jsonb NOT NULL,
    done_at timestamp(6) with time zone,
    search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, ((COALESCE(key, ''::character varying))::text || ' '::text) || (COALESCE(title, ''::character varying))::text)) STORED,
    CONSTRAINT tickets_pkey PRIMARY KEY (id),
    CONSTRAINT ukf8l1n0glcdqmbtbq02h0ruupu UNIQUE (key)
);
CREATE INDEX idx_tickets_search_vector ON tickets USING gin (search_vector);

CREATE TABLE comments (
    id uuid NOT NULL,
    ticket_id uuid NOT NULL,
    author_id uuid,
    body text NOT NULL,
    created_at timestamp(6) with time zone NOT NULL,
    CONSTRAINT comments_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_comments_ticket_id ON comments USING btree (ticket_id);

-- @ManyToMany join table without primary key
CREATE TABLE release_tickets (
    release_id uuid NOT NULL,
    ticket_id uuid NOT NULL
);

-- @ElementCollection
CREATE TABLE project_tags (
    project_id uuid NOT NULL,
    tag character varying(255)
);

-- @Id Long with @GeneratedValue(SEQUENCE) - allocationSize 50, BigDecimal as numeric(38,2)
CREATE SEQUENCE invoices_seq START WITH 1 INCREMENT BY 50;
CREATE TABLE invoices (
    id bigint NOT NULL,
    project_id uuid,
    number character varying(255),
    amount numeric(38,2),
    issued_on date,
    paid boolean,
    CONSTRAINT invoices_pkey PRIMARY KEY (id)
);

-- @Lob byte[] / String of Hibernate 5 - bytea and oid
CREATE TABLE attachments (
    id uuid NOT NULL,
    ticket_id uuid,
    file_name character varying(255),
    content bytea,
    content_oid oid,
    CONSTRAINT attachments_pkey PRIMARY KEY (id)
);

-- foreign keys with names generated by Hibernate
ALTER TABLE ONLY releases ADD CONSTRAINT fk3tge5wug4y53mwo30doy15ktq FOREIGN KEY (project_id) REFERENCES projects(id);
ALTER TABLE ONLY tickets ADD CONSTRAINT fk6bnpvjr3tuj3vy7m4t2k3e1wq FOREIGN KEY (project_id) REFERENCES projects(id);
ALTER TABLE ONLY tickets ADD CONSTRAINT fkqbm0ta6y9o2y3rh8w0yt2krq1 FOREIGN KEY (parent_id) REFERENCES tickets(id);
ALTER TABLE ONLY tickets ADD CONSTRAINT fk_tickets_author FOREIGN KEY (author_id) REFERENCES app_users(id);
ALTER TABLE ONLY comments ADD CONSTRAINT fkb6hxs6fnjoyl2pl9r93mxhcod FOREIGN KEY (ticket_id) REFERENCES tickets(id);
ALTER TABLE ONLY comments ADD CONSTRAINT fkmkcp9ma5r9lfv2bc5wcbyqsvl FOREIGN KEY (author_id) REFERENCES app_users(id);
ALTER TABLE ONLY release_tickets ADD CONSTRAINT fkhb7ii2ywxk3nfu3m6bpbxtq7q FOREIGN KEY (release_id) REFERENCES releases(id);
ALTER TABLE ONLY release_tickets ADD CONSTRAINT fk4g1y2jtq4u0w8sq3tvdq0k3ye FOREIGN KEY (ticket_id) REFERENCES tickets(id);
ALTER TABLE ONLY project_tags ADD CONSTRAINT fkpq2kxlb6vlx3c6bqf7hjokcm5 FOREIGN KEY (project_id) REFERENCES projects(id);
ALTER TABLE ONLY invoices ADD CONSTRAINT fk9n4bvxa1jv3j2s0g9oyx8f7p2 FOREIGN KEY (project_id) REFERENCES projects(id);
ALTER TABLE ONLY attachments ADD CONSTRAINT fk7hj1t0r3l3c8e5kp1n2h0wq9d FOREIGN KEY (ticket_id) REFERENCES tickets(id);

INSERT INTO flyway_schema_history VALUES
  (1, '1', 'init', 'SQL', 'V1__init.sql', 1234567, 'flase_owner', '2026-01-02 03:04:05', 120, true),
  (2, '2', 'tickets search', 'SQL', 'V2__tickets_search.sql', -998877, 'flase_owner', '2026-01-03 10:00:00', 45, true);

INSERT INTO projects (id, name, prefix, starting_number, estimate_unit, status, settings, created_at) VALUES
  ('3f2c1a9e-6b7d-4e8f-9a0b-1c2d3e4f5a01', 'Flase', 'FL', 1, 'HOURS', 'ACTIVE', '{"color": "#3574f0", "public": true}', '2026-01-02 03:04:05+00'),
  ('7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c02', 'Old shop', 'OS', 100, 'POINTS', 'ARCHIVED', '{}', '2025-05-06 07:08:09+00');

INSERT INTO app_users (id, email, display_name, enabled, role, last_login_at) VALUES
  ('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c01', 'anna@example.com', 'Anna Nowak', true, 0, '2026-10-01 08:00:00+00'),
  ('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c02', 'jan@example.com', 'Jan Kowalski', true, 2, NULL),
  ('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c03', 'old@example.com', NULL, false, 1, NULL);

INSERT INTO releases (id, project_id, name, planned_release_date, status) VALUES
  ('b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c01', '3f2c1a9e-6b7d-4e8f-9a0b-1c2d3e4f5a01', '0.1.0', '2026-10-11', 'RELEASED'),
  ('b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c02', '3f2c1a9e-6b7d-4e8f-9a0b-1c2d3e4f5a01', '0.2.0', '2026-11-30', 'PLANNED');

INSERT INTO tickets (id, key, project_id, parent_id, author_id, title, description, priority, custom_fields, time_spent, estimate, created_at, changed_at, related_tickets, done_at) VALUES
  ('c1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c01', 'FL-1', '3f2c1a9e-6b7d-4e8f-9a0b-1c2d3e4f5a01', NULL, 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c01',
    'Database overview', 'Tables, routines and events of database', 1, '{"component": "front", "points": 5}', 480, 8.5, '2026-09-01 09:00:00+00', '2026-10-11 12:00:00+00', '[]', '2026-10-11 12:00:00+00'),
  ('c1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c02', 'FL-2', '3f2c1a9e-6b7d-4e8f-9a0b-1c2d3e4f5a01', 'c1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c01', 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c02',
    'Create table form', NULL, 2, '{}', 0, 3, '2026-09-02 10:00:00+00', '2026-09-02 10:00:00+00', '["FL-1"]', NULL),
  ('c1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c03', 'OS-100', '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c02', NULL, NULL,
    'Legacy import', 'Imported from old shop', NULL, '{"legacy": true}', 60, 0, '2025-05-06 07:08:09+00', '2025-05-06 07:08:09+00', '[]', NULL);

INSERT INTO comments (id, ticket_id, author_id, body, created_at) VALUES
  ('d1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c01', 'c1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c01', 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c02', 'Looks good', '2026-09-03 11:00:00+00');

INSERT INTO release_tickets VALUES
  ('b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c01', 'c1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c01'),
  ('b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c02', 'c1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c02');

INSERT INTO project_tags VALUES
  ('3f2c1a9e-6b7d-4e8f-9a0b-1c2d3e4f5a01', 'database'),
  ('3f2c1a9e-6b7d-4e8f-9a0b-1c2d3e4f5a01', 'web');

INSERT INTO invoices (id, project_id, number, amount, issued_on, paid) VALUES
  (1, '3f2c1a9e-6b7d-4e8f-9a0b-1c2d3e4f5a01', 'FV/2026/1', 1234.50, '2026-09-30', true),
  (51, '3f2c1a9e-6b7d-4e8f-9a0b-1c2d3e4f5a01', 'FV/2026/2', 99999999999999999999.99, '2026-10-31', false);
DO $$ BEGIN PERFORM setval('invoices_seq', 51); END $$;

INSERT INTO attachments (id, ticket_id, file_name, content, content_oid) VALUES
  ('e1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c01', 'c1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c01', 'notes.txt', convert_to('first notes', 'UTF8'), NULL);
