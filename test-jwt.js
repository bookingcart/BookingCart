const jwt = require('jsonwebtoken');
const secret = process.env.JWT_SECRET || 'bc_jwt_secret_change_this_in_production_abc123xyz789';

const token = jwt.sign({ userId: '123456789012345678901234' }, secret);
console.log('Token:', token);

const { verifyAuthorizationBearer } = require('./lib/google-verify');
require('dotenv').config();

verifyAuthorizationBearer(`Bearer ${token}`).then(res => console.log('Result:', res)).catch(e => console.error(e));
