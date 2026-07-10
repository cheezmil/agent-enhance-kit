import ClientProviders from '../components/ClientProviders';

export const metadata = {
  title: 'AEK-MCP',
  description: 'MCP Server Management Hub',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-white">
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
