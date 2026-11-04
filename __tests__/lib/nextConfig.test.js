const nextConfig = require('../../next.config');

describe('next.config', () => {
  it('never lets anything the API answers be cached: it is private and changes under people\'s feet', async () => {
    const rules = await nextConfig.headers();

    expect(rules).toEqual([{ source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'no-store' }] }]);
  });
});
