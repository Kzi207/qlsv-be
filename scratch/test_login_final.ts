async function testLogin() {
    try {
        const response = await fetch('http://localhost:5000/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username: 'admin',
                password: 'admin123'
            })
        });
        console.log('Login Success:', response.status);
        const data = await response.json();
        console.log('Data:', JSON.stringify(data, null, 2));
        console.log('Set-Cookie:', response.headers.get('set-cookie'));
    } catch (error: any) {
        console.error('Login Failed:', error);
    }
}

testLogin();

export {};
