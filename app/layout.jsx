export const metadata = { title: "VITALITY – הודעות וואטסאפ למאמנים" };

export default function RootLayout({ children }) {
  return (
    <html lang="he" dir="rtl">
      <body style={{ background: "#f7f7f8", fontFamily: "system-ui, sans-serif" }}>{children}</body>
    </html>
  );
}
