# Technology choices

- **Next.js** provides the application routes and server-side API handlers in one project. Route handlers keep authorization and database operations on the server.
- **TypeScript** gives the frontend and route handlers explicit shapes for sessions, request validation, and serialized report data.
- **PostgreSQL** stores relational entities whose foreign keys and constraints protect market, crop, lot, demand, sale, and payment relationships. Parameterized queries are used by the application data layer.
- **MongoDB** stores flexible quality-observation measurement documents. Application validation constrains grades and measurement structure; routes enforce ownership because the document references PostgreSQL lots without cross-store foreign keys.
- **Auth.js (NextAuth)** provides session-based authentication. Application roles (`ADMIN`, `FARMER`, `BUYER`) govern route access; they are not PostgreSQL roles and do not replace database-level privileges.

The application uses both PostgreSQL and MongoDB because the project models strongly related transactions in SQL and variable quality measurements as documents. Cross-database consistency is enforced by application logic and requires integration testing; the two stores do not share a transaction.
