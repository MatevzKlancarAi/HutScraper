const axios = require('axios');

async function exploreAPI() {
  const baseURL = 'https://www.hut-reservation.org/api/v1';

  console.log('Testing hut-reservation.org API endpoints...\n');

  // Try to get CSRF token
  try {
    const csrfResponse = await axios.get(`${baseURL}/csrf`);
    console.log('CSRF endpoint:', csrfResponse.status, csrfResponse.data);
  } catch (error) {
    console.log('CSRF endpoint error:', error.response?.status || error.message);
  }

  // Try to get hut info for known hut ID 648
  try {
    const hutResponse = await axios.get(`${baseURL}/reservation/hutInfo/648`);
    console.log('\nHut 648 info:', JSON.stringify(hutResponse.data, null, 2));
  } catch (error) {
    console.log('Hut info error:', error.response?.status || error.message);
  }

  // Try to find list of all huts - common endpoints
  const endpoints = [
    '/huts',
    '/hut',
    '/reservation/huts',
    '/reservation/list',
    '/list',
    '/search',
    '/browse'
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await axios.get(`${baseURL}${endpoint}`);
      console.log(`\n${endpoint}:`, response.status, 'Response size:', JSON.stringify(response.data).length);
      if (response.data && (Array.isArray(response.data) || response.data.huts)) {
        console.log('Found huts list!', response.data);
        break;
      }
    } catch (error) {
      console.log(`${endpoint}: ${error.response?.status || 'Failed'}`);
    }
  }

  // Try different hut IDs to see pattern
  console.log('\nTrying different hut IDs...');
  const testIds = [1, 100, 200, 300, 400, 500, 600, 647, 649, 650, 700];

  for (const id of testIds) {
    try {
      const response = await axios.get(`${baseURL}/reservation/hutInfo/${id}`);
      if (response.data) {
        console.log(`Hut ${id}: ${response.data.name || response.data.hutName || 'Found'}`);
      }
    } catch (error) {
      if (error.response?.status !== 404) {
        console.log(`Hut ${id}: Error ${error.response?.status}`);
      }
    }
  }

  // Try to get availability for a hut
  console.log('\nTrying availability endpoints...');
  const availabilityEndpoints = [
    '/reservation/availability/648',
    '/reservation/calendar/648',
    '/reservation/dates/648',
    '/availability/648',
    '/booking/availability/648'
  ];

  for (const endpoint of availabilityEndpoints) {
    try {
      const response = await axios.get(`${baseURL}${endpoint}`);
      console.log(`${endpoint}: Success`, Object.keys(response.data));
    } catch (error) {
      console.log(`${endpoint}: ${error.response?.status || 'Failed'}`);
    }
  }
}

exploreAPI().catch(console.error);