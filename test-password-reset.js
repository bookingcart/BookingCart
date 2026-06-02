require('dotenv').config();
const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('./lib/google-verify');

const BASE = 'http://localhost:3000';

async function test() {
  console.log("=== Testing Password Reset Flow ===");

  const email = `testreset${Date.now()}@example.com`;
  const password = "Password1!";
  const newPassword = "NewPassword2@";

  try {
    // 1. Register a new user
    console.log(`1. Registering user: ${email}`);
    const regRes = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name: 'Reset Tester' })
    });
    const regData = await regRes.json();
    console.log('Register response:', regData);
    if (!regData.ok) throw new Error('Registration failed: ' + JSON.stringify(regData));

    // 2. Request forgot password
    console.log(`2. Requesting forgot password for: ${email}`);
    const forgotRes = await fetch(`${BASE}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const forgotData = await forgotRes.json();
    console.log('Forgot password response:', forgotData);
    if (!forgotData.ok) throw new Error('Forgot password failed: ' + JSON.stringify(forgotData));

    // 3. Generate token (simulating what the email receives)
    // Looking at api-routes/auth.js: resetToken = jwt.sign({ sub: email, purpose: 'reset' }, getJwtSecret(), { expiresIn: '15m' });
    const resetToken = jwt.sign({ sub: email, purpose: 'reset' }, getJwtSecret(), { expiresIn: '15m' });
    console.log('Generated token for testing:', resetToken);

    // 4. Reset password
    console.log(`3. Resetting password...`);
    const resetRes = await fetch(`${BASE}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: resetToken, password: newPassword })
    });
    const resetData = await resetRes.json();
    console.log('Reset password response:', resetData);
    if (!resetData.ok) throw new Error('Reset password failed: ' + JSON.stringify(resetData));

    // 5. Try login with new password
    console.log(`4. Logging in with new password...`);
    const loginRes = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: newPassword })
    });
    const loginData = await loginRes.json();
    console.log('Login response:', loginData);
    if (!loginData.ok) throw new Error('Login failed with new password: ' + JSON.stringify(loginData));

    console.log("=== Password Reset Flow Works Successfully! ===");
  } catch (err) {
    console.error("Test failed:", err);
  }
}

test();
