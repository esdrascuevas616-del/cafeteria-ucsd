import './globals.css';

export const metadata = {
  title: 'Cafetería UCSD • Vitrina Digital',
  description: 'Consulta disponibilidad en vivo y retira sin hacer doble fila en UCSD',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
