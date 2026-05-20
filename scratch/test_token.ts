import jwt from 'jsonwebtoken';

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYWRtaW4iLCJpYXQiOjE3Nzg0MTk4ODksImV4cCI6MTc3OTAyNDY4OX0.ee98ZyS0uBLZh7w83sOaISK57PM1GO9_PJyrfjgLpes';
const secrets = ['secret', 'your-secret-key', 'another-secret'];

for (const secret of secrets) {
    try {
        const decoded = jwt.verify(token, secret);
        console.log(`Verified with secret: "${secret}"`);
        console.log('Decoded:', decoded);
    } catch (e) {
        console.log(`Failed with secret: "${secret}"`);
    }
}
