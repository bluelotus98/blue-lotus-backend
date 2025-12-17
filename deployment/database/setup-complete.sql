-- ============================================================================
-- Blue Lotus AI - Complete Database Setup
-- ============================================================================
-- Run this entire script in Supabase SQL Editor
-- This creates all tables, RLS policies, and a demo business

-- ============================================================================
-- 1. BUSINESSES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS businesses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  subdomain TEXT UNIQUE NOT NULL,
  vapi_assistant_id TEXT,
  business_type TEXT DEFAULT 'general',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Anyone can read businesses (needed for subdomain lookup)
CREATE POLICY "Allow public read access to businesses"
  ON businesses FOR SELECT
  USING (true);

-- ============================================================================
-- 2. CALLS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS calls (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  vapi_call_id TEXT UNIQUE,
  customer_number TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  transcript TEXT,
  cost NUMERIC(10, 4),
  assistant_id TEXT,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_calls_business_id ON calls(business_id);
CREATE INDEX IF NOT EXISTS idx_calls_created_at ON calls(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_vapi_call_id ON calls(vapi_call_id);

-- Enable RLS
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only read calls for their business
CREATE POLICY "Users can read own business calls"
  ON calls FOR SELECT
  USING (business_id = current_setting('app.current_business_id', true));

-- ============================================================================
-- 3. CALL ANALYSIS TABLE (Precomputed AI Results)
-- ============================================================================

CREATE TABLE IF NOT EXISTS call_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id TEXT NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  sentiment_score NUMERIC(3, 2),
  sentiment_label TEXT,
  products_mentioned TEXT[],
  issues_identified TEXT[],
  opportunity_value INTEGER,
  summary TEXT,
  analyzed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_call_analysis_call_id ON call_analysis(call_id);
CREATE INDEX IF NOT EXISTS idx_call_analysis_business_id ON call_analysis(business_id);

-- Enable RLS
ALTER TABLE call_analysis ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only read analysis for their business calls
CREATE POLICY "Users can read own business call analysis"
  ON call_analysis FOR SELECT
  USING (business_id = current_setting('app.current_business_id', true));

-- ============================================================================
-- 4. INSERT DEMO BUSINESS
-- ============================================================================

INSERT INTO businesses (id, name, subdomain, vapi_assistant_id, business_type)
VALUES (
  'demo-001',
  'Blue Lotus Demo',
  'demo',
  'asst_demo_12345',
  'general'
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 5. INSERT DEMO CALL DATA
-- ============================================================================

-- Insert 5 demo calls with varied data
INSERT INTO calls (id, business_id, vapi_call_id, customer_number, started_at, ended_at, duration_seconds, transcript, cost, assistant_id, raw_data)
VALUES
  (
    'call-demo-001',
    'demo-001',
    'vapi-call-001',
    '+1234567890',
    NOW() - INTERVAL '2 hours',
    NOW() - INTERVAL '2 hours' + INTERVAL '5 minutes',
    300,
    'Customer: Hi, I''m interested in your tax preparation services. Agent: Great! We offer individual and business tax returns. Customer: What are your rates? Agent: Individual returns start at $150. Customer: Perfect, I''d like to schedule an appointment.',
    2.50,
    'asst_demo_12345',
    '{"status": "completed", "type": "inbound"}'::jsonb
  ),
  (
    'call-demo-002',
    'demo-001',
    'vapi-call-002',
    '+1234567891',
    NOW() - INTERVAL '5 hours',
    NOW() - INTERVAL '5 hours' + INTERVAL '3 minutes',
    180,
    'Customer: I need help with my dental appointment. Agent: I can help with that. What do you need? Customer: I want to reschedule my cleaning. Agent: Let me check our availability.',
    1.80,
    'asst_demo_12345',
    '{"status": "completed", "type": "inbound"}'::jsonb
  ),
  (
    'call-demo-003',
    'demo-001',
    'vapi-call-003',
    '+1234567892',
    NOW() - INTERVAL '1 day',
    NOW() - INTERVAL '1 day' + INTERVAL '7 minutes',
    420,
    'Customer: I''m calling about the legal consultation services. Agent: Yes, we offer free initial consultations. Customer: Great, what areas of law do you cover? Agent: We specialize in business law, contracts, and estate planning. Customer: I need help with a contract review.',
    3.20,
    'asst_demo_12345',
    '{"status": "completed", "type": "inbound"}'::jsonb
  ),
  (
    'call-demo-004',
    'demo-001',
    'vapi-call-004',
    '+1234567893',
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '2 days' + INTERVAL '4 minutes',
    240,
    'Customer: Do you have availability for dinner tonight? Agent: Let me check our reservations. Customer: Table for 4 at 7pm please. Agent: Yes, we have availability. Can I get your name?',
    2.10,
    'asst_demo_12345',
    '{"status": "completed", "type": "inbound"}'::jsonb
  ),
  (
    'call-demo-005',
    'demo-001',
    'vapi-call-005',
    '+1234567894',
    NOW() - INTERVAL '3 days',
    NOW() - INTERVAL '3 days' + INTERVAL '2 minutes',
    120,
    'Customer: Quick question about pricing. Agent: Sure, what service are you interested in? Customer: Just browsing, thanks. Agent: No problem, call back anytime!',
    1.20,
    'asst_demo_12345',
    '{"status": "completed", "type": "inbound"}'::jsonb
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 6. INSERT DEMO CALL ANALYSIS
-- ============================================================================

INSERT INTO call_analysis (call_id, business_id, sentiment_score, sentiment_label, products_mentioned, issues_identified, opportunity_value, summary)
VALUES
  (
    'call-demo-001',
    'demo-001',
    0.85,
    'positive',
    ARRAY['Individual Tax Return', 'Tax Preparation'],
    ARRAY[]::text[],
    90,
    'Customer expressed strong interest in tax services and requested appointment. High conversion potential.'
  ),
  (
    'call-demo-002',
    'demo-001',
    0.60,
    'neutral',
    ARRAY['Dental Cleaning', 'Appointment Rescheduling'],
    ARRAY['Schedule Conflict'],
    50,
    'Customer needs to reschedule dental cleaning. Standard service request.'
  ),
  (
    'call-demo-003',
    'demo-001',
    0.75,
    'positive',
    ARRAY['Legal Consultation', 'Contract Review'],
    ARRAY[]::text[],
    85,
    'Customer inquired about legal services with specific need for contract review. Good lead.'
  ),
  (
    'call-demo-004',
    'demo-001',
    0.70,
    'positive',
    ARRAY['Dinner Reservation'],
    ARRAY[]::text[],
    60,
    'Restaurant reservation confirmed for 4 people. Standard booking.'
  ),
  (
    'call-demo-005',
    'demo-001',
    0.40,
    'neutral',
    ARRAY[]::text[],
    ARRAY['Low Engagement'],
    20,
    'Brief inquiry with no specific interest. Low conversion potential.'
  )
ON CONFLICT DO NOTHING;

-- ============================================================================
-- COMPLETE!
-- ============================================================================

-- Verify setup
SELECT 'Businesses:' as table_name, COUNT(*) as count FROM businesses
UNION ALL
SELECT 'Calls:', COUNT(*) FROM calls
UNION ALL
SELECT 'Call Analysis:', COUNT(*) FROM call_analysis;
