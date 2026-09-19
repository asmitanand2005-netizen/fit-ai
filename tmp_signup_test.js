const fetch = global.fetch || require('node-fetch');
(async () => {
  try {
    const res = await fetch('http://localhost:3000/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'vivekviv84@gmail.com', password: 'vivek84835', name: 'vivek' }),
    });
    const text = await res.text();
    console.log('status', res.status);
    console.log('body', text);
  } catch (e) {
    console.error('error', e);
  }
})();
