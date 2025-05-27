// main.js
document.addEventListener('DOMContentLoaded', () => {
  const fetchTestBtn = document.getElementById('fetch-test-btn');
  const resultDiv = document.getElementById('result');

  fetchTestBtn.addEventListener('click', async () => {
    try {
      resultDiv.textContent = 'Loading from /test...';

      // Fetch from the Go backend /test endpoint
      const response = await fetch('/test');
      const data = await response.text();

      resultDiv.textContent = data;
    } catch (error) {
      resultDiv.textContent = `Error: ${error.message}`;
      console.error('Error fetching from /test endpoint:', error);
    }
  });
});
