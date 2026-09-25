CREATE TYPE deal_stage AS ENUM ('qualified', 'proposal', 'negotiation', 'won', 'lost');
CREATE TYPE lead_status AS ENUM ('new', 'contacted', 'qualified', 'unqualified');
CREATE TYPE lead_source AS ENUM ('referral', 'website', 'linkedin', 'event', 'cold_outreach');

CREATE TABLE deals (
  id serial PRIMARY KEY,
  name text NOT NULL,
  client_name text NOT NULL,
  value integer NOT NULL CHECK (value >= 0),
  stage deal_stage NOT NULL DEFAULT 'qualified',
  owner text NOT NULL,
  expected_close_date date,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX deals_stage_idx ON deals (stage);
CREATE INDEX deals_closed_at_idx ON deals (closed_at);

CREATE TABLE leads (
  id serial PRIMARY KEY,
  name text NOT NULL,
  company text NOT NULL,
  email text,
  source lead_source NOT NULL,
  status lead_status NOT NULL DEFAULT 'new',
  estimated_value integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX leads_created_at_idx ON leads (created_at DESC);
