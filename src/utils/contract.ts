export function contractShortCode(contract: string): string {
  return contract.split('.', 2)[1] ?? contract
}

export function contractChineseLabel(productName: string, contract: string): string {
  let digits = contractShortCode(contract).match(/\d{3,4}$/)?.[0] ?? ''
  if (contract.startsWith('CZCE.') && digits.length === 3) {
    const currentYear = Number(
      new Intl.DateTimeFormat('en', { timeZone: 'Asia/Shanghai', year: 'numeric' }).format(
        new Date(),
      ),
    )
    let contractYear = Math.floor(currentYear / 10) * 10 + Number(digits[0])
    if (contractYear < currentYear - 2) contractYear += 10
    if (contractYear > currentYear + 7) contractYear -= 10
    digits = `${String(contractYear).slice(-2)}${digits.slice(1)}`
  }
  return `${productName}${digits}`
}
