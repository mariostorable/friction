import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Friction Intelligence | Storable',
  description: 'Early warning system for customer friction',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
