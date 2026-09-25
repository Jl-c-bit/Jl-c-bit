-- Sample data so the dashboard is populated on first deploy.
-- Dates are relative to when this migration runs.

-- Twelve months of closed deals (about two thirds won, one third lost).
INSERT INTO deals (name, client_name, value, stage, owner, expected_close_date, closed_at, created_at)
SELECT
  (ARRAY['Brand identity','Website rebuild','Paid social retainer','SEO program','Launch campaign','Content strategy','Product video','Email automation'])[1 + (m * 3 + k) % 8],
  (ARRAY['Northwind Coffee','Lumen Fitness','Harbor Legal','Atlas Robotics','Greenline Solar','Kestrel Bank','Bloom & Vine','Orbit Labs','Cedar Health','Pioneer Outfitters','Tidewater Hotels','Quill Publishing'])[1 + (m * 5 + k * 7) % 12],
  (8000 + ((m * 37 + k * 53) % 17) * 1100 + m * 350)::int,
  CASE WHEN (m + k) % 3 = 0 THEN 'lost'::deal_stage ELSE 'won'::deal_stage END,
  (ARRAY['Maya R.','Dev P.','Sam O.','Lena K.'])[1 + (m + k) % 4],
  NULL,
  date_trunc('month', now()) - make_interval(months => m) + make_interval(days => (k * 6 + m) % 26, hours => 10),
  date_trunc('month', now()) - make_interval(months => m + 1) + make_interval(days => k * 4)
FROM generate_series(0, 11) AS m, generate_series(0, 4) AS k
WHERE date_trunc('month', now()) - make_interval(months => m) + make_interval(days => (k * 6 + m) % 26, hours => 10) <= now();

-- Deals in progress.
INSERT INTO deals (name, client_name, value, stage, owner, expected_close_date, created_at) VALUES
('Brand refresh','Northwind Coffee',38000,'negotiation','Maya R.', current_date + 13, now() - interval '34 days'),
('Q4 paid social','Lumen Fitness',24500,'proposal','Dev P.', current_date + 20, now() - interval '21 days'),
('Website rebuild','Harbor Legal',56000,'qualified','Maya R.', current_date + 38, now() - interval '9 days'),
('SEO program','Kestrel Bank',31000,'negotiation','Sam O.', current_date + 6, now() - interval '42 days'),
('Launch campaign','Orbit Labs',19800,'proposal','Lena K.', current_date + 17, now() - interval '15 days'),
('Product video series','Cedar Health',14200,'qualified','Dev P.', current_date + 45, now() - interval '5 days'),
('Email automation','Bloom & Vine',9600,'proposal','Sam O.', current_date + 11, now() - interval '19 days'),
('Annual retainer','Tidewater Hotels',72000,'negotiation','Lena K.', current_date + 24, now() - interval '51 days'),
('Content strategy','Quill Publishing',12400,'qualified','Maya R.', current_date + 31, now() - interval '3 days');

-- Leads.
INSERT INTO leads (name, company, email, source, status, estimated_value, created_at) VALUES
('Priya Nair','Atlas Robotics','priya@atlasrobotics.example','referral','new',18000, now() - interval '5 hours'),
('Tom Becker','Greenline Solar','tom@greenline.example','website','contacted',9500, now() - interval '1 day 3 hours'),
('Ana Souza','Mesa Brewing','ana@mesabrewing.example','linkedin','new',7200, now() - interval '1 day 20 hours'),
('Jordan Blake','Summit Dental Group','jordan@summitdental.example','event','qualified',22000, now() - interval '3 days'),
('Kenji Mori','Fjord Outdoor','kenji@fjord.example','cold_outreach','contacted',NULL, now() - interval '4 days'),
('Rachel Adeyemi','Copperleaf Finance','rachel@copperleaf.example','referral','qualified',41000, now() - interval '5 days'),
('Luis Ortega','Nomad Coworking','luis@nomadcw.example','website','unqualified',3000, now() - interval '6 days'),
('Hannah Weiss','Polar Analytics','hannah@polar.example','linkedin','new',15500, now() - interval '8 days'),
('Omar Haddad','Saffron Kitchens','omar@saffron.example','event','contacted',11000, now() - interval '10 days'),
('Grace Lin','Beacon Schools','grace@beacon.example','website','new',26000, now() - interval '12 days'),
('Marco Bellini','Vela Yachts','marco@velayachts.example','referral','contacted',48000, now() - interval '15 days'),
('Sofia Petrov','Ember Studios','sofia@ember.example','cold_outreach','unqualified',NULL, now() - interval '18 days'),
('Ben Carter','Ridgeway Logistics','ben@ridgeway.example','linkedin','qualified',19000, now() - interval '22 days'),
('Maya Chen','Lotus Wellness','maya@lotus.example','website','contacted',8400, now() - interval '26 days'),
('Isaac Grant','Keystone Realty','isaac@keystone.example','event','new',13500, now() - interval '29 days'),
('Nora Walsh','Driftwood Inns','nora@driftwood.example','referral','contacted',21000, now() - interval '36 days'),
('Felix Braun','Circuit Supply','felix@circuit.example','website','unqualified',4000, now() - interval '41 days');
