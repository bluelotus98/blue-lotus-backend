/**
 * Supabase Client Factory
 *
 * Provides RLS-aware and admin Supabase clients
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !SUPABASE_ANON_KEY) {
  throw new Error('Missing Supabase environment variables');
}

/**
 * Admin client (SERVICE ROLE - bypasses RLS)
 * ⚠️ USE WITH CAUTION - Only for:
 * - Webhook ingestion (writing raw call data)
 * - AI worker processing (updating processed fields)
 * - Business provisioning
 */
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/**
 * Create RLS-enforced client for user-facing requests
 *
 * This client respects Row Level Security policies and is scoped to a specific business
 * via JWT token containing business_id claim.
 *
 * @param jwt - JWT token with business_id claim
 * @returns Supabase client with RLS enforced
 */
export function createRLSClient(jwt: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Create business-scoped admin client
 *
 * This sets the business_id in the Postgres session for RLS policies
 * while still using the service role key for write operations.
 *
 * @param businessId - Business ID to scope operations to
 * @returns Supabase client scoped to business
 */
export function createBusinessScopedClient(businessId: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    db: {
      schema: 'public',
    },
    global: {
      headers: {
        'X-Business-ID': businessId,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Types for database tables
 */

export interface Call {
  id: string;
  business_id: string;
  assistant_id: string;
  caller_number: string | null;
  duration: number;
  status: 'completed' | 'failed' | 'no-answer' | 'busy' | 'ongoing';
  transcript: string | null;
  summary: string | null;
  recording_url: string | null;

  // AI-computed fields (async)
  sentiment_score: number | null; // -1.0 to 1.0
  products_mentioned: string[] | null;
  issues_identified: string[] | null;
  opportunity_value: number | null;
  processed_at: string | null;
  processing_version: string | null;
  processing_error: string | null;

  created_at: string;
  updated_at: string;
  metadata: Record<string, any> | null;
}

export interface Business {
  id: string;
  name: string;
  subdomain: string;
  vapi_assistant_id: string | null;
  vapi_phone_number: string | null;
  botpress_bot_id: string | null;
  timezone: string;
  business_type: string | null;
  created_at: string;
  updated_at: string;
  metadata: Record<string, any> | null;
}

export interface User {
  id: string;
  email: string;
  business_id: string;
  role: 'admin' | 'editor' | 'viewer';
  full_name: string | null;
  avatar_url: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  metadata: Record<string, any> | null;
}

/**
 * Database helper functions
 */

/**
 * Get business by subdomain
 */
export async function getBusinessBySubdomain(subdomain: string): Promise<Business | null> {
  const { data, error } = await supabaseAdmin
    .from('businesses')
    .select('*')
    .eq('subdomain', subdomain)
    .single();

  if (error) {
    console.error('Error fetching business by subdomain:', error);
    return null;
  }

  return data as Business;
}

/**
 * Get business by Vapi assistant ID
 */
export async function getBusinessByAssistantId(assistantId: string): Promise<Business | null> {
  const { data, error } = await supabaseAdmin
    .from('businesses')
    .select('*')
    .eq('vapi_assistant_id', assistantId)
    .single();

  if (error) {
    console.error('Error fetching business by assistant ID:', error);
    return null;
  }

  return data as Business;
}

/**
 * Get unprocessed calls for AI processing
 */
export async function getUnprocessedCalls(businessId: string, limit = 100): Promise<Call[]> {
  const { data, error } = await supabaseAdmin
    .from('calls')
    .select('*')
    .eq('business_id', businessId)
    .is('processed_at', null)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('Error fetching unprocessed calls:', error);
    return [];
  }

  return data as Call[];
}
