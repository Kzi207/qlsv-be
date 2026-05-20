async function check() {
  try {
    const res = await fetch('http://localhost:5000/api/verify-server');
    const text = await res.text();
    console.log('Server response (first 200 chars):', text.substring(0, 200));
  } catch (error) {
    console.error('Server check failed:', error);
  }
}
check();

export {};
