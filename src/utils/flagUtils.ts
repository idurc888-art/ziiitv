// Converte código alpha2 de país em emoji de bandeira Unicode
// Exemplo: "BR" → "🇧🇷", "US" → "🇺🇸", "AR" → "🇦🇷"
// Zero API, zero latência, funciona offline na TV
export function alpha2ToEmoji(alpha2: string): string {
  if (!alpha2 || alpha2.length !== 2) return '🏴'
  return alpha2.toUpperCase().split('').map(c =>
    String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)
  ).join('')
}

// Bandeiras dos 32 países da Copa 2026 — prontas, sem nenhuma chamada de rede
export const COPA_FLAGS: Record<string, string> = {
  AR: '🇦🇷', AU: '🇦🇺', BE: '🇧🇪', BR: '🇧🇷', CA: '🇨🇦',
  CM: '🇨🇲', CO: '🇨🇴', CR: '🇨🇷', DE: '🇩🇪', EC: '🇪🇨',
  EG: '🇪🇬', ES: '🇪🇸', FR: '🇫🇷', GB: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', GH: '🇬🇭',
  HR: '🇭🇷', IR: '🇮🇷', IT: '🇮🇹', JP: '🇯🇵', MA: '🇲🇦',
  MX: '🇲🇽', NG: '🇳🇬', NL: '🇳🇱', PA: '🇵🇦', PE: '🇵🇪',
  PT: '🇵🇹', SA: '🇸🇦', SN: '🇸🇳', TN: '🇹🇳', US: '🇺🇸',
  UY: '🇺🇾', VE: '🇻🇪',
}

// Para qualquer país — usa tabela se disponível, senão gera dinamicamente
export function flagFor(alpha2: string): string {
  return COPA_FLAGS[alpha2?.toUpperCase()] ?? alpha2ToEmoji(alpha2)
}
