/**
 * Dashboard Server
 *
 * Serves dashboard HTML and static files
 * Injects business context based on subdomain
 */

import { getBusinessFromRequest } from '../utils/subdomain';
import { readFile } from 'fs/promises';
import { join } from 'path';

/**
 * Serve dashboard HTML for a specific business
 *
 * This serves the dashboard with business context injected
 *
 * @param request - Incoming HTTP request
 * @returns HTML response with dashboard
 */
export async function serveDashboard(request: Request): Promise<Response> {
  try {
    // 1. Extract business from subdomain
    const business = await getBusinessFromRequest(request);

    if (!business) {
      // No business found - show error page
      return new Response(
        `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Business Not Found - Blue Lotus AI</title>
          <style>
            body {
              font-family: system-ui;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: #000;
              color: #fff;
            }
            .error {
              text-align: center;
              max-width: 500px;
              padding: 2rem;
            }
            h1 { color: #4a9eff; }
            a {
              color: #00d4ff;
              text-decoration: none;
            }
          </style>
        </head>
        <body>
          <div class="error">
            <h1>Business Not Found</h1>
            <p>The subdomain you're trying to access is not configured.</p>
            <p>Please contact support or check your URL.</p>
            <p><a href="https://bluelotussolutions.ai">← Back to Home</a></p>
          </div>
        </body>
        </html>
        `,
        {
          status: 404,
          headers: { 'Content-Type': 'text/html' },
        }
      );
    }

    // 2. Read dashboard HTML from public folder
    const dashboardPath = join(process.cwd(), '../public/dashboard.html');
    let dashboardHTML = await readFile(dashboardPath, 'utf-8');

    // 3. Inject business context into HTML
    // Replace placeholders with actual business data
    dashboardHTML = dashboardHTML
      .replace(/{{BUSINESS_NAME}}/g, business.name)
      .replace(/{{BUSINESS_ID}}/g, business.id)
      .replace(/{{BUSINESS_SUBDOMAIN}}/g, business.subdomain)
      .replace(/{{VAPI_ASSISTANT_ID}}/g, business.vapi_assistant_id || '')
      .replace(/{{API_URL}}/g, process.env.API_URL || '');

    // 4. Inject authentication token (TODO: replace with actual JWT)
    // For now, we'll inject the business_id for API calls
    const initScript = `
    <script>
      // Business context injected by server
      window.BUSINESS_ID = '${business.id}';
      window.BUSINESS_NAME = '${business.name}';
      window.ASSISTANT_ID = '${business.vapi_assistant_id || ''}';

      // API configuration
      window.API_BASE_URL = '${process.env.API_URL || '/api'}';

      // TODO: Replace with actual JWT from login
      window.AUTH_TOKEN = null;

      console.log('🏢 Business Context:', {
        id: window.BUSINESS_ID,
        name: window.BUSINESS_NAME,
        assistantId: window.ASSISTANT_ID
      });
    </script>
    `;

    // Inject script before </head>
    dashboardHTML = dashboardHTML.replace('</head>', `${initScript}</head>`);

    // 5. Return dashboard HTML
    return new Response(dashboardHTML, {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Error serving dashboard:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

/**
 * Serve static files (CSS, JS, images)
 *
 * @param pathname - URL pathname (e.g., /styles.css)
 * @returns File response or 404
 */
export async function serveStaticFile(pathname: string): Promise<Response> {
  try {
    // Security: prevent directory traversal
    if (pathname.includes('..')) {
      return new Response('Forbidden', { status: 403 });
    }

    // Map URL path to file system path
    const filePath = join(process.cwd(), '../public', pathname);

    // Read file
    const fileContent = await readFile(filePath);

    // Determine content type
    const contentType = getContentType(pathname);

    return new Response(fileContent, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });
  } catch (error) {
    return new Response('Not Found', { status: 404 });
  }
}

/**
 * Get content type from file extension
 */
function getContentType(pathname: string): string {
  const ext = pathname.split('.').pop()?.toLowerCase();
  const contentTypes: Record<string, string> = {
    html: 'text/html',
    css: 'text/css',
    js: 'application/javascript',
    json: 'application/json',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
  };
  return contentTypes[ext || ''] || 'application/octet-stream';
}
