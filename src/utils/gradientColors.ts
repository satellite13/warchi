const gradientColors = [
  "linear-gradient(135deg, #7c5cfc 0%, #b06cff 100%)",
  "linear-gradient(135deg, #45e0b8 0%, #7c5cfc 100%)",
  "linear-gradient(135deg, #f472b6 0%, #ec4899 100%)",
  "linear-gradient(135deg, #38bdf8 0%, #818cf8 100%)",
  "linear-gradient(135deg, #fb923c 0%, #f472b6 100%)",
  "linear-gradient(135deg, #34d399 0%, #38bdf8 100%)",
  "linear-gradient(135deg, #fbbf24 0%, #fb923c 100%)",
  "linear-gradient(135deg, #a78bfa 0%, #f472b6 100%)"
]

export function getGradient(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash)
  }
  return gradientColors[Math.abs(hash) % gradientColors.length]!
}
