# Troubleshooting 431 "Request Header Fields Too Large" Errors

## Problem Description

The HTTP 431 status code "Request Header Fields Too Large" occurs when the total size of HTTP request headers exceeds the server's configured limit. This commonly happens with:

- Large JWT tokens
- Excessive cookies
- Large User-Agent strings
- Multiple or duplicate headers

## Root Causes

1. **Large JWT Tokens**: JWT tokens containing extensive user data or permissions
2. **Browser Cookies**: Accumulated cookies over time
3. **Development Tools**: Browser extensions adding headers
4. **Duplicate Headers**: Multiple instances of the same header
5. **Large User-Agent**: Some browsers/tools send very long User-Agent strings

## Solutions Implemented

### 1. Server Configuration
- **Increased Node.js header limit**: Set `--max-http-header-size=32768` (32KB instead of default 8KB)
- **Updated npm scripts**: Both `start` and `dev` scripts now include the increased header size limit
- **Header size monitoring**: Added middleware to log when headers approach the limit

### 2. Error Handling
- **Custom 431 error handler**: Provides helpful error messages and suggestions
- **Header size logging**: Warns when headers exceed 8KB (original limit)
- **Debugging information**: Logs header sizes and request details

### 3. Frontend Optimizations
- **Token management**: Automatic token refresh to prevent token accumulation
- **Cache management**: Proper cleanup of cached data
- **Header optimization**: Minimal required headers only

## How to Run with Fix

### Development
```bash
npm run dev
```
This automatically includes `NODE_OPTIONS='--max-http-header-size=32768'`

### Production
```bash
npm run build
npm start
```
This runs with `node --max-http-header-size=32768 dist/index.js`

### Manual Override
If you need to set a different limit:
```bash
NODE_OPTIONS='--max-http-header-size=65536' npm run dev  # 64KB
node --max-http-header-size=65536 dist/index.js         # Production
```

## Client-Side Solutions

### Clear Browser Data
1. Clear cookies and local storage
2. Disable browser extensions temporarily
3. Use incognito/private browsing mode

### Token Management
- Implement token rotation
- Use shorter-lived access tokens
- Store minimal data in JWT payload

### Header Optimization
- Remove unnecessary headers
- Avoid duplicate headers
- Use compression for large headers when possible

## Monitoring and Debugging

### Server Logs
The server now logs warnings when headers exceed 8KB:
```
WARN: Large headers detected {
  headerSize: 12345,
  url: "/api/auth/login",
  method: "POST",
  userAgent: "Mozilla/5.0...",
  authHeader: "Present (length: 2048)"
}
```

### Error Response
When a 431 error occurs, the server returns:
```json
{
  "error": {
    "code": "REQUEST_HEADER_FIELDS_TOO_LARGE",
    "message": "Request headers are too large. This often happens with large JWT tokens or cookies.",
    "suggestions": [
      "Clear browser cookies and local storage",
      "Use shorter JWT tokens",
      "Check for duplicate or unnecessary headers"
    ],
    "timestamp": "2024-01-01T00:00:00.000Z",
    "requestId": "uuid-here"
  }
}
```

## Prevention

### Development Best Practices
1. **Keep JWT payloads minimal**: Only include essential user data
2. **Implement token rotation**: Regular refresh of access tokens
3. **Monitor header sizes**: Use browser dev tools to check request headers
4. **Clean up cookies**: Regular cleanup of unnecessary cookies
5. **Test with realistic data**: Use production-like data volumes in testing

### Production Monitoring
1. **Set up alerts**: Monitor for 431 errors in logs
2. **Track header sizes**: Monitor average and peak header sizes
3. **User feedback**: Provide clear error messages to users
4. **Graceful degradation**: Fallback mechanisms when headers are too large

## Additional Resources

- [Node.js HTTP Documentation](https://nodejs.org/api/http.html)
- [RFC 7231 - HTTP/1.1 Semantics](https://tools.ietf.org/html/rfc7231#section-6.5.12)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)