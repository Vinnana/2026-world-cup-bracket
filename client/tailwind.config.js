export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Dark theme with gold accents
        fifa: {
          gold: '#c9a227',   // primary accent → gold
          blue: '#15130c',   // header / dark surface (near-black with warm tint)
          green: '#16a34a',  // correct-pick highlight
        },
      },
    },
  },
  plugins: [],
}
