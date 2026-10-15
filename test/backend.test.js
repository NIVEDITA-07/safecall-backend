/**
 * SafeCall AI Backend Automated Test Suite
 * Validates:
 * - Authentication & Roles
 * - Pairing Code Expiry, Single-Use, Brute-Force Rate Limiting
 * - Explicit Elderly Consent Flow
 * - Authorization Isolation between Caregivers
 * - Urgency Alert Triggering, Threshold Boundaries & Cooldown
 * - Simulation Mode Isolation (never polluting real alert history)
 * - Caregiver Alert Acknowledgment Lifecycle
 * - Relationship Unlinking
 */

const http = require('http');

const PORT = 4099;
process.env.PORT = PORT;
const server = require('../server.js');

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = {
      'Content-Type': 'application/json'
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);

    const req = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path,
      method,
      headers
    }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          const parsed = raw ? JSON.parse(raw) : null;
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

async function runTests() {
  console.log('====================================================');
  console.log(' Starting SafeCall AI Backend Test Suite');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  // Reset database before testing
  await request('POST', '/api/test/reset');

  // 1. Health check
  await test('Server health check returns UP', async () => {
    const res = await request('GET', '/api/health');
    assert(res.status === 200, 'Health endpoint should return 200');
    assert(res.body.status === 'UP', 'Health status should be UP');
  });

  // 2. Auth: Registration
  let elderlyToken, caregiverToken1, caregiverToken2;
  let elderlyUser, caregiverUser1, caregiverUser2;

  await test('Register elderly user and caregiver users', async () => {
    const res1 = await request('POST', '/api/auth/register', {
      email: 'elderly.alice@safecall.org',
      password: 'password123',
      name: 'Alice Henderson',
      role: 'elderly',
      phone: '+15551234567'
    });
    assert(res1.status === 201, `Elderly register failed: ${JSON.stringify(res1.body)}`);
    assert(res1.body.user.role === 'elderly', 'Role must be elderly');
    elderlyToken = res1.body.token;
    elderlyUser = res1.body.user;

    const res2 = await request('POST', '/api/auth/register', {
      email: 'caregiver.bob@safecall.org',
      password: 'password123',
      name: 'Bob Henderson (Son)',
      role: 'caregiver',
      phone: '+15557654321'
    });
    assert(res2.status === 201, 'Caregiver 1 register failed');
    caregiverToken1 = res2.body.token;
    caregiverUser1 = res2.body.user;

    const res3 = await request('POST', '/api/auth/register', {
      email: 'caregiver.charlie@safecall.org',
      password: 'password123',
      name: 'Charlie Smith (Unrelated)',
      role: 'caregiver',
      phone: '+15559998888'
    });
    assert(res3.status === 201, 'Caregiver 2 register failed');
    caregiverToken2 = res3.body.token;
    caregiverUser2 = res3.body.user;
  });

  await test('Reject duplicate registration email', async () => {
    const res = await request('POST', '/api/auth/register', {
      email: 'elderly.alice@safecall.org',
      password: 'differentPassword',
      name: 'Duplicate Alice',
      role: 'elderly'
    });
    assert(res.status === 409, 'Duplicate email should be rejected with 409');
  });

  await test('Login with valid and invalid credentials', async () => {
    const okRes = await request('POST', '/api/auth/login', {
      email: 'elderly.alice@safecall.org',
      password: 'password123'
    });
    assert(okRes.status === 200, 'Valid login should return 200');
    assert(okRes.body.token, 'Login should return auth token');

    const badRes = await request('POST', '/api/auth/login', {
      email: 'elderly.alice@safecall.org',
      password: 'wrongPassword'
    });
    assert(badRes.status === 401, 'Invalid password should return 401');
  });

  // 3. Pairing Code Workflow
  let generatedCode;

  await test('Elderly generates a secure 6-character pairing code', async () => {
    const res = await request('POST', '/api/pairing/generate', {}, elderlyToken);
    assert(res.status === 200, `Generate pairing code failed: ${JSON.stringify(res.body)}`);
    assert(typeof res.body.pairingCode === 'string', 'Pairing code must be a string');
    assert(res.body.pairingCode.length === 6, 'Pairing code must be 6 characters');
    assert(res.body.ttlSeconds === 300, 'TTL must be 300 seconds (5 mins)');
    generatedCode = res.body.pairingCode;
  });

  await test('Caregiver cannot generate a pairing code (role restricted)', async () => {
    const res = await request('POST', '/api/pairing/generate', {}, caregiverToken1);
    assert(res.status === 403, 'Caregiver must receive 403 when generating pairing code');
  });

  await test('Caregiver verifies code and transitions to AWAITING_ELDERLY_CONSENT', async () => {
    const res = await request('POST', '/api/pairing/verify', {
      pairingCode: generatedCode
    }, caregiverToken1);
    assert(res.status === 200, `Verify pairing code failed: ${JSON.stringify(res.body)}`);
    assert(res.body.status === 'AWAITING_ELDERLY_CONSENT', 'Status must be AWAITING_ELDERLY_CONSENT');
    assert(res.body.elderlyName === 'Alice Henderson', 'Elderly name must match');
  });

  let relationshipId;
  await test('Elderly confirms consent and activates relationship (Single-Use Code Consumed)', async () => {
    const res = await request('POST', '/api/pairing/confirm', {
      pairingCode: generatedCode,
      consentGranted: true
    }, elderlyToken);
    assert(res.status === 201, `Confirm consent failed: ${JSON.stringify(res.body)}`);
    assert(res.body.success === true, 'Consent confirmation should succeed');
    assert(res.body.relationship.status === 'ACTIVE', 'Relationship status must be ACTIVE');
    relationshipId = res.body.relationship.id;
  });

  await test('Pairing code cannot be reused once consumed (Single-Use Guarantee)', async () => {
    const res = await request('POST', '/api/pairing/verify', {
      pairingCode: generatedCode
    }, caregiverToken2);
    assert(res.status === 404, 'Consumed pairing code must return 404 not found');
  });

  // 4. Rate-Limiting & Expiry
  await test('Pairing code invalidated after 3 failed attempts (Brute-Force Protection)', async () => {
    const genRes = await request('POST', '/api/pairing/generate', {}, elderlyToken);
    const testCode = genRes.body.pairingCode;

    // Send 4 attempts against this code
    await request('POST', '/api/pairing/verify', { pairingCode: testCode }, caregiverToken1);
    await request('POST', '/api/pairing/verify', { pairingCode: testCode }, caregiverToken1);
    await request('POST', '/api/pairing/verify', { pairingCode: testCode }, caregiverToken1);
    const lockedRes = await request('POST', '/api/pairing/verify', { pairingCode: testCode }, caregiverToken1);
    assert(lockedRes.status === 429, 'Excess attempts should trigger HTTP 429 rate limit');
  });

  // 5. Linked Users List
  await test('Caregiver 1 sees Alice Henderson in linked list; Caregiver 2 sees empty list', async () => {
    const res1 = await request('GET', '/api/pairing/linked', null, caregiverToken1);
    assert(res1.status === 200, 'Linked fetch failed');
    assert(res1.body.linked.length === 1, 'Caregiver 1 should have exactly 1 linked elderly user');
    assert(res1.body.linked[0].name === 'Alice Henderson', 'Linked user name must be Alice');

    const res2 = await request('GET', '/api/pairing/linked', null, caregiverToken2);
    assert(res2.status === 200, 'Linked fetch failed for caregiver 2');
    assert(res2.body.linked.length === 0, 'Caregiver 2 should have 0 linked users');
  });

  // 6. Urgency Alerts & Threshold Enforcement
  let triggeredAlertId;

  await test('Urgency score 70 does NOT trigger alert when threshold is 80', async () => {
    const res = await request('POST', '/api/alerts/trigger', {
      idempotentId: 'evt_sub_threshold_1',
      callerName: 'Neighbor Carol',
      callerPhone: '+15551112222',
      score: 70,
      level: 'MEDIUM',
      explanation: 'Single daytime call from neighbor'
    }, elderlyToken);
    assert(res.status === 200, 'Trigger evaluation should return 200');
    assert(res.body.triggered === false, 'Score 70 should not trigger alert at threshold 80');
  });

  await test('Elderly account cannot register caregiver FCM push token (403 Forbidden)', async () => {
    const res = await request('POST', '/api/caregiver/fcm-token', {
      fcmToken: 'fcm_token_invalid_for_elderly'
    }, elderlyToken);
    assert(res.status === 403, 'Elderly account must be denied 403 for caregiver FCM registration');
  });

  await test('Caregiver registers Android FCM device token securely', async () => {
    const res = await request('POST', '/api/caregiver/fcm-token', {
      fcmToken: 'fcm_token_caregiver_device_alpha_1234567890'
    }, caregiverToken1);
    assert(res.status === 200, 'Caregiver FCM token registration failed');
    assert(res.body.success === true, 'Registration must report success');
  });

  await test('Urgency score 85 triggers alert to linked caregiver with FCM dispatch', async () => {
    const res = await request('POST', '/api/alerts/trigger', {
      idempotentId: 'evt_urgent_1',
      callerName: 'Hospital / Unknown Medical',
      callerPhone: '+15559990000',
      score: 85,
      level: 'HIGH',
      explanation: 'Repeated late night calls from unknown caller'
    }, elderlyToken);
    assert(res.status === 201, `Trigger urgent alert failed: ${JSON.stringify(res.body)}`);
    assert(res.body.triggered === true, 'Score 85 must trigger alert');
    assert(res.body.recipientsNotified === 1, 'Exactly 1 linked caregiver must be notified');
    assert(res.body.alert.status === 'SENT', 'Alert status must be SENT');
    assert(Array.isArray(res.body.alert.dispatches), 'Alert must record FCM dispatch attempt');
    assert(res.body.alert.dispatches.length === 1, 'Caregiver 1 should have 1 FCM dispatch record');
    assert(res.body.alert.dispatches[0].status === 'SENT_TO_PROVIDER', 'FCM dispatch must report SENT_TO_PROVIDER');
    triggeredAlertId = res.body.alert.id;
  });

  await test('Duplicate alert within 30-second cooldown is suppressed', async () => {
    const dupRes = await request('POST', '/api/alerts/trigger', {
      idempotentId: 'evt_urgent_1',
      callerName: 'Hospital / Unknown Medical',
      callerPhone: '+15559990000',
      score: 85,
      level: 'HIGH',
      explanation: 'Repeated call within seconds'
    }, elderlyToken);
    assert(dupRes.status === 200, 'Duplicate check should return 200');
    assert(dupRes.body.suppressed === true, 'Duplicate alert must be suppressed by cooldown');
  });

  // 7. Authorization Isolation: Caregiver A vs Caregiver B
  await test('Caregiver 1 can view Alice\'s alerts; Caregiver 2 cannot view them', async () => {
    const res1 = await request('GET', '/api/alerts/history', null, caregiverToken1);
    assert(res1.status === 200, 'Caregiver 1 alert fetch failed');
    assert(res1.body.alerts.length === 1, 'Caregiver 1 should see exactly 1 alert');
    assert(res1.body.alerts[0].id === triggeredAlertId, 'Alert ID must match');

    const res2 = await request('GET', '/api/alerts/history', null, caregiverToken2);
    assert(res2.status === 200, 'Caregiver 2 alert fetch failed');
    assert(res2.body.alerts.length === 0, 'Caregiver 2 must NOT see alerts of unlinked elderly user');
  });

  await test('Caregiver 2 cannot acknowledge Alice\'s alert (403 Unauthorized)', async () => {
    const res = await request('POST', `/api/alerts/${triggeredAlertId}/acknowledge`, {}, caregiverToken2);
    assert(res.status === 403, 'Unauthorized caregiver must receive 403 when acknowledging alert');
  });

  await test('Caregiver 1 acknowledges alert successfully (Lifecycle -> ACKNOWLEDGED)', async () => {
    const res = await request('POST', `/api/alerts/${triggeredAlertId}/acknowledge`, {}, caregiverToken1);
    assert(res.status === 200, 'Caregiver 1 acknowledgment failed');
    assert(res.body.alert.status === 'ACKNOWLEDGED', 'Status must transition to ACKNOWLEDGED');
    assert(res.body.alert.acknowledgedBy.caregiverName === 'Bob Henderson (Son)', 'AcknowledgedBy must be recorded');
  });

  // 8. Simulation Mode Isolation
  await test('Simulation alert returns simulated response without altering real alert history', async () => {
    const simRes = await request('POST', '/api/alerts/trigger', {
      idempotentId: 'evt_sim_95',
      callerName: 'Fictional Dr. Evans',
      callerPhone: '+15550009999',
      score: 95,
      level: 'HIGH',
      explanation: 'Simulation: 3rd midnight call from fictional doctor',
      isSimulation: true
    }, elderlyToken);
    assert(simRes.status === 201, 'Simulation trigger should succeed');
    assert(simRes.body.alert.isSimulation === true, 'Alert must be marked as simulation');
    assert(simRes.body.alert.status === 'SIMULATED', 'Status must be SIMULATED');

    // Verify real alert history for Caregiver 1 still only has the 1 real alert
    const histRes = await request('GET', '/api/alerts/history', null, caregiverToken1);
    assert(histRes.body.alerts.length === 1, 'Real alert history must NEVER be altered by simulation events');
  });

  // 9. Unlink Relationship
  await test('Unlink relationship removes access', async () => {
    const unlinkRes = await request('POST', '/api/pairing/unlink', {
      relationshipId
    }, caregiverToken1);
    assert(unlinkRes.status === 200, 'Unlinking relationship failed');

    const linkedRes = await request('GET', '/api/pairing/linked', null, caregiverToken1);
    assert(linkedRes.body.linked.length === 0, 'After unlinking, linked list must be empty');

    const histRes = await request('GET', '/api/alerts/history', null, caregiverToken1);
    assert(histRes.body.alerts.length === 0, 'Unlinked caregiver can no longer access elderly alerts');
  });

  console.log('\n====================================================');
  console.log(` Test Results: ${passed} passed, ${failed} failed`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
