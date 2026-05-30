require('dotenv').config();
const { getCollections } = require('./lib/mongo');
const jwt = require('jsonwebtoken');
const secret = process.env.JWT_SECRET || 'bc_jwt_secret_change_this_in_production_abc123xyz789';
const { verifyAuthorizationBearer } = require('./lib/google-verify');

async function test() {
  const { users } = await getCollections();
  
  // Find a real user
  const user = await users.findOne({});
  if (!user) {
    console.log('No users found in db');
    return;
  }
  
  console.log('Found user:', user._id);
  const token = jwt.sign({ userId: user._id.toString() }, secret);
  
  const res = await verifyAuthorizationBearer(`Bearer ${token}`);
  console.log('Verification result:', res);
  process.exit(0);
}

test();
