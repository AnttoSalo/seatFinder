const request = require('supertest');
const chai = require('chai');
const expect = chai.expect;
const app = require('../app'); // Now returns the Express app instance
const { deepCopy } = require('../app'); // deepCopy is exported now

describe('GET /', () => {
  it('should return the home page', (done) => {
    request(app)
      .get('/')
      .expect(200)
      .end((err, res) => {
        if (err) return done(err);
        expect(res.text).to.include('SeatFinder'); // ensure your home page includes "SeatFinder"
        done();
      });
  });
});

describe('deepCopy function', () => {
  it('should return a deep copy of an object', () => {
    const original = { a: 1, b: { c: 2 } };
    const copy = deepCopy(original);
    expect(copy).to.deep.equal(original);
    // Modify the copy and check that the original is not affected.
    copy.b.c = 99;
    expect(original.b.c).to.equal(2);
  });
});
