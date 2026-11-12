# Security Implementation Guide - New Customer Support System

This guide outlines the critical security vulnerabilities found in the TechTrek codebase and their fixes. While this is for TechTrek, your New-Customer-Support system should also implement these patterns.

---

## 11 Critical Vulnerabilities & Fixes

### 1. Weak Password Hashing (Bcrypt Rounds)
**Issue:** Passwords must use bcrypt with minimum 12 rounds
**Fix:**
```typescript
import bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}
```

### 2. Missing CSRF Protection
**Issue:** POST/PUT/DELETE endpoints need CSRF tokens
**Fix:** Implement CSRF token generation and validation on all state-changing operations

### 3. No Input Sanitization
**Issue:** NoSQL/XSS injection risk from unsanitized user input
**Fix:**
```typescript
import validator from 'validator';

export function sanitizeInput(obj: any): any {
  if (typeof obj !== 'object' || obj === null) return obj;
  
  const sanitized: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith('$')) continue; // Remove MongoDB operators
    
    if (typeof value === 'string') {
      sanitized[key] = validator.escape(value.trim());
    } else if (typeof value === 'object') {
      sanitized[key] = sanitizeInput(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}
```

### 4. Insufficient JWT Validation
**Issue:** JWTs must validate signature, expiry, issuer, and audience
**Fix:**
```typescript
export function verifyToken(token: string, secret: string, type: string): any {
  try {
    const decoded = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      issuer: 'your-app',
      audience: 'your-users'
    });
    
    if (decoded.type !== type) {
      throw new Error(`Expected ${type} token, got ${decoded.type}`);
    }
    return decoded;
  } catch (err) {
    if (err.name === 'TokenExpiredError') throw new Error('Token expired');
    throw new Error('Invalid token');
  }
}
```

### 5. Secrets Not Protected
**Issue:** JWT secrets must not be in version control
**Fix:**
- Add `.env.local` to `.gitignore`
- Use secure environment variable management
- Rotate secrets if exposed

### 6. No Rate Limiting on Auth
**Issue:** Login/signup endpoints vulnerable to brute force
**Fix:**
```typescript
import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: 'Too many attempts, try again in 15 minutes',
  skip: (req) => process.env.NODE_ENV !== 'production'
});
```

### 7. No HTTPS Enforcement
**Issue:** Production must require HTTPS
**Fix:**
```typescript
// next.config.js or equivalent
redirects: async () => {
  if (process.env.NODE_ENV === 'production') {
    return [{
      source: '/:path*',
      destination: 'https://:host/:path*',
      permanent: true
    }];
  }
  return [];
}
```

### 8. Missing CORS Configuration
**Issue:** CORS must be restricted to trusted origins
**Fix:**
```typescript
export const corsConfig = {
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  maxAge: 86400
};
```

### 9. Database Injection Vulnerabilities
**Issue:** NoSQL injection from unsanitized queries
**Fix:**
```typescript
// VULNERABLE
const user = await User.findOne({ email: req.body.email });

// SECURE - validate ObjectId format
import { Types } from 'mongoose';
const userId = new Types.ObjectId(String(req.body.userId));
const user = await User.findById(userId);
```

### 10. Passwords in Logs
**Issue:** Sensitive data logged in plaintext
**Fix:**
```typescript
// WRONG
console.log('Login attempt:', req.body); // Logs password!

// RIGHT
console.log(`Login attempt for: ${email}`); // Only email
```

### 11. Missing Security Headers
**Issue:** No protection against XSS, clickjacking, MIME sniffing
**Fix:**
```typescript
async headers() {
  return [{
    source: '/:path*',
    headers: [
      {
        key: 'Strict-Transport-Security',
        value: 'max-age=31536000; includeSubDomains'
      },
      {
        key: 'X-Content-Type-Options',
        value: 'nosniff'
      },
      {
        key: 'X-Frame-Options',
        value: 'DENY'
      },
      {
        key: 'X-XSS-Protection',
        value: '1; mode=block'
      },
      {
        key: 'Content-Security-Policy',
        value: \"default-src 'self'\""
      }
    ]
  }];
}
```

---

## Implementation Priority

**IMMEDIATE (This Week):**
1. Rate limiting on auth endpoints
2. Input sanitization on all API routes
3. HTTPS enforcement
4. Security headers

**SHORT TERM (This Month):**
5. Refresh token rotation
6. HTTPS-only cookies
7. Audit logging
8. JWT validation improvements

**ONGOING:**
9. Dependency security scanning
10. Penetration testing
11. Security monitoring

---

## Recommended Dependencies

```json
{
  "dependencies": {
    "bcrypt": "^5.1.0",
    "jsonwebtoken": "^9.1.0",
    "validator": "^13.9.0",
    "express-rate-limit": "^7.0.0",
    "express-mongo-sanitize": "^2.2.0"
  }
}
```

---

## Security Testing Checklist

- [ ] All passwords hashed with bcrypt (12+ rounds)
- [ ] JWT tokens validated (signature, expiry, issuer, audience)
- [ ] Auth endpoints rate-limited (5 attempts / 15 min)
- [ ] All user input sanitized
- [ ] HTTPS enforced in production
- [ ] Security headers set
- [ ] CORS properly configured
- [ ] No sensitive data in logs
- [ ] Database queries use parameterized/validated input
- [ ] Refresh tokens are httpOnly and secure
- [ ] Secrets not in version control
- [ ] Audit logging implemented

---

See SECURITY_AUDIT.md for detailed analysis of each vulnerability.
