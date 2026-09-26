export function downloadCsv(filename: string, headers: string[], rows: Record<string, unknown>[]): void {
  const escape = (value: unknown) => {
    if (value == null) return ''
    const text = String(value)
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const lines = [headers.join(','), ...rows.map((row) => headers.map((header) => escape(row[header])).join(','))]
  const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}

export function downloadSvgAsPng(svg: SVGSVGElement, filename: string): void {
  const clone = svg.cloneNode(true) as SVGSVGElement
  const width = svg.viewBox.baseVal.width || svg.clientWidth || 1000
  const height = svg.viewBox.baseVal.height || svg.clientHeight || 700
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  const xml = new XMLSerializer().serializeToString(clone)
  const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const image = new Image()
  image.onload = () => {
    const scale = 2
    const canvas = document.createElement('canvas')
    canvas.width = width * scale
    canvas.height = height * scale
    const context = canvas.getContext('2d')
    if (!context) return
    context.fillStyle = '#0e1a24'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    URL.revokeObjectURL(url)
    canvas.toBlob((png) => {
      if (!png) return
      const link = document.createElement('a')
      link.href = URL.createObjectURL(png)
      link.download = filename
      link.click()
      URL.revokeObjectURL(link.href)
    })
  }
  image.src = url
}
