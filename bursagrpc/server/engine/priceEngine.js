/**
 * Price Engine
 * Updates market prices with blended exec price + random volatility noise.
 */

const VOLATILITY = 0.001; // 0.1% random noise

function updateMarketPrice(ticker, execPrice, execQty, state) {
  const p = state.prices.get(ticker);

  // Blended: 70% exec price, 30% current price (smooth movement)
  const blended = execPrice * 0.7 + p.current * 0.3;

  // Small random noise for realism
  const noise = blended * VOLATILITY * (Math.random() * 2 - 1);
  const newPrice = Math.max(1, Math.round(blended + noise));

  p.current = newPrice;
  p.high = Math.max(p.high, newPrice);
  p.low = Math.min(p.low, newPrice);
  p.volume += execQty;
  p.lastUpdated = Date.now();
}

function changePct(ticker, state) {
  const p = state.prices.get(ticker);
  if (!p || p.open === 0) return 0;
  return ((p.current - p.open) / p.open) * 100;
}

module.exports = { updateMarketPrice, changePct };
