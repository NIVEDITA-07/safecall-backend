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
  console.log('--- 1. Login Phone 1 as Senior (Meera) ---');
  const senior = await post('/api/auth/phone', { phone: '7592934065', name: 'Meera', role: 'elderly' });
  console.log('Senior logged in:', senior.body.user.name, 'Token:', senior.body.token.slice(0, 10));

  console.log('\n--- 2. Login Phone 2 as Caregiver (Bob) ---');
  const caregiver = await post('/api/auth/phone', { phone: '9876543210', name: 'Bob Caregiver', role: 'caregiver' });
  console.log('Caregiver logged in:', caregiver.body.user.name, 'Token:', caregiver.body.token.slice(0, 10));

  console.log('\n--- 3. Senior Generates Pairing Code ---');
  const codeRes = await post('/api/pairing/generate', {}, senior.body.token);
  const pairingCode = codeRes.body.pairingCode;
  console.log('Generated Code:', pairingCode);

  console.log('\n--- 4. Caregiver Enters Pairing Code ---');
  const pairRes = await post('/api/pairing/verify', { pairingCode }, caregiver.body.token);
  console.log('Pairing result:', pairRes.body);

  console.log('\n--- 5. Senior Checks Linked Caregivers ---');
  const linkedRes = await get('/api/pairing/linked', senior.body.token);
  console.log('Senior sees linked:', linkedRes.body.linked);

  console.log('\n--- 6. Senior Simulates Urgent Call (Dr. Vance, Score 100) ---');
  const alertRes = await post('/api/alerts/trigger', {
    callerName: 'Dr. Robert Vance',
    callerPhone: '+1 555-911-0022',
    score: 100,
    level: 'HIGH',
    explanation: 'Emergency doctor calling at 3:15 AM with repeated missed calls',
    isSimulation: true
  }, senior.body.token);
  console.log('Alert triggered:', alertRes.body);

  console.log('\n--- 7. Caregiver Polls Alerts History ---');
  const historyRes = await get('/api/alerts/history', caregiver.body.token);
  console.log('Caregiver received alerts count:', historyRes.body.alerts.length);
  if (historyRes.body.alerts.length > 0) {
    const a = historyRes.body.alerts[0];
    console.log(`[ALERT DELIVERED TO CAREGIVER] From: ${a.elderlyName} | Caller: ${a.callerName} | Score: ${a.score}/100`);
  }
}

run().catch(console.error);
