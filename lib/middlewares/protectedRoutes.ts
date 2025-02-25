import type { FreshContext } from "$fresh/server.ts";
import { deleteCookie, getCookies } from "@std/http";
import { normalize, join, isAbsolute } from "@std/path";
import type { ServerState } from "./state.ts";

// Define protected routes with more granular permissions
export const PROTECTED_ROUTES = ["/api", "/auth", "/chat", "/user"] as const;
export type ProtectedRoute = typeof PROTECTED_ROUTES[number];

// Define permission levels
export enum Permission {
  READ = "read",
  WRITE = "write",
  ADMIN = "admin",
}

export type RoutePermissions = {
  [key in ProtectedRoute]: Permission[];
};

// Define required permissions for each protected route
export const ROUTE_PERMISSIONS: RoutePermissions = {
  "/api": [Permission.READ],
  "/auth": [Permission.READ],
  "/chat": [Permission.READ, Permission.WRITE],
  "/user": [Permission.READ, Permission.WRITE],
};

// Define redirect paths for unauthorized access
export const REDIRECT_PATHS: Record<ProtectedRoute, string> = {
  "/api": "/api-access-denied",
  "/auth": "/login",
  "/chat": "/login",
  "/user": "/login",
};

/**
 * Normalizes a URL path using the standard path library
 * - Handles path separators consistently
 * - Resolves '..' and '.' segments
 * - Handles duplicate slashes
 * 
 * @param path The path to normalize
 * @returns Normalized path string
 */
export function normalizePath(path: string): string {
  // Ensure path starts with slash
  if (!isAbsolute(path)) {
    path = '/' + path;
  }
  
  // Use the standard library to normalize the path
  // This handles cases like double slashes, '..' segments, etc.
  let normalized = normalize(path);
  
  // On Windows normalize() might use backslashes, but for web paths we want forward slashes
  normalized = normalized.replace(/\\/g, '/');
  
  // Decode URL components safely
  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    // If decoding fails, continue with the encoded path
  }
  
  return normalized;
}

/**
 * Checks if a path matches a protected route using proper path segment boundary checks
 * 
 * @param path The path to check
 * @returns A type predicate indicating if the path is a protected route
 */
export const isProtectedRoute = (path: string): path is ProtectedRoute => {
  const normalizedPath = normalizePath(path);
  
  return PROTECTED_ROUTES.some(route => {
    // Check for exact match
    if (normalizedPath === route) {
      return true;
    }
    
    // Check for path prefix with proper segment boundary
    // We use join to ensure proper handling of the trailing slash
    const routeWithTrailingSlash = join(route, '/');
    if (normalizedPath.startsWith(routeWithTrailingSlash)) {
      return true;
    }
    
    return false;
  });
};

/**
 * Gets the base route from a path with proper path segment boundary checking
 * 
 * @param path The full path
 * @returns The matching protected route or null
 */
export const getBaseRoute = (path: string): ProtectedRoute | null => {
  const normalizedPath = normalizePath(path);
  
  for (const route of PROTECTED_ROUTES) {
    // Exact match
    if (normalizedPath === route) {
      return route;
    }
    
    // Path prefix with proper segment boundary
    const routeWithTrailingSlash = join(route, '/');
    if (normalizedPath.startsWith(routeWithTrailingSlash)) {
      return route;
    }
  }
  
  return null;
};

interface JWTPayload {
  sub: string;
  username: string;
  permissions: string[];
  exp: number;
}

/**
 * Verifies a JWT token
 * @param token The token to verify
 * @returns The decoded payload or null if invalid
 */
async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    // This is a placeholder - implement with your JWT library
    // For production, use a proper JWT verification library
    
    // Example structure for verification:
    // 1. Split the token into parts
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    // 2. Decode the payload
    const payload = JSON.parse(atob(parts[1]));
    
    // 3. Check expiration
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    
    return payload as JWTPayload;
  } catch (error) {
    console.error("Token verification failed:", error);
    return null;
  }
}

/**
 * Checks if a user has the required permissions for a route
 * @param route The route to check
 * @param userPermissions The user's permissions
 * @returns Whether the user has permission
 */
function hasPermission(route: ProtectedRoute, userPermissions: string[]): boolean {
  const requiredPermissions = ROUTE_PERMISSIONS[route];
  return requiredPermissions.some(permission => userPermissions.includes(permission));
}

/**
 * Middleware that protects routes based on authentication and permissions
 */
export default async function protectedRouteHandler(
  req: Request,
  ctx: FreshContext<ServerState>,
): Promise<Response> {
  if (!ctx.destination) return ctx.next();
  const url = new URL(req.url);
  const headers = new Headers(req.headers);
  const path = normalizePath(url.pathname);

  try {
    // 1. Check if this is a protected route
    const baseRoute = getBaseRoute(path);
    if (!baseRoute) {
      return await ctx.next(); // Not a protected route, continue
    }

    // 2. Get the authentication token
    const cookies = getCookies(headers);
    const accessToken = cookies.auth;

    // 3. Verify session if token exists
    if (accessToken) {
      const { session } = ctx.state;
      if (!session) {
        throw new Error("Session middleware is not properly set up");
      }

      // Store in session
      const currentSessionToken = session.get("access_token");
      if (accessToken !== currentSessionToken) {
        session.set("access_token", accessToken);
      }

      // 4. Verify the token and extract user information
      const payload = await verifyToken(accessToken);
      
      if (payload) {
        // 5. Check if token is valid and not expired
        ctx.state.user = {
          id: payload.sub,
          username: payload.username,
          permissions: payload.permissions,
        };
        
        // 6. Check if user has required permissions for this route
        if (!hasPermission(baseRoute, payload.permissions)) {
          ctx.state.error = "Insufficient permissions";
          headers.set("location", "/access-denied");
          return new Response(null, {
            headers,
            status: 403,
            statusText: "Forbidden",
          });
        }
        
        // User is authenticated and authorized, continue
        return await ctx.next();
      }
    }

    // 7. Handle unauthenticated users trying to access protected routes
    if (baseRoute) {
      const redirectPath = REDIRECT_PATHS[baseRoute];
      headers.set("location", redirectPath);
      return new Response(null, {
        headers,
        status: 303,
        statusText: "See Other",
      });
    }

    return await ctx.next();
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Session middleware is not properly set up") {
        return new Response(error.message, { status: 500 });
      }

      // Clear auth state on error
      deleteCookie(headers, "auth", {
        path: "/",
        domain: url.hostname,
        secure: true,
      });

      if (ctx.state.session) {
        ctx.state.session.clear();
      }

      ctx.state.error = `Authentication error: ${error.message}`;
      
      // Log the error for debugging
      console.error("Authentication error:", error);
      
      headers.set("location", "/");

      return new Response(null, {
        headers,
        status: 303,
        statusText: "See Other",
      });
    }
    throw error; // Re-throw unknown errors
  }
}
