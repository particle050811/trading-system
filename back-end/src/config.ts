const isDev = process.env.NODE_ENV !== 'production'

export const config = {
  port: Number(process.env.PORT ?? 3000),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  initialCashCents: 1_000_000 * 100,
  seedDevUsers: isDev
    ? [
        { username: 'root', password: '123456' },
        { username: 'alice', password: 'alice' },
        { username: 'bob', password: 'bob' },
      ]
    : [],
}
