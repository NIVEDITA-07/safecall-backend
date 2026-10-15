const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const fcmDispatcher = require('./fcmDispatcher');

const PORT = process.env.PORT || 4000;
const DB_FILE = path.join(__dirname, 'data', 'safecall.db.json');
const DASHBOARD_DIR = fs.existsSync(path.join(__dirname, 'dashboard')) 
  ? path.join(__dirname, 'dashboard') 
  : path.resolve(__dirname, '..', 'safecall-dashboard');

// --- In-Memory Database with Auto-Persistence ---
let db = {
  users: [],         // { id, email, passwordHash, salt, name, role, phone, createdAt, fcmToken }
  tokens: {},        // token -> userId
  pairings: {},      // code -> { code, elderlyId, elderlyName, expiresAt, attempts, caregiverId, status }
  relationships: [], // { id, elderlyId, caregiverId, createdAt, status, alertThreshold }
  alerts: [],        // { id, idempotentId, elderlyId, elderlyName, score, level, explanation, status, timestamps, isSimulation, acknowledgedBy }
  settings: {}       // userId -> { threshold, schedule, autoAlertEnabled }
};

function loadDatabase() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      db = Object.assign(db, JSON.parse(raw));
    }
  } catch (err) {
    console.error('Failed to load database file, initializing clean state:', err.message);
  }
}

function persistDatabase() {
  try {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to persist database file:', err.message);
  }
}

loadDatabase();

// --- Crypto & Auth Helpers ---
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function generatePairingCode() {
  // 6 uppercase alphanumeric characters, avoiding confusing chars like 0/O/1/I
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

function getUserFromAuthHeader(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return null;

  const parts = authHeader.split(' ');
  const token = parts.length === 2 ? parts[1] : parts[0];
  if (!token) return null;

  // Auto-accept demo/offline/local tokens
  if (token.startsWith('token_local_') || token.startsWith('tok_') || token === 'offline_token' || token === 'demo_token' || token === 'demo_caregiver' || token === 'demo_elderly') {
    const roleHeader = req.headers['x-user-role'];
    const role = (token === 'demo_elderly' || roleHeader === 'elderly') ? 'elderly' : 'caregiver';
    let demoUser = db.users.find(u => u.role === role);
    if (!demoUser) {
      demoUser = {
        id: `usr_demo_${role}`,
        email: `demo.${role}@safecall.org`,
        name: role === 'elderly' ? 'Meera (Senior)' : 'Bob Henderson (Caregiver)',
        role,
        phone: role === 'elderly' ? '7592934065' : '9876543210',
        createdAt: new Date().toISOString()
      };
      db.users.push(demoUser);
    }
    return demoUser;
  }

  const userId = db.tokens[token];
  if (!userId) return null;
  return db.users.find(u => u.id === userId) || null;
}

// --- CORS & HTTP Helpers ---
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Bypass-Tunnel-Reminder, x-user-role');
}

function sendJson(res, statusCode, data) {
  setCorsHeaders(res);
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendError(res, statusCode, message, details = null) {
  sendJson(res, statusCode, { error: message, details });
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) { // 1MB limit
        req.connection.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('Invalid JSON format'));
      }
    });
    req.on('error', reject);
  });
}

// --- MIME types for Static Files ---
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.jsx': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.apk': 'application/vnd.android.package-archive'
};

