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
  'Open Amazon, Best Buy, Walmart, and Target — find the cheapest PS5 right now and tell me where to buy it',
  'Check Booking.com, Airbnb, and Hotels.com for the best 3-night stay in Lisbon next weekend — give me the winner',
  'Pull up Rotten Tomatoes, IMDb, Metacritic, and Letterboxd for the #1 movie this weekend — which critics are most out of step?',
  'Check Yahoo Finance, Google Finance, and CoinMarketCap — tell me today\'s biggest mover across stocks and crypto',
  'Open Reddit, Hacker News, and X trending — find a story that\'s blowing up on all three and summarize why',
  'Check Kayak, Google Flights, and Skyscanner for a round-trip SF to Tokyo next month — who\'s actually cheapest after fees?',
  'Search Uber Eats, DoorDash, and Grubhub for sushi delivery in Manhattan — who has the best deal tonight?',
  'Open Zillow, Redfin, and Realtor.com — find the best 2-bed condo under $600k in Austin and compare their estimates',
  'Find today\'s top post on r/AskReddit and summarize the funniest answer',
  'Look up a 30-minute chicken dinner recipe on AllRecipes and give me the shopping list',
  'Check ESPN for last night\'s NBA scores and tell me which game had the biggest upset',
  'Go to Goodreads, find a top-rated book released this year, and tell me what it\'s about',
  'Search LinkedIn for remote senior engineer roles at climate tech startups — pick the most interesting one',
  'Go to Steam, find today\'s top seller under $20, and tell me if the reviews say it\'s worth it',
  'Find the newest AI paper on arXiv and explain the abstract like I\'m in high school',
] as const

export function pickRandomPresetPrompt(): string {
  return PRESET_PROMPTS[Math.floor(Math.random() * PRESET_PROMPTS.length)]!
}
