'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const guideProfiles = require('../api-routes/guide-profiles');
const { signBookingCartJwt } = require('../lib/google-verify');

function response() {
  return {
    statusCode: 200,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
}

test('approved guide gallery save reaches the public guide and rejects another owner', async () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const email = 'guide-gallery-test@example.com';
    const image = 'data:image/jpeg;base64,Zm9v';
    global.__bc_guide_profiles = new Map([['gallery-test', {
      id: 'gallery-test', email, status: 'approved',
      step_personal: { fullName: 'Gallery Test Guide' }, step_gallery: [],
    }]]);
    global.__guides = [{ id: 987, slug: 'guide-gallery-test', name: 'Gallery Test Guide', email, gallery: [] }];

    const wrongOwner = response();
    await guideProfiles({ method: 'POST', headers: { authorization: `Bearer ${signBookingCartJwt({ email: 'other@example.com' })}` }, body: {
      action: 'save', step: 'gallery', data: [{ url: image }], profileId: 'gallery-test', currentStep: 10,
    } }, wrongOwner);
    assert.equal(wrongOwner.statusCode, 404);
    assert.deepEqual(global.__guides[0].gallery, []);

    const saved = response();
    await guideProfiles({ method: 'POST', headers: { authorization: `Bearer ${signBookingCartJwt({ email })}` }, body: {
      action: 'save', step: 'gallery', data: [{ url: image }], profileId: 'gallery-test', currentStep: 10,
    } }, saved);
    assert.equal(saved.statusCode, 200);
    assert.equal(saved.body.ok, true);
    assert.deepEqual(global.__guides[0].gallery, [image]);
  } finally {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    delete global.__bc_guide_profiles;
    delete global.__guides;
  }
});
