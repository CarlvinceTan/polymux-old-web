export const PRESET_PROMPTS = [
  'Play a game of chess on lichess.org — don\'t stop until you win!',
  'Find me the most expensive hotel in Bali on Trip.com and the cheapest hotel in Dubai on Booking.com',
  'Go to Google Flights and find the cheapest round-trip from New York to Tokyo next month',
  'Go to Hacker News, find the #1 story, read the comments, and give me a summary',
  'Compare the price of the latest MacBook Pro on Amazon vs Best Buy',
  'Find the top trending GitHub repositories today and tell me what\'s hot in open source',
  'Look up the weather in Tokyo, London, and New York — tell me which city is nicest right now',
  'Go to Product Hunt, find today\'s #1 product, visit their site, and explain what they do',
  'Find the most viewed YouTube video uploaded in the last 24 hours',
  'Search for the top-rated Airbnb in Santorini with a sea view',
  'Check the latest tech news on TechCrunch and summarize the top 3 stories, find the #1 story on Hacker News and explain why it matters to developers',
  'Go to Wikipedia, hit Random Article 5 times, and connect them into a short story',
] as const

export function pickRandomPresetPrompt(): string {
  return PRESET_PROMPTS[Math.floor(Math.random() * PRESET_PROMPTS.length)]!
}
