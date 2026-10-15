const http = require('http');

function post(path, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body || {});
    const req = http.request({
      hostname: 'localhost',
      port: 4000,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    }, res => {
      let resp = '';
      res.on('data', d => resp += d);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(resp) }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(path, token) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 4000,
      path,
      method: 'GET',
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    }, res => {
      let resp = '';
      res.on('data', d => resp += d);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(resp) }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  console.log('--- 1. Free-Will Login Phone 1 as Senior with arbitrary username & password ---');
  const senior = await post('/api/auth/login', { 
    username: 'niveditha_senior', 
    password: 'mycustompassword999', 
    role: 'elderly',
    name: 'Niveditha Senior'
  });
  console.log('Senior logged in:', senior.body.user);

  console.log('\n--- 2. Free-Will Login Phone 2 as Caregiver with arbitrary username & password ---');
  const caregiver = await post('/api/auth/login', { 
    username: 'bob_caregiver_free', 
    password: 'anypassword!', 
    role: 'caregiver',
    name: 'Bob Caregiver'
  });
  console.log('Caregiver logged in:', caregiver.body.user);

  console.log('\n--- 3. Senior Generates Pairing Code ---');
  const codeRes = await post('/api/pairing/generate', {}, senior.body.token);
  console.log('Senior generated pairing code result:', codeRes.body);

  console.log('\n--- 4. Caregiver Verifies Pairing Code ---');
  const verifyRes = await post('/api/pairing/verify', { pairingCode: codeRes.body.pairingCode }, caregiver.body.token);
  console.log('Pairing verification result:', verifyRes.body);

  console.log('\n--- 5. Senior Checks Linked Caregivers ---');
  const linked = await get('/api/pairing/linked', senior.body.token);
  console.log('Senior sees linked:', linked.body.linked);

  console.log('\n--- 6. Senior Simulates Urgent Call (Dr. Vance, Score 100) ---');
  const alertRes = await post('/api/alerts/trigger', {
    callerName: 'Dr. Robert Vance',
    callerPhone: '+1 555-911-0022',
    score: 100,
    level: 'HIGH',
    explanation: 'Urgent emergency call at 3:15 AM',
    isSimulation: true
  }, senior.body.token);
  console.log('Alert dispatch result:', alertRes.body);

  console.log('\n--- 7. Caregiver Polls Alerts History ---');
  const alertsRes = await get('/api/alerts/history', caregiver.body.token);
  console.log('Caregiver alerts count:', alertsRes.body.alerts.length);
  if (alertsRes.body.alerts.length > 0) {
    const a = alertsRes.body.alerts[0];
    console.log(`[ALERT RECEIVED BY CAREGIVER] From: ${a.elderlyName} | Score: ${a.score}/100 | Caller: ${a.callerName}`);
  }
}

run().catch(console.error);
