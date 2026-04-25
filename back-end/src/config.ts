export const config = {
  port: Number(process.env.PORT ?? 3000),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  initialCashCents: 1_000_000 * 100,
}
