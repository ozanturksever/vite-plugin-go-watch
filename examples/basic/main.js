// main.js
document.addEventListener('DOMContentLoaded', () => {
  const fetchBtn = document.getElementById('fetch-btn');
  const resultDiv = document.getElementById('result');

  fetchBtn.addEventListener('click', async () => {
    try {
      resultDiv.textContent = 'Loading...';
      
      // Fetch from the Go backend
      const response = await fetch('/');
      const data = await response.text();
      
      resultDiv.textContent = data;
    } catch (error) {
      resultDiv.textContent = `Error: ${error.message}`;
      console.error('Error fetching from Go API:', error);
    }
  });
});