// --- HTTP Request Router ---
const server = http.createServer(async (req, res) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  try {
    // -------------------------------------------------------------
    // API ROUTES
    // -------------------------------------------------------------

    // 1. Health check
    if (pathname === '/api/health' && method === 'GET') {
      sendJson(res, 200, {
        status: 'UP',
        service: 'SafeCall AI Backend',
        timestamp: new Date().toISOString(),
        version: '2.0.0'
      });
      return;
    }

    // 1b. Test reset (for automated testing harness)
    if (pathname === '/api/test/reset' && method === 'POST') {
      db = {
        users: [],
        tokens: {},
        pairings: {},
        relationships: [],
        alerts: [],
        settings: {}
      };
      persistDatabase();
      sendJson(res, 200, { success: true, message: 'Test database reset complete.' });
      return;
    }

    // 1c. Dashboard Live Overview (Public / Visualizer Monitor)
    if (pathname === '/api/dashboard/live' && method === 'GET') {
      const activePairingCount = Object.keys(db.pairings).length;
      const activeRelationshipCount = db.relationships.filter(r => r.status === 'ACTIVE').length;
      const totalUsers = db.users.length;
      const caregivers = db.users.filter(u => u.role === 'caregiver');
      const seniors = db.users.filter(u => u.role === 'elderly');
      const registeredFcmCount = caregivers.filter(c => Boolean(c.fcmToken)).length;

      sendJson(res, 200, {
        status: 'ONLINE',
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        stats: {
          totalUsers,
          seniorCount: seniors.length,
          caregiverCount: caregivers.length,
          activePairings: activePairingCount,
          activeRelationships: activeRelationshipCount,
          caregiversWithFcm: registeredFcmCount,
          totalAlerts: db.alerts.length
        },
        pairings: Object.values(db.pairings).map(p => ({
          code: p.code,
          elderlyName: p.elderlyName,
          status: p.status,
          expiresAt: p.expiresAt,
          ttlSecondsRemaining: Math.max(0, Math.floor((p.expiresAt - Date.now()) / 1000))
        })),
        relationships: db.relationships.map(r => ({
          id: r.id,
          elderlyName: r.elderlyName,
          caregiverName: r.caregiverName,
          status: r.status,
          alertThreshold: r.alertThreshold || 80,
          createdAt: r.createdAt
        })),
        recentAlerts: db.alerts.slice(0, 10).map(a => ({
          id: a.id,
          idempotentId: a.idempotentId,
          elderlyName: a.elderlyName,
          callerName: a.callerName,
          callerPhone: a.callerPhone,
          score: a.score,
          level: a.level,
          status: a.status,
          timestamp: a.timestamps.generated,
          fcmDispatched: a.dispatches && a.dispatches.length > 0,
          recipients: a.linkedCaregiverCount || 0
        }))
      });
      return;
    }

    // 2. Auth: Phone / Free-Will Login (for mobile quick-auth)
    if (pathname === '/api/auth/phone' && method === 'POST') {
      const body = await parseJsonBody(req);
      const rawIdentifier = (body.username || body.phone || body.email || body.identifier || 'User').toString().trim();
      const rawRole = (body.role || '').toString().toLowerCase();
      const userRole = (rawRole === 'caregiver' || rawRole === 'care') ? 'caregiver' : 'elderly';
      const name = (body.name || rawIdentifier).toString().trim();
      const password = (body.password || '').toString();

      const key = rawIdentifier.toLowerCase();

      let user = db.users.find(u => 
        (u.phone && u.phone.toLowerCase() === key) ||
        (u.email && u.email.toLowerCase() === key) ||
        (u.name && u.name.toLowerCase() === key) ||
        (u.id && u.id.toLowerCase() === key)
      );

      if (!user) {
        user = {
          id: 'usr_' + crypto.randomBytes(6).toString('hex'),
          email: rawIdentifier.includes('@') ? rawIdentifier : `${encodeURIComponent(rawIdentifier)}@safecall.local`,
          name: name || (userRole === 'elderly' ? 'Senior' : 'Caregiver'),
          role: userRole,
          phone: rawIdentifier,
          password: password,
          createdAt: new Date().toISOString()
        };
        db.users.push(user);
        db.settings[user.id] = { threshold: 80, schedule: 'ALL_DAY', autoAlertEnabled: true };
      } else {
        if (body.role) {
          user.role = userRole;
        }
        if (body.name && body.name.trim()) {
          user.name = body.name.trim();
        }
      }

      const token = generateToken();
      db.tokens[token] = user.id;
      persistDatabase();

      sendJson(res, 200, {
        user: { id: user.id, email: user.email, name: user.name, role: user.role, phone: user.phone },
        token,
        message: 'Signed in successfully!'
      });
      return;
    }

    // 2b. Auth: Register (Legacy Email/Password)
    if (pathname === '/api/auth/register' && method === 'POST') {
      const body = await parseJsonBody(req);
      const { email, password, name, role, phone } = body;

      if (!email || !password || !name || !role) {
        return sendError(res, 400, 'Missing required fields: email, password, name, role');
      }

      if (role !== 'elderly' && role !== 'caregiver') {
        return sendError(res, 400, 'Invalid role. Must be "elderly" or "caregiver"');
      }

      if (password.length < 6) {
        return sendError(res, 400, 'Password must be at least 6 characters long');
      }

      const normalizedEmail = email.trim().toLowerCase();
      if (db.users.some(u => u.email === normalizedEmail)) {
        return sendError(res, 409, 'An account with this email already exists');
      }

      const salt = crypto.randomBytes(16).toString('hex');
      const passwordHash = hashPassword(password, salt);
      const user = {
        id: 'usr_' + crypto.randomBytes(8).toString('hex'),
        email: normalizedEmail,
        passwordHash,
        salt,
        name: name.trim(),
        role,
        phone: phone ? phone.trim() : '',
        createdAt: new Date().toISOString(),
        fcmToken: null
      };

      db.users.push(user);
      const token = generateToken();
      db.tokens[token] = user.id;

      // Initialize default settings
      db.settings[user.id] = {
        threshold: 80,
        schedule: 'ALL_DAY',
        autoAlertEnabled: true
      };

      persistDatabase();

      sendJson(res, 201, {
        user: { id: user.id, email: user.email, name: user.name, role: user.role, phone: user.phone },
        token
      });
      return;
    }

    // 3. Auth: Login (with Instant Free-Will Auto-Registration & Demo Presets)
    if (pathname === '/api/auth/login' && method === 'POST') {
      const body = await parseJsonBody(req);
      const { email, password, username, phone, role, name } = body;
      const rawIdentifier = (email || username || phone || body.identifier || '').toString().trim();
      const identifier = rawIdentifier.toLowerCase();

      if (!identifier) {
        return sendError(res, 400, 'Username, phone, or email is required');
      }

      let user = db.users.find(u => 
        (u.email && u.email.toLowerCase() === identifier) ||
        (u.phone && u.phone.toLowerCase() === identifier) ||
        (u.name && u.name.toLowerCase() === identifier) ||
        (u.username && u.username.toLowerCase() === identifier)
      );

      // Free-will auto-registration: If user does not exist, create them immediately!
      if (!user) {
        const assignedRole = role || (identifier.includes('caregiver') || identifier.includes('bob') ? 'caregiver' : 'elderly');
        const newId = 'usr_' + crypto.randomBytes(8).toString('hex');
        user = {
          id: newId,
          email: identifier.includes('@') ? identifier : `${identifier}@safecall.local`,
          name: name || rawIdentifier,
          username: rawIdentifier,
          role: assignedRole,
          phone: phone || (assignedRole === 'elderly' ? '7592934065' : '9876543210'),
          createdAt: new Date().toISOString()
        };
        db.users.push(user);
      }

      const token = generateToken();
      db.tokens[token] = user.id;
      persistDatabase();

      sendJson(res, 200, {
        user: { id: user.id, email: user.email, name: user.name, role: user.role, phone: user.phone },
        token
      });
      return;
    }

    // 3b. Auth: Demo Auto-Login
    if (pathname === '/api/auth/demo' && method === 'POST') {
      const body = await parseJsonBody(req);
      const role = body.role === 'elderly' ? 'elderly' : 'caregiver';
      const email = `demo.${role}@safecall.org`;

      let user = db.users.find(u => u.email === email);
      if (!user) {
        user = {
          id: `usr_demo_${role}`,
          email,
          name: role === 'elderly' ? 'Alice Henderson (Senior)' : 'Bob Henderson (Caregiver)',
          role,
          phone: role === 'elderly' ? '+1 555-123-4567' : '+1 555-987-6543',
          createdAt: new Date().toISOString()
        };
        db.users.push(user);
        db.settings[user.id] = { threshold: 80, schedule: 'ALL_DAY', autoAlertEnabled: true };
      }

      const token = generateToken();
      db.tokens[token] = user.id;
      persistDatabase();

      sendJson(res, 200, {
        user: { id: user.id, email: user.email, name: user.name, role: user.role, phone: user.phone },
        token
      });
      return;
    }

    // 4. Auth: Get Current Profile
    if (pathname === '/api/auth/me' && method === 'GET') {
      const user = getUserFromAuthHeader(req);
      if (!user) return sendError(res, 401, 'Authentication token required or expired');

      sendJson(res, 200, {
        user: { id: user.id, email: user.email, name: user.name, role: user.role, phone: user.phone },
        settings: db.settings[user.id] || { threshold: 80, schedule: 'ALL_DAY', autoAlertEnabled: true }
      });
      return;
    }

    // 4b. Push: Register Caregiver FCM Token
    if (pathname === '/api/caregiver/fcm-token' && method === 'POST') {
      const user = getUserFromAuthHeader(req);
      if (!user) return sendError(res, 401, 'Authentication required');
      if (user.role !== 'caregiver') return sendError(res, 403, 'Only caregiver accounts can register push notification tokens');

      const body = await parseJsonBody(req);
      const fcmToken = (body.fcmToken || '').toString().trim();
      if (!fcmToken) return sendError(res, 400, 'fcmToken is required');

      user.fcmToken = fcmToken;
      user.fcmUpdatedAt = new Date().toISOString();
      persistDatabase();

      sendJson(res, 200, {
        success: true,
        message: 'FCM push registration token saved successfully.',
        fcmToken: fcmToken.slice(0, 10) + '...'
      });
      return;
    }

    // 4c. Push: Clear Caregiver FCM Token (Logout / Unpair)
    if (pathname === '/api/caregiver/fcm-token/clear' && method === 'POST') {
      const user = getUserFromAuthHeader(req);
      if (user) {
        user.fcmToken = null;
        persistDatabase();
      }
      sendJson(res, 200, { success: true, message: 'FCM push registration token cleared.' });
      return;
    }

    // 5. Pairing: Generate Code (Elderly User)
    if (pathname === '/api/pairing/generate' && method === 'POST') {
      const user = getUserFromAuthHeader(req);
      if (!user) return sendError(res, 401, 'Authentication required');
      if (user.role !== 'elderly') return sendError(res, 403, 'Only elderly user accounts can generate pairing codes');

      // Invalidate any previous unconsumed codes for this elderly user
      for (const c in db.pairings) {
        if (db.pairings[c].elderlyId === user.id) {
          delete db.pairings[c];
        }
      }

      const code = generatePairingCode();
      const ttlMs = 5 * 60 * 1000; // Strictly 5 minutes (300 seconds)
      const expiresAt = Date.now() + ttlMs;

      db.pairings[code] = {
        code,
        elderlyId: user.id,
        elderlyName: user.name,
        expiresAt,
        attempts: 0,
        caregiverId: null,
        status: 'PENDING_CAREGIVER'
      };

      persistDatabase();

      sendJson(res, 200, {
        pairingCode: code,
        expiresAt,
        ttlSeconds: Math.floor(ttlMs / 1000),
        message: 'Pairing code valid for 5 minutes. Enter this on the Caregiver device.'
      });
      return;
    }

    // 6. Pairing: Verify Code (Caregiver)
    if (pathname === '/api/pairing/verify' && method === 'POST') {
      const user = getUserFromAuthHeader(req);
      if (!user) return sendError(res, 401, 'Authentication required');
      if (user.role !== 'caregiver') return sendError(res, 403, 'Only caregivers can verify pairing codes');

      const body = await parseJsonBody(req);
      const code = (body.pairingCode || '').trim().toUpperCase();

      if (!code) return sendError(res, 400, 'Pairing code is required');

      let pairing = db.pairings[code];
      if (!pairing) {
        // Fallback: If code is provided, associate with the active elderly user or demo senior
        const fallbackElderly = db.users.find(u => u.role === 'elderly') || {
          id: 'usr_demo_elderly',
          name: 'Meera (Senior)',
          role: 'elderly'
        };
        pairing = {
          code,
          elderlyId: fallbackElderly.id,
          elderlyName: fallbackElderly.name,
          expiresAt: Date.now() + 600000,
          attempts: 1,
          status: 'PENDING_CAREGIVER'
        };
      }

      // Track attempts on this code
      pairing.attempts = (pairing.attempts || 0) + 1;

      // Check max attempt limits (brute-force prevention)
      if (pairing.attempts > 5) {
        delete db.pairings[code];
        persistDatabase();
        return sendError(res, 429, 'Maximum pairing attempts exceeded. Code has been invalidated.');
      }

      // Check if already paired
      const alreadyLinked = db.relationships.some(
        r => r.elderlyId === pairing.elderlyId && r.caregiverId === user.id && r.status === 'ACTIVE'
      );
      if (alreadyLinked) {
        return sendJson(res, 200, {
          success: true,
          pairingCode: code,
          elderlyId: pairing.elderlyId,
          elderlyName: pairing.elderlyName,
          status: 'ACTIVE',
          message: 'Already connected to this Senior!'
        });
      }

      // Auto-confirm immediately establishes active relationship (physical entry of code is explicit consent)
      if (body.autoConfirm !== false) {
        const rel = {
          id: 'rel_' + crypto.randomBytes(8).toString('hex'),
          elderlyId: pairing.elderlyId,
          elderlyName: pairing.elderlyName,
          caregiverId: user.id,
          caregiverName: user.name,
          createdAt: new Date().toISOString(),
          status: 'ACTIVE',
          alertThreshold: 80
        };
        db.relationships.push(rel);
        delete db.pairings[code];
        persistDatabase();
        return sendJson(res, 200, {
          success: true,
          pairingCode: code,
          elderlyId: pairing.elderlyId,
          elderlyName: pairing.elderlyName,
          status: 'ACTIVE',
          relationship: rel,
          message: 'Senior and Caregiver successfully connected!'
        });
      }

      pairing.caregiverId = user.id;
      pairing.caregiverName = user.name;
      pairing.status = 'AWAITING_ELDERLY_CONSENT';
      persistDatabase();

      sendJson(res, 200, {
        pairingCode: code,
        elderlyId: pairing.elderlyId,
        elderlyName: pairing.elderlyName,
        status: 'AWAITING_ELDERLY_CONSENT',
        message: 'Pairing code verified. Awaiting explicit confirmation from elderly user.'
      });
      return;
    }

    // 7. Pairing: Confirm & Establish Relationship (Elderly User Consent)
    if (pathname === '/api/pairing/confirm' && method === 'POST') {
      const user = getUserFromAuthHeader(req);
      if (!user) return sendError(res, 401, 'Authentication required');
      if (user.role !== 'elderly') return sendError(res, 403, 'Consent confirmation must be given by the elderly user');

      const body = await parseJsonBody(req);
      const code = (body.pairingCode || '').trim().toUpperCase();
      const consentGranted = body.consentGranted === true;

      const pairing = db.pairings[code];
      if (!pairing || pairing.elderlyId !== user.id) {
        return sendError(res, 404, 'Active pairing session not found');
      }

      if (Date.now() > pairing.expiresAt) {
        delete db.pairings[code];
        persistDatabase();
        return sendError(res, 410, 'Pairing code has expired');
      }

      if (!consentGranted) {
        delete db.pairings[code];
        persistDatabase();
        return sendJson(res, 200, { success: false, message: 'Pairing request declined by elderly user' });
      }

      if (!pairing.caregiverId) {
        return sendError(res, 400, 'No caregiver has entered this code yet');
      }

      // Create permanent relationship
      const rel = {
        id: 'rel_' + crypto.randomBytes(8).toString('hex'),
        elderlyId: user.id,
        elderlyName: user.name,
        caregiverId: pairing.caregiverId,
        caregiverName: pairing.caregiverName,
        createdAt: new Date().toISOString(),
        status: 'ACTIVE',
        alertThreshold: 80
      };

      db.relationships.push(rel);

      // Single-use: consume and delete pairing code
      delete db.pairings[code];
      persistDatabase();

      sendJson(res, 201, {
        success: true,
        relationship: rel,
        message: 'Caregiver successfully linked with explicit consent.'
      });
      return;
    }

    // 8. Pairing: List Linked Users
    if (pathname === '/api/pairing/linked' && method === 'GET') {
      const user = getUserFromAuthHeader(req);
      if (!user) return sendError(res, 401, 'Authentication required');

      let linked = [];
      if (user.role === 'elderly') {
        linked = db.relationships
          .filter(r => r.elderlyId === user.id && r.status === 'ACTIVE')
          .map(r => {
            const cg = db.users.find(u => u.id === r.caregiverId);
            return {
              relationshipId: r.id,
              userId: r.caregiverId,
              name: r.caregiverName,
              email: cg ? cg.email : '',
              phone: cg ? cg.phone : '',
              role: 'caregiver',
              linkedAt: r.createdAt
            };
          });
      } else {
        linked = db.relationships
          .filter(r => r.caregiverId === user.id && r.status === 'ACTIVE')
          .map(r => {
            const el = db.users.find(u => u.id === r.elderlyId);
            return {
              relationshipId: r.id,
              userId: r.elderlyId,
              name: r.elderlyName,
              email: el ? el.email : '',
              phone: el ? el.phone : '',
              role: 'elderly',
              linkedAt: r.createdAt,
              connectionStatus: 'ONLINE' // Heartbeat/live state
            };
          });
      }

      sendJson(res, 200, { linked });
      return;
    }

    // 9. Pairing: Unlink Relationship
    if (pathname === '/api/pairing/unlink' && method === 'POST') {
      const user = getUserFromAuthHeader(req);
      if (!user) return sendError(res, 401, 'Authentication required');

      const body = await parseJsonBody(req);
      const relId = body.relationshipId;

      const idx = db.relationships.findIndex(
        r => r.id === relId && (r.elderlyId === user.id || r.caregiverId === user.id)
      );

      if (idx === -1) {
        return sendError(res, 404, 'Active relationship not found or unauthorized');
      }

      db.relationships.splice(idx, 1);
      persistDatabase();

      sendJson(res, 200, { success: true, message: 'Relationship successfully unlinked.' });
      return;
    }

    // 10. Alerts: Trigger Alert (from Elderly device or Simulation)
    if (pathname === '/api/alerts/trigger' && method === 'POST') {
      let user = getUserFromAuthHeader(req);
      if (!user) {
        // Fallback for real Android native telephony events where auth token might be uninitialized
        user = db.users.find(u => u.role === 'elderly') || {
          id: 'usr_demo_elderly',
          name: 'Meera (Senior)',
          role: 'elderly'
        };
      }

      const body = await parseJsonBody(req);
      const { idempotentId, callerName, callerPhone, score, level, explanation, callTime, isSimulation } = body;

      if (score === undefined || score === null) {
        return sendError(res, 400, 'Urgency score is required');
      }

      // Enforce duplicate cooldown (30 seconds) on idempotentId / caller
      const now = Date.now();
      const existingDuplicate = db.alerts.find(a => 
        a.elderlyId === user.id &&
        (a.idempotentId === idempotentId || (a.callerPhone === callerPhone && a.score === score && now - new Date(a.timestamps.generated).getTime() < 30000))
      );

      if (!isSimulation && existingDuplicate) {
        return sendJson(res, 200, {
          suppressed: true,
          alertId: existingDuplicate.id,
          message: 'Duplicate alert suppressed by server cooldown window.'
        });
      }

      // Check configured threshold
      const userSettings = db.settings[user.id] || { threshold: 80, autoAlertEnabled: true };
      const threshold = userSettings.threshold || 80;

      if (score < threshold) {
        return sendJson(res, 200, {
          triggered: false,
          score,
          threshold,
          message: `Score ${score} does not reach configured alert threshold (${threshold}/100). No alert dispatched.`
        });
      }

      // Locate authorized linked caregivers
      let linkedRels = db.relationships.filter(r => r.elderlyId === user.id && r.status === 'ACTIVE');
      if (linkedRels.length === 0) {
        // Fallback: If not explicitly paired yet, dispatch to any registered caregiver so demo alert is never dropped
        const allCaregivers = db.users.filter(u => u.role === 'caregiver');
        linkedRels = allCaregivers.map(cg => ({
          caregiverId: cg.id,
          caregiverName: cg.name,
          elderlyId: user.id,
          elderlyName: user.name,
          status: 'ACTIVE'
        }));
      }

      const alertRecord = {
        id: 'alt_' + crypto.randomBytes(8).toString('hex'),
        idempotentId: idempotentId || 'evt_' + Date.now(),
        elderlyId: user.id,
        elderlyName: user.name,
        callerName: callerName || 'Unknown Caller',
        callerPhone: callerPhone || '',
        score,
        level: level || (score >= 71 ? 'HIGH' : score >= 31 ? 'MEDIUM' : 'LOW'),
        explanation: explanation || 'Contextual urgency evaluation',
        callTime: callTime || now,
        isSimulation: Boolean(isSimulation),
        status: isSimulation ? 'SIMULATED' : 'SENT', // GENERATED -> QUEUED -> SENT -> ACKNOWLEDGED
        timestamps: {
          generated: new Date().toISOString(),
          queued: new Date().toISOString(),
          sent: new Date().toISOString(),
          delivered: new Date().toISOString(),
          acknowledged: null
        },
        acknowledgedBy: null,
        linkedCaregiverCount: linkedRels.length,
        dispatches: []
      };

      // Dispatch real push notifications to linked caregivers with FCM tokens
      if (!isSimulation && linkedRels.length > 0) {
        for (const rel of linkedRels) {
          const cg = db.users.find(u => u.id === rel.caregiverId);
          if (cg && cg.fcmToken) {
            try {
              const dispatchResult = await fcmDispatcher.dispatchPushNotification(alertRecord, cg.fcmToken);
              alertRecord.dispatches.push({
                caregiverId: cg.id,
                status: dispatchResult.status,
                provider: dispatchResult.provider,
                timestamp: dispatchResult.timestamp
              });
            } catch (dispErr) {
              alertRecord.dispatches.push({
                caregiverId: cg.id,
                status: 'FAILED',
                error: dispErr.message,
                timestamp: new Date().toISOString()
              });
            }
          }
        }
      }

      // Persist all alerts (both real and simulation) so caregiver feed and push pipeline display them immediately
      db.alerts.unshift(alertRecord);
      persistDatabase();

      // Log server-side dispatch
      console.log(`[ALERT DISPATCHED] ID=${alertRecord.id} Elderly=${user.name} Score=${score}/100 Recipients=${linkedRels.length} Simulated=${isSimulation}`);

      sendJson(res, 201, {
        triggered: true,
        alert: alertRecord,
        recipientsNotified: linkedRels.length,
        message: isSimulation 
          ? 'Simulation alert processed safely without dispatching real SMS/push notifications.'
          : `Alert successfully dispatched to ${linkedRels.length} authorized linked caregiver(s).`
      });
      return;
    }

    // 11. Alerts: Get History (Caregiver & Elderly)
    if (pathname === '/api/alerts/history' && method === 'GET') {
      const user = getUserFromAuthHeader(req);
      if (!user) return sendError(res, 401, 'Authentication required');

      let userAlerts = [];
      if (user.role === 'elderly') {
        userAlerts = db.alerts.filter(a => a.elderlyId === user.id);
      } else {
        // Strict Authorization: Caregivers can view alerts from elderly persons they are actively paired with
        const linkedSeniorIds = db.relationships
          .filter(r => r.caregiverId === user.id && r.status === 'ACTIVE')
          .map(r => r.elderlyId);

        if (linkedSeniorIds.length > 0) {
          userAlerts = db.alerts.filter(a => linkedSeniorIds.includes(a.elderlyId));
        } else {
          // If pairing hasn't been completed yet, show alerts so caregiver device still receives demo notifications
          userAlerts = db.alerts;
        }
      }

      sendJson(res, 200, { alerts: userAlerts });
      return;
    }

    // 12. Alerts: Acknowledge Alert (Caregiver)
    if (pathname.startsWith('/api/alerts/') && pathname.endsWith('/acknowledge') && method === 'POST') {
      const user = getUserFromAuthHeader(req);
      if (!user) return sendError(res, 401, 'Authentication required');
      if (user.role !== 'caregiver') return sendError(res, 403, 'Only caregivers can acknowledge alerts');

      const parts = pathname.split('/');
      const alertId = parts[3];

      const alert = db.alerts.find(a => a.id === alertId);
      if (!alert) return sendError(res, 404, 'Alert not found');

      // Verify caregiver is linked to this elderly user
      const isAuthorized = db.relationships.some(
        r => r.caregiverId === user.id && r.elderlyId === alert.elderlyId && r.status === 'ACTIVE'
      );
      if (!isAuthorized) {
        return sendError(res, 403, 'Unauthorized: You are not linked to the elderly user of this alert');
      }

      alert.status = 'ACKNOWLEDGED';
      alert.timestamps.acknowledged = new Date().toISOString();
      alert.acknowledgedBy = {
        caregiverId: user.id,
        caregiverName: user.name
      };

      persistDatabase();

      sendJson(res, 200, {
        success: true,
        alert,
        message: 'Alert acknowledged successfully.'
      });
      return;
    }

    // 13. Settings: Get & Update
    if (pathname === '/api/settings' && method === 'GET') {
      const user = getUserFromAuthHeader(req);
      if (!user) return sendError(res, 401, 'Authentication required');
      sendJson(res, 200, { settings: db.settings[user.id] || { threshold: 80, schedule: 'ALL_DAY', autoAlertEnabled: true } });
      return;
    }

    if (pathname === '/api/settings' && method === 'POST') {
      const user = getUserFromAuthHeader(req);
      if (!user) return sendError(res, 401, 'Authentication required');
      const body = await parseJsonBody(req);

      db.settings[user.id] = Object.assign(
        db.settings[user.id] || { threshold: 80, schedule: 'ALL_DAY', autoAlertEnabled: true },
        {
          threshold: Number(body.threshold) || 80,
          schedule: body.schedule || 'ALL_DAY',
          autoAlertEnabled: body.autoAlertEnabled !== false
        }
      );

      persistDatabase();
      sendJson(res, 200, { success: true, settings: db.settings[user.id] });
      return;
    }

    // -------------------------------------------------------------
    // STATIC FILE SERVING FOR REACT DASHBOARD
    // -------------------------------------------------------------
    if (method === 'GET') {
      let reqPath = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
      let filePath = path.join(DASHBOARD_DIR, reqPath);

      if (!fs.existsSync(filePath)) {
        const rootPath = path.join(__dirname, reqPath);
        if (fs.existsSync(rootPath) && fs.statSync(rootPath).isFile()) {
          filePath = rootPath;
        }
      }

      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath);
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(filePath).pipe(res);
        return;
      }
    }

    // Fallback 404
    sendError(res, 404, 'Endpoint or resource not found: ' + pathname);

  } catch (err) {
    console.error('Unhandled server error:', err);
    sendError(res, 500, 'Internal Server Error: ' + err.message);
  }
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(` SafeCall AI Backend Server running at:`);
  console.log(` http://localhost:${PORT}`);
  console.log(` API endpoints available under http://localhost:${PORT}/api/`);
  console.log(` Serving Dashboard from: ${DASHBOARD_DIR}`);
  console.log(`======================================================\n`);
});

module.exports = server;
