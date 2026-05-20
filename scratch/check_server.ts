async function check() {
  try {
    const res = await fetch('http://localhost:5000/api/verify-server');
    const data = await res.json();
    console.log('Server status:', data);
  } catch (error) {
    console.error('Server check failed:', error);
  }
}
check();

export {};
