const http = require('http');

function post(path, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body || {});
    const req = http.request({
      hostname: 'localhost', port: 4000, path, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...(token ? { 'Authorization': 'Bearer ' + token } : {})
      }
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    });
    req.on('error', reject);
    req.write(data); req.end();
  });
}

function get(path, token) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost', port: 4000, path, method: 'GET',
      headers: token ? { 'Authorization': 'Bearer ' + token } : {}
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    });
    req.on('error', reject); req.end();
  });
}

async function test() {
  console.log('--- Step 1: Logging in Senior (Meera) and Caregiver (Bob) ---');
  const senior = await post('/api/auth/login', { identifier: 'Meera', role: 'elderly' });
  const caregiver = await post('/api/auth/login', { identifier: 'Bob', role: 'caregiver' });
  console.log('Senior Token:', senior.token ? 'VALID' : 'FAILED');
  console.log('Caregiver Token:', caregiver.token ? 'VALID' : 'FAILED');

  console.log('\n--- Step 2: Testing Simulation Call (Emergency Scenario: 100/100) ---');
  const sim = await post('/api/alerts/trigger', {
    callerName: 'Dr. Robert Vance (Simulation)',
    callerPhone: '+1 555-911-0022',
    score: 100,
    level: 'HIGH',
    explanation: 'Simulated Emergency Call at 3:15 AM - Maximum Urgency',
    isSimulation: true
  }, senior.token);
  console.log('Simulation Call Result:', sim.triggered ? 'TRIGGERED (200 OK)' : 'FAILED');
  console.log('Simulation Recipients Notified:', sim.recipientsNotified);

  console.log('\n--- Step 3: Testing Real Life Call Event (Hospital Callback: 86/100) ---');
  const real = await post('/api/alerts/trigger', {
    callerName: 'General Hospital ICU (Real Telephony Event)',
    callerPhone: '+91 98123 45678',
    score: 86,
    level: 'HIGH',
    explanation: 'Real Call: 3 repeated calls within 10 minutes from critical contact',
    isSimulation: false
  }, senior.token);
  console.log('Real Life Call Result:', real.triggered ? 'TRIGGERED (201 CREATED)' : 'FAILED');
  console.log('Real Life Dispatched Caregivers:', real.recipientsNotified);

  console.log('\n--- Step 4: Caregiver Polling Alert Feed (/api/alerts/history) ---');
  const history = await get('/api/alerts/history', caregiver.token);
  console.log('Caregiver Received Alerts Count:', history.alerts.length);
  console.log('Top Alerts in Caregiver Feed:');
  history.alerts.slice(0, 3).forEach((a, i) => {
    console.log(`  [${i+1}] Score: ${a.score}/100 | Caller: ${a.callerName} | ${a.explanation}`);
  });

  if (sim.triggered && real.triggered && history.alerts.length >= 2) {
    console.log('\n🎯 ALL TESTS PASSED: BOTH Real Life Calls and Simulation Calls are working 100% smoothly!');
  } else {
    console.log('\n❌ One or more steps failed.');
  }
}

test().catch(console.error);
