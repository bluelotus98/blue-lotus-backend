/**
 * Subdomain Utilities
 *
 * Extract and validate business subdomain from request
 */

import { getBusinessBySubdomain } from '../db/supabase-client';
import type { Business } from '../db/supabase-client';

/**
 * Extract subdomain from request hostname
 *
 * Examples:
 * - taxfirm123.bluelotussolutions.ai → 'taxfirm123'
 * - demo.bluelotussolutions.ai → 'demo'
 * - localhost:3001 → null (development)
 * - bluelotussolutions.ai → null (root domain)
 *
 * @param hostname - Request hostname (from request.headers.get('host'))
 * @returns Subdomain or null
 */
export function extractSubdomain(hostname: string | null): string | null {
  if (!hostname) return null;

  // Remove port if present (localhost:3001 → localhost)
  const host = hostname.split(':')[0];

  // Development mode: localhost or 127.0.0.1
  if (host === 'localhost' || host === '127.0.0.1') {
    return null; // No subdomain in dev
  }

  // Split by dots
  const parts = host.split('.');

  // Need at least 3 parts for subdomain (subdomain.domain.tld)
  if (parts.length < 3) return null;

  // Extract subdomain (first part)
  const subdomain = parts[0];

  // Ignore common non-business subdomains
  const ignoredSubdomains = ['www', 'api', 'admin', 'app'];
  if (ignoredSubdomains.includes(subdomain)) {
    return null;
  }

  return subdomain;
}

/**
 * Resolve business from subdomain
 *
 * @param subdomain - Subdomain extracted from hostname
 * @returns Business object or null if not found
 */
export async function resolveBusinessFromSubdomain(
  subdomain: string | null
): Promise<Business | null> {
  if (!subdomain) return null;

  try {
    const business = await getBusinessBySubdomain(subdomain);
    return business;
  } catch (error) {
    console.error('Error resolving business from subdomain:', error);
    return null;
  }
}

/**
 * Get business from request
 *
 * Convenience function that extracts subdomain and resolves business in one call
 *
 * @param request - Incoming HTTP request
 * @returns Business object or null
 */
export async function getBusinessFromRequest(request: Request): Promise<Business | null> {
  const hostname = request.headers.get('host');
  const subdomain = extractSubdomain(hostname);

  if (!subdomain) {
    // Development mode fallback: check for X-Business-ID header
    const businessIdHeader = request.headers.get('X-Business-ID');
    if (businessIdHeader) {
      const { supabaseAdmin } = await import('../db/supabase-client');
      const { data } = await supabaseAdmin
        .from('businesses')
        .select('*')
        .eq('id', businessIdHeader)
        .single();
      return data as Business | null;
    }
    return null;
  }

  return resolveBusinessFromSubdomain(subdomain);
}

/**
 * Validate that request is coming from a valid business subdomain
 *
 * @param request - Incoming HTTP request
 * @returns { valid: boolean, business: Business | null, error?: string }
 */
export async function validateBusinessRequest(request: Request): Promise<{
  valid: boolean;
  business: Business | null;
  error?: string;
}> {
  const hostname = request.headers.get('host');

  if (!hostname) {
    return { valid: false, business: null, error: 'Missing host header' };
  }

  const subdomain = extractSubdomain(hostname);

  // Allow requests without subdomain in development
  if (!subdomain) {
    const isDev = process.env.NODE_ENV !== 'production';
    if (isDev) {
      return { valid: true, business: null }; // Development mode
    }
    return { valid: false, business: null, error: 'Invalid subdomain' };
  }

  const business = await resolveBusinessFromSubdomain(subdomain);

  if (!business) {
    return {
      valid: false,
      business: null,
      error: `Business not found for subdomain: ${subdomain}`,
    };
  }

  return { valid: true, business };
}
