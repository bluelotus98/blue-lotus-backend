/**
 * Blue Lotus AI - SaaS Backend (Bun)
 *
 * Production-ready multi-tenant backend with:
 * - Fast webhook ingestion
 * - Event-driven async AI processing
 * - RLS-enforced dashboard API
 */

import { handleVapiWebhook } from './ingestion/vapi-webhook';
import { getQueueStats } from './queue/job-publisher';
import { serveDashboard, serveStaticFile } from './api/dashboard-server';
import { extractSubdomain } from './utils/subdomain';

const PORT = process.env.PORT || 3001;

/**
 * Main HTTP server using Bun's native serve
 */
const server = Bun.serve({
  port: PORT,
  hostname: '0.0.0.0', // Listen on all interfaces (required for Railway)
  async fetch(request) {
    const url = new URL(request.url);

    // CORS headers
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle OPTIONS (CORS preflight)
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    // =========================================================================
    // WEBHOOK ENDPOINTS (Ingestion)
    // =========================================================================

    // Vapi webhook for call.ended events
    if (url.pathname === '/webhooks/vapi' && request.method === 'POST') {
      const response = await handleVapiWebhook(request);
      return addCorsHeaders(response, headers);
    }

    // Botpress webhook (TODO)
    if (url.pathname === '/webhooks/botpress' && request.method === 'POST') {
      // TODO: Implement Botpress webhook handler
      return new Response(
        JSON.stringify({ received: true, message: 'Botpress webhook not implemented yet' }),
        { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } }
      );
    }

    // =========================================================================
    // DASHBOARD API ENDPOINTS (Read-Only)
    // =========================================================================

    // TODO: Implement dashboard API endpoints
    // - GET /api/dashboard/calls
    // - GET /api/dashboard/stats
    // - GET /api/dashboard/sentiment
    // - GET /api/dashboard/opportunities
    // - GET /api/dashboard/call-volume

    // =========================================================================
    // HEALTH & MONITORING
    // =========================================================================

    // Health check
    if (url.pathname === '/health') {
      const queueStats = await getQueueStats();
      const redisHealthy = queueStats !== null;

      return new Response(
        JSON.stringify({
          status: redisHealthy ? 'healthy' : 'degraded',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          version: '2.0.0',
          environment: process.env.NODE_ENV || 'development',
          queue: queueStats || { error: 'Redis unavailable' },
          checks: {
            database: true, // TODO: Add actual health check
            redis: redisHealthy,
          },
        }),
        {
          status: 200, // Always return 200 to prevent Railway restarts
          headers: { ...headers, 'Content-Type': 'application/json' },
        }
      );
    }

    // Queue statistics
    if (url.pathname === '/queue/stats') {
      const stats = await getQueueStats();
      return new Response(JSON.stringify(stats), {
        status: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    // =========================================================================
    // DASHBOARD SERVING (Multi-Tenant)
    // =========================================================================

    // Demo dashboard route (for testing without custom domain)
    if (url.pathname === '/demo') {
      // Use X-Business-ID header fallback (dev mode)
      const mockHeaders = new Headers(request.headers);
      mockHeaders.set('X-Business-ID', 'demo-001');
      const mockRequest = new Request(request.url.replace('/demo', '/'), {
        method: request.method,
        headers: mockHeaders,
        body: request.body,
      });
      console.log('[Dashboard] Serving demo dashboard with business ID: demo-001');
      return serveDashboard(mockRequest);
    }

    // Serve dashboard HTML (root path with subdomain)
    if (url.pathname === '/' || url.pathname === '/dashboard') {
      const subdomain = extractSubdomain(request.headers.get('host'));

      // If there's a subdomain, serve business dashboard
      if (subdomain) {
        console.log(`[Dashboard] Serving dashboard for subdomain: ${subdomain}`);
        return serveDashboard(request);
      }

      // No subdomain - serve landing page or redirect
      return new Response(
        `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Blue Lotus AI - Multi-Tenant SaaS</title>
          <style>
            body {
              font-family: system-ui;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: #fff;
            }
            .container {
              text-align: center;
              max-width: 600px;
              padding: 2rem;
            }
            h1 { font-size: 3rem; margin-bottom: 1rem; }
            p { font-size: 1.2rem; opacity: 0.9; }
            .subdomain-example {
              background: rgba(255,255,255,0.1);
              padding: 1rem;
              border-radius: 8px;
              margin-top: 2rem;
              font-family: monospace;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🏢 Blue Lotus AI</h1>
            <p>Multi-Tenant SaaS Platform</p>
            <p>Access your dashboard at:</p>
            <div class="subdomain-example">
              https://your-business.bluelotussolutions.ai
            </div>
            <p style="margin-top: 2rem; font-size: 0.9rem;">
              Powered by Bun • Version 2.0.0
            </p>
          </div>
        </body>
        </html>
        `,
        {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }
      );
    }

    // Serve static files (CSS, JS, images)
    if (url.pathname.match(/\.(css|js|png|jpg|svg|ico|woff|woff2|ttf)$/)) {
      return serveStaticFile(url.pathname);
    }

    // =========================================================================
    // 404 Not Found
    // =========================================================================

    return new Response(
      JSON.stringify({
        error: 'Not Found',
        path: url.pathname,
        method: request.method,
      }),
      {
        status: 404,
        headers: { ...headers, 'Content-Type': 'application/json' },
      }
    );
  },

  // Error handler
  error(error) {
    console.error('[Server Error]', error);
    return new Response(
      JSON.stringify({
        error: 'Internal Server Error',
        message: error.message,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  },
});

/**
 * Add CORS headers to response
 */
function addCorsHeaders(response: Response, corsHeaders: Record<string, string>): Response {
  const newHeaders = new Headers(response.headers);
  Object.entries(corsHeaders).forEach(([key, value]) => {
    newHeaders.set(key, value);
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

// ============================================================================
// Startup
// ============================================================================

console.log('🚀 Blue Lotus AI SaaS Backend');
console.log('   Version: 2.0.0');
console.log('   Runtime: Bun ' + Bun.version);
console.log('   Port: ' + PORT);
console.log('   Environment: ' + (process.env.NODE_ENV || 'development'));
console.log('\n📡 Endpoints:');
console.log('   POST /webhooks/vapi - Vapi call.ended webhook');
console.log('   POST /webhooks/botpress - Botpress webhook (TODO)');
console.log('   GET  /health - Health check');
console.log('   GET  /queue/stats - Queue statistics');
console.log('\n✅ Server running at http://localhost:' + PORT);

// ============================================================================
// Graceful Shutdown
// ============================================================================

process.on('SIGTERM', async () => {
  console.log('\n⚠️  SIGTERM received, shutting down gracefully...');
  server.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\n⚠️  SIGINT received, shutting down gracefully...');
  server.stop();
  process.exit(0);
});
