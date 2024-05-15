# Prisma kysely playground

To install dependencies:

```bash
bun install
```

To create the database:

```bash
docker compose up -d
```

To sink the database with prisma:

```bash
bun db:push
```

To generate the prisma client:

```bash
bun db:generate
```

To seed:

```bash
bun db:seed
```

To run:

```bash
bun start
```
