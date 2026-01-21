module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  theme: {
    extend: {
      colors: {
        status: {
          available: '#22c55e', // green-500
          reserved: '#f59e0b',  // amber-500
          occupied: '#ef4444',  // red-500
          maintenance: '#9ca3af' // gray-400
        },
        clean: {
          clean: '#22c55e',
          in_cleaning: '#f59e0b',
          needs_cleaning: '#ef4444'
        }
      }
    },
  },
  plugins: [],
};
