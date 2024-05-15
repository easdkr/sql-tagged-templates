import { pipe } from "fp-ts/lib/function";
import { flatten, zip, reduce, map, concat } from "fp-ts/lib/ReadonlyArray";
import { Client } from "pg";
import escapeString from "escape-sql-string";

const client = new Client({
  user: "postgres",
  host: "localhost",
  database: "postgres",
  password: "postgres",
});

class Tsql {
  constructor(
    private readonly strings: TemplateStringsArray,
    private readonly values: (string | Date | number | Tsql)[]
  ) {}

  public getSql = (): string =>
    pipe(
      this.values,
      map(this.paramFormat),
      concat([""]),
      (params) => zip(this.strings.raw, params),
      flatten,
      reduce("", (acc, s) => acc + s)
    );

  private paramFormat<T>(v: T) {
    switch (typeof v) {
      case "string":
        return escapeString(v);
      case "number":
        return v.toString();
      case "object":
        if (v === null) {
          return "NULL";
        } else if (v instanceof Date) {
          return `'${v.toISOString()}'`;
        } else if (v instanceof Tsql) {
          return v.getSql();
        } else {
          throw new Error(`Unsupported object type: ${typeof v}`);
        }
      default:
        throw new Error(`Unsupported type: ${typeof v}`);
    }
  }
}

const sql = (
  strings: TemplateStringsArray,
  ...values: (string | Date | number | Tsql)[]
) => new Tsql(strings, values);

async function bootstrap() {
  await client.connect();

  const query = sql`
    SELECT 
      count(*)
    FROM
      posts
    WHERE
      created_at > ${new Date("2024-01-01")}
  `;
  console.log("정상 쿼리", query.getSql());

  const sqlInjection = sql`
    SELECT
      *
    FROM
      posts
    WHERE
      title = ${`'; DROP TABLE posts; --`}
  `;
  console.log("공격 쿼리", sqlInjection.getSql());

  const nestedSql = sql`
    SELECT
      *
    FROM
      posts
    WHERE
      author_id IN (${sql`
        SELECT
          id
        FROM
          users
        WHERE
          id = 1
      `})
  `;
  console.log("중첩 쿼리", nestedSql.getSql());

  await client
    .query(sqlInjection.getSql())
    .then((res) => res.rows)
    .then(console.log);

  await client
    .query(nestedSql.getSql())
    .then((res) => res.rows)
    .then(console.log);
}

await bootstrap().finally(async () => {
  await client.end();
});
