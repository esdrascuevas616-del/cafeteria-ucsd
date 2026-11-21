export const metadata = {
  title: 'Cafetería UCSD - Vitrina Digital',
  description: 'Consulta disponibilidad y retira sin hacer doble fila',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body>{children}</body>
    </html>
  );
}
