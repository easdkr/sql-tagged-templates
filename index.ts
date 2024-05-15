import { pipe } from "fp-ts/lib/function";
import { flatten, zip, reduce, map, concatW } from "fp-ts/lib/ReadonlyArray";
import { Client } from "pg";
import escapeString from "escape-sql-string";
import { fold, fromNullable } from "fp-ts/lib/Option";

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
      map(this.format),
      concatW([""]),
      (params) => zip(this.strings.raw, params),
      flatten,
      reduce("", (acc, s) => acc + s)
    );

  private format = <T>(v: T): string | number =>
    pipe(
      fromNullable(v),
      fold(
        () => "NULL",
        (value) => {
          switch (typeof value) {
            case "string":
              return escapeString(value);
            case "number":
              return value;
            case "object":
              if (value instanceof Date) return `'${value.toISOString()}'`;
              else if (value instanceof Tsql) return value.getSql();
              else throw new Error(`Unsupported object type: ${typeof value}`);
            default:
              throw new Error(`Unsupported type: ${value}`);
          }
        }
      )
    );
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
      count(*)
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
