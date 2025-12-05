
async function testConnection() {
    try {
        console.log('Testing connection to http://localhost:3001/api/health...');
        const response = await fetch('http://localhost:3001/api/health');
        if (response.ok) {
            const data = await response.json();
            console.log('✅ Connection successful:', data);
        } else {
            console.error('❌ Server returned error:', response.status, response.statusText);
        }
    } catch (error) {
        console.error('❌ Connection failed:', error.message);
        if (error.cause) console.error('Cause:', error.cause);
    }
}

testConnection();
